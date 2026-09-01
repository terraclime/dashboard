import {
  getBillingCycle,
  getCurrentBillingCycle,
  getAllActiveFlats,
  getFlatById,
  getFlatByEmail,
  getReadingsForFlat,
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
import {
  getFinalization,
  listFinalizations,
  updateFinalizationEmail,
} from "../services/billingFinalization.service.js";
import {
  assignOccupancy,
  finalizeOccupancy,
  updateCurrentOccupancy,
} from "../services/occupancy.service.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Assemble the billData object expected by generateBillHTML / sendBillMail.
 */
export function buildBillData({ flat, readings, cycle, billId }) {
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
    inlet_readings: readings.inletReadings ?? [],
    tariff_per_kl: cycle.tariffPerKL,
    leakage: readings.leakage ?? {},
    leakage_penalty_per_l: cycle.leakagePenaltyPerL ?? 0,
    prev_consumed: readings.prevConsumed ?? null,
    prev_charges: readings.prevCharges ?? null,
    total_amount_due: null,                        // auto-calculated in template
    society_legal_name: cycle.societyInfo?.legalName ?? "Society",
    society_bank: cycle.societyInfo?.bank ?? "",
    society_acc_no: cycle.societyInfo?.accNo ?? "",
    society_ifsc: cycle.societyInfo?.ifsc ?? "",
    society_acc_name: cycle.societyInfo?.accountName ?? "",
  };
}

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizeDate = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : "";
};
const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const getTodayInBillingTimezone = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.APARTMENT_TIME_ZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const summarizeBill = (billData) => {
  const inletReadings = billData.inlet_readings || [];
  const consumptionLitres = inletReadings.reduce(
    (sum, reading) => sum + Number(reading.consumed || 0),
    0
  );
  const leakageLitres = inletReadings.reduce(
    (sum, reading) => sum + Number(reading.leaked || 0),
    0
  );
  const waterCharge = Number(
    ((consumptionLitres / 1000) * Number(billData.tariff_per_kl || 0)).toFixed(2)
  );
  const leakageCharge = Number(
    (leakageLitres * Number(billData.leakage_penalty_per_l || 0)).toFixed(2)
  );

  return {
    consumption_litres: Math.round(consumptionLitres),
    leakage_litres: Math.round(leakageLitres),
    water_charge: waterCharge,
    leakage_charge: leakageCharge,
    total_amount: Number((waterCharge + leakageCharge).toFixed(2)),
  };
};

const validateFinalizationInput = ({ apartmentId, cycle, cutoffDate }) => {
  if (!apartmentId) throw Object.assign(new Error("apartment_id is required"), { statusCode: 400 });
  if (!cutoffDate) throw Object.assign(new Error("cutoff_date must be YYYY-MM-DD"), { statusCode: 400 });
  if (!cycle?.startDate || !cycle?.endDate) {
    throw Object.assign(new Error("Billing cycle dates are unavailable"), { statusCode: 422 });
  }
  if (cutoffDate < cycle.startDate || cutoffDate > cycle.endDate) {
    throw Object.assign(
      new Error(`cutoff_date must be between ${cycle.startDate} and ${cycle.endDate}`),
      { statusCode: 422 }
    );
  }
  if (cutoffDate > getTodayInBillingTimezone()) {
    throw Object.assign(new Error("cutoff_date cannot be in the future"), { statusCode: 422 });
  }
};

