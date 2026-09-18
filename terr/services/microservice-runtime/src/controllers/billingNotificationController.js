import {
  getBillingCycle,
  getCurrentBillingCycle,
  getAllActiveFlats,
  getFlatById,
  getFlatByEmail,
  getReadingsForFlat,
  getReadingsForCycle,
} from "../services/dynamo.service.js";

import {
  createJob,
  getJob,
  updateJob,
  markJobDone,
  markJobFailed,
  recordMailError,
  incrementSent,
} from "../services/jobStore.service.js";

import { sendBillMail, generateBillHTML } from "../mailer/mailer.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Assemble the billData object expected by generateBillHTML / sendBillMail.
 */
function buildBillData({ flat, readings, cycle, billId }) {
  const today = new Date();
  const issue_date = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // Ensure due_date is always after issue_date.
  // Use the cycle's due date if it's still in the future; otherwise default to 7 days from today.
  const cycleDue = cycle.dueDate ? new Date(cycle.dueDate) : null;
  const dueDate = cycleDue && cycleDue > today
    ? cycleDue
    : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const due_date = dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return {
    bill_start_date: cycle.startDate,
    bill_end_date: cycle.endDate,
    res_name: flat.residentName,
    bill_id: billId,
    issue_date,
    due_date,
    flat_no: `${flat.block ?? ""} ${flat.flatNo ?? flat.flatId}`.trim(),
    inlet_num: flat.inletCount ?? 5,
    inst_num: flat.installedMeters ?? 5,
    active_num: flat.activeMeters ?? 5,
    inlets: readings.inlets ?? {},
    tariff_per_kl: cycle.tariffPerKL,
    leakage: readings.leakage ?? {},
    leakage_penalty_per_l: cycle.leakagePenaltyPerL ?? 0,
    prev_consumed: readings.prevConsumed ?? 0,
    prev_charges: readings.prevCharges ?? 0,
    total_amount_due: null,                        // auto-calculated in template
    society_legal_name: cycle.societyInfo?.legalName ?? "Society",
    app_name: cycle.societyInfo?.appName ?? "MyGate",
    society_bank: cycle.societyInfo?.bank ?? "",
    society_acc_no: cycle.societyInfo?.accNo ?? "",
    society_ifsc: cycle.societyInfo?.ifsc ?? "",
  };
}

/** Sequential send with concurrency limit to avoid SMTP rate-limits */
async function sendWithConcurrency(tasks, concurrency = 5) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    results.push(...batchResults);
  }
  return results;
}

// ─── POST /api/bills/send-bulk ─────────────────────────────────────────────

/**
 * Body: { cycleId: string, apartment_id?: string, concurrency?: number, flatIds?: string[] }
 *
 * Responds immediately with a jobId, then processes in the background.
 * Poll GET /api/bills/status/:jobId for progress.
 */
