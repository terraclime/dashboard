import nodemailer from "nodemailer";

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const mailConfig = {
  dryRun: bool(process.env.MAIL_DRY_RUN, false),
  host: process.env.SMTP_HOST || "smtp.zeptomail.in",
  port: numberFromEnv(process.env.SMTP_PORT, 587),
  secure: bool(process.env.SMTP_SECURE, false),
  user: process.env.SMTP_USER || "emailapikey",
  pass: process.env.SMTP_PASS || process.env.ZEPTO_API_KEY || "",
  from: process.env.SMTP_FROM || '"Terraclime Billing" <notifications@terraclime.com>',
  testRecipient: process.env.BILL_TEST_RECIPIENT || "",
};

export const transporter = nodemailer.createTransport({
  host: mailConfig.host,
  port: mailConfig.port,
  secure: mailConfig.secure,
  auth: {
    user: mailConfig.user,
    pass: mailConfig.pass,
  },
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatNumber = (value) => {
  const number = Number(value || 0);
  return number === 0 ? "-" : number.toLocaleString("en-IN");
};

const formatMoney = (value) => `Rs. ${formatNumber(value)}`;

const formatOptionalNumber = (value) =>
  value === null || value === undefined ? "No data" : formatNumber(value);

const formatOptionalMoney = (value) =>
  value === null || value === undefined ? "No data" : formatMoney(value);

const LEGACY_INLETS = [
  ["kitchen", "Kitchen"],
  ["bath1", "Bath 1"],
  ["bath2", "Bath 2"],
  ["bath3", "Bath 3"],
  ["utility", "Utility"],
];

const normalizeInletReadings = (inletReadings, inlets, leakage) => {
  if (Array.isArray(inletReadings)) {
    const normalized = inletReadings.map((inlet, index) => ({
      label: inlet?.label || inlet?.location || `Inlet ${index + 1}`,
      consumed: Number(inlet?.consumed || 0),
      leaked: Number(inlet?.leaked || 0),
    }));

    return normalized.length
      ? normalized
      : [{ label: "No configured inlet", consumed: 0, leaked: 0 }];
  }

  const hasLegacyReadings = [...Object.keys(inlets || {}), ...Object.keys(leakage || {})].length > 0;
  return hasLegacyReadings
    ? LEGACY_INLETS.map(([key, label]) => ({
        label,
        consumed: Number(inlets?.[key] || 0),
        leaked: Number(leakage?.[key] || 0),
      }))
    : [{ label: "No configured inlet", consumed: 0, leaked: 0 }];
};

export function generateBillHTML(data) {
  const {
    bill_start_date,
    bill_end_date,
    res_name,
    bill_id,
    issue_date,
    due_date,
    flat_no,
    inlet_num,
    inst_num,
    active_num,
    inlets = {},
    inlet_readings,
    tariff_per_kl,
    leakage = {},
    leakage_penalty_per_l,
    prev_consumed,
    prev_charges,
    total_amount_due,
    society_legal_name,
    society_bank,
    society_acc_no,
    society_ifsc,
    society_acc_name,
  } = data;

  const meterReadings = normalizeInletReadings(inlet_readings, inlets, leakage);
  const inletLabels = meterReadings.map((inlet) => inlet.label);
  const consumed = meterReadings.map((inlet) => inlet.consumed);
  const leaked = meterReadings.map((inlet) => inlet.leaked);
  const totalConsumed = consumed.reduce((sum, value) => sum + value, 0);
  const totalLeaked = leaked.reduce((sum, value) => sum + value, 0);
  const tariff = consumed.map((value) => +((value * tariff_per_kl) / 1000).toFixed(2));
  const totalTariff = +tariff.reduce((sum, value) => sum + value, 0).toFixed(2);
  const penalty = leaked.map((value) => +(value * (leakage_penalty_per_l || 0)).toFixed(2));
  const totalPenalty = +penalty.reduce((sum, value) => sum + value, 0).toFixed(2);
  const totals = tariff.map((value, index) => +(value + penalty[index]).toFixed(2));
  const grandTotal = +(totalTariff + totalPenalty).toFixed(2);
  const amountDue = total_amount_due ?? grandTotal;
  const columns = (values) => values.map((value) => `<td>${formatNumber(value)}</td>`).join("");
  const tableColumnCount = inletLabels.length + 3;
  const beneficiary = society_acc_name || society_legal_name;
  const hasBankDetails = society_bank || society_acc_no || society_ifsc;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body{margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;font-size:13px;color:#222}
  .wrap{max-width:680px;margin:28px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.1)}
  .hdr{background:#1a6b3a;padding:22px 28px;color:#fff}
  .hdr h1{margin:0 0 4px;font-size:19px;letter-spacing:.4px}
  .hdr p{margin:0;font-size:12px;opacity:.85}
  .body{padding:24px 28px}
  .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a6b3a;border-bottom:2px solid #1a6b3a;padding-bottom:4px;margin:22px 0 12px}
  .box{background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:11px 13px}
  .lbl{font-size:10px;color:#666;margin-bottom:2px}
  .val{font-weight:700;color:#111;font-size:13px}
  .val.red{color:#c0392b}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
  th{background:#1a6b3a;color:#fff;padding:7px 5px;text-align:center;font-size:11px}
  th.l{text-align:left;padding-left:8px}
  td{padding:6px 5px;border-bottom:1px solid #eef0f2;text-align:center;vertical-align:middle}
  td.l{text-align:left;padding-left:8px}
  tr.sub td{background:#edf7f1;font-weight:700;color:#1a6b3a}
  tr.gap td{height:6px;background:#fff;border:none}
  tr.grd td{background:#1a6b3a;color:#fff;font-weight:700;font-size:12px}
  .info th{width:38%;text-align:left;padding-left:10px}
  .info td{text-align:left;padding-left:10px;font-weight:700}
  .info .due{color:#c0392b}
  .due-box{background:#fff8e1;border:1px solid #f0c040;border-radius:6px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin:20px 0 0}
  .due-box .dlbl{font-size:13px;color:#555}
  .due-box .damt{font-size:22px;font-weight:700;color:#1a6b3a}
  .ftr{background:#f0f4f8;padding:14px 28px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e2e8f0}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>Water Usage and Charge Report</h1>
    <p>Billing Period: <strong>${escapeHtml(bill_start_date)} - ${escapeHtml(bill_end_date)}</strong></p>
  </div>
  <div class="body">
    <div class="sec">Basic Information</div>
    <table class="info">
      <tbody>
        <tr><th>Resident Name</th><td>${escapeHtml(res_name)}</td></tr>
        <tr><th>Block and Flat</th><td>${escapeHtml(flat_no)}</td></tr>
        <tr><th>Bill No.</th><td>#${escapeHtml(bill_id)}</td></tr>
        <tr><th>Issued</th><td>${escapeHtml(issue_date)}</td></tr>
        <tr><th>Due</th><td class="due">${escapeHtml(due_date)}</td></tr>
        <tr><th>Inlet Meters</th><td>${escapeHtml(inlet_num)}</td></tr>
        <tr><th>Installed</th><td>${escapeHtml(inst_num)}</td></tr>
        <tr><th>Active</th><td>${escapeHtml(active_num)}</td></tr>
      </tbody>
    </table>

    <div class="sec">Water Consumption and Charges - Current Cycle</div>
    <table>
      <thead><tr><th class="l">Ref</th><th class="l">Details</th>${inletLabels
        .map((label) => `<th>${escapeHtml(label)}</th>`)
        .join("")}<th>Total</th></tr></thead>
      <tbody>
        <tr><td class="l">A</td><td class="l">Water Consumed (L)</td>${columns(consumed)}<td><strong>${formatNumber(totalConsumed)}</strong></td></tr>
        <tr><td class="l">B</td><td class="l">Tariff / KL</td><td colspan="${inletLabels.length}" style="text-align:left;padding-left:8px">${formatMoney(tariff_per_kl)} per KL</td><td>-</td></tr>
        <tr class="sub"><td class="l">C</td><td class="l">Total Water Tariff</td>${columns(tariff)}<td>${formatMoney(totalTariff)}</td></tr>
        <tr class="gap"><td colspan="${tableColumnCount}"></td></tr>
        <tr><td class="l">D</td><td class="l">Leakage Detected (L)</td>${columns(leaked)}<td><strong>${formatNumber(totalLeaked)}</strong></td></tr>
        <tr><td class="l">E</td><td class="l">Leakage Penalty / L</td><td colspan="${inletLabels.length}" style="text-align:left;padding-left:8px">${formatMoney(leakage_penalty_per_l)} per L</td><td>-</td></tr>
        <tr class="sub"><td class="l">F</td><td class="l">Total Leakage Penalty</td>${columns(penalty)}<td>${formatMoney(totalPenalty)}</td></tr>
        <tr class="gap"><td colspan="${tableColumnCount}"></td></tr>
        <tr class="grd"><td class="l">G</td><td class="l">Total Water Charge</td>${columns(totals)}<td>${formatMoney(grandTotal)}</td></tr>
      </tbody>
    </table>

    <div class="sec">Previous Billing Cycle</div>
    <table class="info">
      <tbody>
        <tr><th>Total Water Consumed (L)</th><td>${formatOptionalNumber(prev_consumed)}</td></tr>
        <tr><th>Total Water Charges</th><td>${formatOptionalMoney(prev_charges)}</td></tr>
      </tbody>
    </table>

    <div class="due-box">
      <div class="dlbl">Total Amount Due by <strong>${escapeHtml(due_date)}</strong></div>
      <div class="damt">${formatMoney(amountDue)}</div>
    </div>

    <div class="sec" style="margin-top:22px">Payment Instructions</div>
    <p style="margin:0 0 10px;font-size:13px;">
      Please pay <strong>${formatMoney(amountDue)}</strong> by <strong>${escapeHtml(due_date)}</strong>
      directly to <strong>${escapeHtml(society_legal_name)}</strong> (your RWA).
    </p>
    ${hasBankDetails ? `<table class="info">
      <tbody>
        <tr><th>Beneficiary</th><td>${escapeHtml(beneficiary)}</td></tr>
        <tr><th>Bank</th><td>${escapeHtml(society_bank)}</td></tr>
        <tr><th>Account No.</th><td>${escapeHtml(society_acc_no)}</td></tr>
        <tr><th>IFSC</th><td>${escapeHtml(society_ifsc)}</td></tr>
      </tbody>
    </table>` : `<div class="box">Please contact your RWA for its bank account details.</div>`}
  </div>
  <div class="ftr">This is a system-generated bill. For queries, contact your society management.</div>
</div>
</body>
</html>`;
}

export async function sendMail({ to, subject, text, html, from, cc, bcc, attachments }) {
  if (!to || !subject) throw new Error("sendMail: 'to' and 'subject' are required.");
  if (!text && !html) throw new Error("sendMail: provide at least one of 'text' or 'html'.");

  const recipients = mailConfig.testRecipient || to;

  if (mailConfig.dryRun) {
    console.log(`[mailService] Dry run: would send "${subject}" to ${recipients}`);
    return {
      accepted: [recipients],
      rejected: [],
      envelope: { from: from || mailConfig.from, to: recipients },
      messageId: `dry-run-${Date.now()}`,
    };
  }

  if (!mailConfig.pass) {
    throw new Error("SMTP credentials are missing. Set SMTP_PASS or ZEPTO_API_KEY.");
  }

  const info = await transporter.sendMail({
    from: from || mailConfig.from,
    to: recipients,
    subject,
    ...(text && { text }),
    ...(html && { html }),
    ...(cc && { cc }),
    ...(bcc && { bcc }),
    ...(attachments && { attachments }),
  });

  console.log(`[mailService] Email sent: ${info.messageId}`);
  return info;
}

export async function sendBillMail(to, billData) {
  return sendMail({
    to,
    subject: `Water Bill #${billData.bill_id} - Due ${billData.due_date}`,
    html: generateBillHTML(billData),
  });
}