export async function buildFinalizationPreview({ apartmentId, flatId, cycleId, cutoffDate }) {
  if (!cycleId) throw Object.assign(new Error("cycleId is required"), { statusCode: 400 });
  const normalizedCutoff = normalizeDate(cutoffDate);
  const [flat, cycle] = await Promise.all([
    getFlatById(flatId, apartmentId),
    getBillingCycle(cycleId, apartmentId),
  ]);
  if (flat.residentStatus === "vacant") {
    throw Object.assign(new Error(`Flat ${flatId} is already vacant`), { statusCode: 409 });
  }
  if (!flat.email) {
    throw Object.assign(new Error(`Flat ${flatId} has no registered email`), { statusCode: 422 });
  }

  const finalizations = await listFinalizations(apartmentId, cycle.startDate);
  const periodStart = getResidentPeriodStart(finalizations, flat, cycle.startDate);
  const residentCycle = { ...cycle, startDate: periodStart };
  validateFinalizationInput({ apartmentId, cycle: residentCycle, cutoffDate: normalizedCutoff });

  const readings = await getReadingsForFlat(flatId, cycle.cycleId, apartmentId, {
    periodStart,
    periodEnd: normalizedCutoff,
  });
  if (!readings.hasReadings) {
    throw Object.assign(
      new Error(`No meter readings were found for flat ${flatId} in the selected period`),
      { statusCode: 422 }
    );
  }
  const billId = `FINAL-${cycle.cycleId}-${flatId}`;
  const finalCycle = { ...cycle, startDate: periodStart, endDate: normalizedCutoff };
  const billData = buildBillData({ flat, readings, cycle: finalCycle, billId });

  return {
    apartmentId,
    flatId: flat.flatId,
    cycleId: cycle.cycleId,
    cycleKey: cycle.startDate,
    residentName: flat.residentName,
    residentEmail: flat.email,
    residentContact: flat.residentContact || "",
    occupancyId: flat.occupancyId,
    persistedOccupancyId: flat.persistedOccupancyId || "",
    occupancyStartDate: flat.occupancyStartDate || "",
    flatNumber: flat.flatNo || flat.flatId,
    block: flat.block || "",
    periodStart,
    periodEnd: normalizedCutoff,
    tariffPerKL: cycle.tariffPerKL,
    leakagePenaltyPerL: cycle.leakagePenaltyPerL || 0,
    ...summarizeBill(billData),
    inlet_readings: readings.inletReadings || [],
    bill_data: billData,
  };
}

const finalizationMatchesOccupancy = (item, flat) => {
  if (item.occupancyId && flat.occupancyId) return item.occupancyId === flat.occupancyId;
  if (flat.occupancyStartDate && item.periodEnd && item.periodEnd < flat.occupancyStartDate) return false;
  return normalizeEmail(item.residentEmail) === normalizeEmail(flat.email);
};

const matchingFinalization = (finalizations, flat) =>
  finalizations.find(
    (item) =>
      String(item.flatId).toLowerCase() === String(flat.flatId).toLowerCase() &&
      finalizationMatchesOccupancy(item, flat)
  );