export async function sendBulkBills(req, res) {
  const {
    cycleId,
    apartment_id,
    apartmentId = apartment_id,
    concurrency = 5,
    flatIds = [],
  } = req.body || {};
  const requestedFlatIds = Array.isArray(flatIds)
    ? new Set(flatIds.map((flatId) => String(flatId).toLowerCase()))
    : new Set();
  const concurrencyLimit = Math.min(Math.max(Number(concurrency) || 5, 1), 10);

  if (!cycleId) {
    return res.status(400).json({ success: false, message: "cycleId is required" });
  }

  let cycle, flats;

  try {
    [cycle, flats] = await Promise.all([
      getBillingCycle(cycleId, apartmentId),
      getAllActiveFlats(apartmentId),
    ]);
    if (requestedFlatIds.size) {
      flats = flats.filter((flat) => requestedFlatIds.has(String(flat.flatId).toLowerCase()));
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  if (!flats.length) {
    return res.status(404).json({ success: false, message: "No active flats with email found" });
  }

  // Create job and return immediately
  const jobId = createJob(cycleId, flats.length);
  res.status(202).json({
    success: true,
    jobId,
    total: flats.length,
    message: `Bulk send started for ${flats.length} flats. Poll /api/bills/status/${jobId}`,
  });

  // ── Background processing ──────────────────────────────────────────────
  updateJob(jobId, { status: "running" });

  (async () => {
    try {
      // Batch-fetch all readings
      const flatIds = flats.map(f => f.flatId);
      const readings = await getReadingsForCycle(cycleId, flatIds, apartmentId);

      const tasks = flats.map((flat, idx) => async () => {
        const flatReadings = readings[flat.flatId];
        if (!flatReadings) {
          recordMailError(jobId, flat.flatId, flat.email, "No readings found");
          return;
        }

        const billId = `${cycleId}-${flat.flatId}`;
        const billData = buildBillData({ flat, readings: flatReadings, cycle, billId });

        try {
          await sendBillMail(flat.email, billData);
          incrementSent(jobId);
        } catch (err) {
          recordMailError(jobId, flat.flatId, flat.email, err.message);
        }
      });

      await sendWithConcurrency(tasks, concurrencyLimit);
      markJobDone(jobId);
    } catch (err) {
      markJobFailed(jobId, err.message);
    }
  })();
}

// ─── POST /api/bills/send/:flatId ──────────────────────────────────────────

/**
 * Body: { cycleId: string, apartment_id?: string }
 * Sends a bill to a single flat synchronously.
 */
export async function sendFlatBill(req, res) {
  const { flatId } = req.params;
  const { cycleId, apartment_id, apartmentId = apartment_id } = req.body || {};

  if (!cycleId) {
    return res.status(400).json({ success: false, message: "cycleId is required" });
  }

  try {
    const [flat, cycle, readings] = await Promise.all([
      getFlatById(flatId, apartmentId),
      getBillingCycle(cycleId, apartmentId),
      getReadingsForFlat(flatId, cycleId, apartmentId),
    ]);

    if (!flat.email) {
      return res.status(422).json({ success: false, message: `Flat ${flatId} has no registered email` });
    }

    const billId = `${cycleId}-${flatId}`;
    const billData = buildBillData({ flat, readings, cycle, billId });

    const info = await sendBillMail(flat.email, billData);

    return res.json({
      success: true,
      flatId,
      email: flat.email,
      messageId: info.messageId,
      message: `Bill sent to ${flat.email}`,
    });
  } catch (err) {
    console.error(`[sendFlatBill] ${flatId}:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── GET /api/bills/status/:jobId ──────────────────────────────────────────

export async function sendBillByEmail(req, res) {
  const { email, cycleId, apartment_id, apartmentId = apartment_id } = req.body || {};

  if (!email) {
    return res.status(400).json({ success: false, message: "email is required" });
  }

  try {
    const flat = await getFlatByEmail(email, apartmentId);
    const cycle = cycleId
      ? await getBillingCycle(cycleId, apartmentId)
      : await getCurrentBillingCycle(apartmentId);
    const readings = await getReadingsForFlat(flat.flatId, cycle.cycleId, apartmentId);
    const billId = `${cycle.cycleId}-${flat.flatId}`;
    const billData = buildBillData({ flat, readings, cycle, billId });
    const info = await sendBillMail(flat.email, billData);

    return res.json({
      success: true,
      flatId: flat.flatId,
      email: flat.email,
      cycleId: cycle.cycleId,
      messageId: info.messageId,
      message: `Bill sent to ${flat.email}`,
    });
  } catch (err) {
    console.error(`[sendBillByEmail] ${email}:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export function getBillStatus(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found" });
  }

  const progress = job.total > 0
    ? Math.round(((job.sent + job.failed) / job.total) * 100)
    : 0;

  return res.json({ success: true, ...job, progress });
}

// ─── GET /api/bills/preview/:flatId ───────────────────────────────────────

/**
 * Query: ?cycleId=...
 * Returns rendered HTML — useful for admin preview before sending.
 */
export async function previewBill(req, res) {
  const { flatId } = req.params;
  const { cycleId, apartment_id, apartmentId = apartment_id } = req.query;

  if (!cycleId) {
    return res.status(400).send("cycleId query param is required");
  }

  try {
    const [flat, cycle, readings] = await Promise.all([
      getFlatById(flatId, apartmentId),
      getBillingCycle(cycleId, apartmentId),
      getReadingsForFlat(flatId, cycleId, apartmentId),
    ]);

    const billId = `${cycleId}-${flatId}`;
    const billData = buildBillData({ flat, readings, cycle, billId });
    const html = generateBillHTML(billData);

    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    return res.status(500).send(`<pre>${err.message}</pre>`);
  }
}