const getResidentPeriodStart = (finalizations, flat, cycleStart) => {
  if (flat.occupancyStartDate) {
    return [cycleStart, flat.occupancyStartDate].sort().at(-1);
  }
  const latestOtherResident = finalizations
    .filter(
      (item) =>
        String(item.flatId).toLowerCase() === String(flat.flatId).toLowerCase() &&
        !finalizationMatchesOccupancy(item, flat)
    )
    .sort((left, right) => String(left.periodEnd).localeCompare(String(right.periodEnd)))
    .at(-1);
  return latestOtherResident ? addDays(latestOtherResident.periodEnd, 1) : cycleStart;
};

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

  let cycle, flats, finalizations;

  try {
    [cycle, flats] = await Promise.all([
      getBillingCycle(cycleId, apartmentId),
      getAllActiveFlats(apartmentId),
    ]);
    finalizations = await listFinalizations(apartmentId, cycle.startDate);
    flats = flats.filter((flat) => !matchingFinalization(finalizations, flat));
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
      const tasks = flats.map((flat) => async () => {
        const periodStart = getResidentPeriodStart(finalizations, flat, cycle.startDate);
        const flatReadings = await getReadingsForFlat(flat.flatId, cycle.cycleId, apartmentId, {
          periodStart,
          periodEnd: cycle.endDate,
        });

        const billId = `${cycleId}-${flat.flatId}`;
        const billData = buildBillData({
          flat,
          readings: flatReadings,
          cycle: { ...cycle, startDate: periodStart },
          billId,
        });

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
    const [flat, cycle] = await Promise.all([
      getFlatById(flatId, apartmentId),
      getBillingCycle(cycleId, apartmentId),
    ]);
    if (flat.residentStatus === "vacant") {
      return res.status(409).json({ success: false, message: `Flat ${flatId} is vacant` });
    }
    const finalizations = await listFinalizations(apartmentId, cycle.startDate);

    if (matchingFinalization(finalizations, flat)) {
      return res.status(409).json({ success: false, message: `Flat ${flatId}'s current resident is finalized` });
    }

    if (!flat.email) {
      return res.status(422).json({ success: false, message: `Flat ${flatId} has no registered email` });
    }

    const periodStart = getResidentPeriodStart(finalizations, flat, cycle.startDate);
    const readings = await getReadingsForFlat(flatId, cycleId, apartmentId, {
      periodStart,
      periodEnd: cycle.endDate,
    });

    const billId = `${cycleId}-${flatId}`;
    const billData = buildBillData({ flat, readings, cycle: { ...cycle, startDate: periodStart }, billId });

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
    if (flat.residentStatus === "vacant") {
      return res.status(409).json({ success: false, message: `Flat ${flat.flatId} is vacant` });
    }
    const cycle = cycleId
      ? await getBillingCycle(cycleId, apartmentId)
      : await getCurrentBillingCycle(apartmentId);
    const finalizations = await listFinalizations(apartmentId, cycle.startDate);
    if (matchingFinalization(finalizations, flat)) {
      return res.status(409).json({ success: false, message: `Flat ${flat.flatId}'s current resident is finalized` });
    }
    const periodStart = getResidentPeriodStart(finalizations, flat, cycle.startDate);
    const readings = await getReadingsForFlat(flat.flatId, cycle.cycleId, apartmentId, {
      periodStart,
      periodEnd: cycle.endDate,
    });
    const billId = `${cycle.cycleId}-${flat.flatId}`;
    const billData = buildBillData({ flat, readings, cycle: { ...cycle, startDate: periodStart }, billId });
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

export async function previewFinalization(req, res) {
  const { flatId } = req.params;
  const { apartment_id, apartmentId = apartment_id, cycleId, cutoff_date } = req.query;

  try {
    const preview = await buildFinalizationPreview({
      apartmentId,
      flatId,
      cycleId,
      cutoffDate: cutoff_date,
    });
    const existing = matchingFinalization(
      await listFinalizations(apartmentId, preview.cycleKey),
      {
        flatId: preview.flatId,
        email: preview.residentEmail,
        occupancyId: preview.occupancyId,
        occupancyStartDate: preview.occupancyStartDate,
      }
    );
    return res.json({ success: true, preview, existing_finalization: existing || null });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function finalizeTenantBill(req, res) {
  const { flatId } = req.params;
  const { apartment_id, apartmentId = apartment_id, cycleId, cutoff_date } = req.body || {};

  try {
    const preview = await buildFinalizationPreview({
      apartmentId,
      flatId,
      cycleId,
      cutoffDate: cutoff_date,
    });
    const { item, created } = await finalizeOccupancy(preview);

    if (!created) {
      return res.status(409).json({
        success: false,
        finalization: item,
        message: "This resident has already been finalized for the billing cycle.",
      });
    }

    try {
      const info = await sendBillMail(item.residentEmail, item.bill_data);
      const finalization = await updateFinalizationEmail(item.finalization_id, "sent", {
        messageId: info.messageId,
      });
      return res.status(201).json({
        success: true,
        finalization,
        message: `Final bill sent to ${item.residentEmail}`,
      });
    } catch (mailError) {
      const finalization = await updateFinalizationEmail(item.finalization_id, "failed", {
        emailError: mailError.message,
      });
      return res.status(502).json({
        success: false,
        finalized: true,
        finalization,
        message: "Tenant billing was finalized, but the email could not be sent.",
      });
    }
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

const validateResidentDetails = ({ residentName, residentEmail }) => {
  if (!String(residentName || "").trim()) {
    throw Object.assign(new Error("resident_name is required"), { statusCode: 400 });
  }
  const email = String(residentEmail || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("A valid resident_email is required"), { statusCode: 400 });
  }
};

export async function assignFlatOccupancy(req, res) {
  const { flatId } = req.params;
  const {
    apartment_id,
    apartmentId = apartment_id,
    resident_name,
    resident_email,
    resident_contact = "",
    start_date,
  } = req.body || {};

  try {
    if (!apartmentId) throw Object.assign(new Error("apartment_id is required"), { statusCode: 400 });
    validateResidentDetails({ residentName: resident_name, residentEmail: resident_email });
    const flat = await getFlatById(flatId, apartmentId);
    if (flat.residentStatus !== "vacant" || !flat.vacatedAt) {
      throw Object.assign(new Error("Flat must be vacant before assigning a tenant."), { statusCode: 409 });
    }
    const startDate = normalizeDate(start_date);
    const earliestStart = addDays(flat.vacatedAt, 1);
    if (!startDate || startDate < earliestStart) {
      throw Object.assign(
        new Error(`start_date must be on or after ${earliestStart}`),
        { statusCode: 422 }
      );
    }

    const occupancy = await assignOccupancy({
      apartmentId,
      flatId,
      residentName: String(resident_name).trim(),
      residentEmail: String(resident_email).trim(),
      residentContact: String(resident_contact || "").trim(),
      startDate,
      expectedVacatedAt: flat.vacatedAt,
    });
    return res.status(201).json({ success: true, occupancy, message: `Tenant assigned to flat ${flatId}` });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function correctFlatOccupancy(req, res) {
  const { flatId } = req.params;
  const {
    apartment_id,
    apartmentId = apartment_id,
    occupancy_id,
    resident_name,
    resident_email,
    resident_contact = "",
  } = req.body || {};

  try {
    if (!apartmentId) throw Object.assign(new Error("apartment_id is required"), { statusCode: 400 });
    validateResidentDetails({ residentName: resident_name, residentEmail: resident_email });
    const flat = await getFlatById(flatId, apartmentId);
    if (flat.residentStatus !== "occupied") {
      throw Object.assign(new Error("Flat has no current tenant to update."), { statusCode: 409 });
    }
    if (occupancy_id && occupancy_id !== flat.occupancyId) {
      throw Object.assign(new Error("The current tenant changed. Refresh and try again."), { statusCode: 409 });
    }

    const occupancy = await updateCurrentOccupancy({
      apartmentId,
      flatId,
      occupancyId: flat.occupancyId,
      persistedOccupancyId: flat.persistedOccupancyId,
      expectedEmail: flat.email,
      residentName: String(resident_name).trim(),
      residentEmail: String(resident_email).trim(),
      residentContact: String(resident_contact || "").trim(),
    });
    return res.json({ success: true, occupancy, message: `Tenant details updated for flat ${flatId}` });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function retryFinalizationEmail(req, res) {
  try {
    const finalization = await getFinalization(req.params.finalizationId);
    if (!finalization) {
      return res.status(404).json({ success: false, message: "Finalization not found" });
    }
    if (finalization.email_status === "sent") {
      return res.status(409).json({ success: false, finalization, message: "Final bill email was already sent." });
    }

    try {
      const info = await sendBillMail(finalization.residentEmail, finalization.bill_data);
      const updated = await updateFinalizationEmail(finalization.finalization_id, "sent", {
        messageId: info.messageId,
      });
      return res.json({ success: true, finalization: updated, message: `Final bill sent to ${updated.residentEmail}` });
    } catch (mailError) {
      const updated = await updateFinalizationEmail(finalization.finalization_id, "failed", {
        emailError: mailError.message,
      });
      return res.status(502).json({ success: false, finalization: updated, message: "Email retry failed." });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
