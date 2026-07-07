// import nodemailer from "nodemailer";

// // ─── SMTP Configuration ────────────────────────────────────────────────────

// const transporter = nodemailer.createTransport({
//   // host: "smtppro.zoho.in",
//   // port: 465,
//   // secure: true,
//   // auth: {
//   //   user: "notifications@terraclime.com",
//   //   pass: "y9HJMJGAAWeq",
//   // },
//   // tls: {
//   //   rejectUnauthorized: false,
//   // },
//   host: process.env.SMTP_HOST || "smtp.zeptomail.in",
//   port: Number(process.env.SMTP_PORT || 587),
//   //secure: ["1", "true", "yes", "on"].includes(String(process.env.SMTP_SECURE || "").toLowerCase()),
//   secure: false,  // ZeptoMail recommends STARTTLS on port 587
//   auth: {
//     user: "emailapikey",// ← always this exact string
//     pass: process.env.ZEPTO_API_KEY || "PHtE6r1fF73simB59xhW5fPuFcWjM4l6r+w1KwhP5dtHDqQGTE1WqNstlzG+qR0tUfFBQPaYwIM5s7yU5umFd2++Mj5NCWqyqK3sx/VYSPOZsbq6x00btVkYfkPZXIfme99p0yzQvNvYNA==",  // ← your Zepto API key
//   }
// });

// // ─── Bill HTML Template ────────────────────────────────────────────────────

// function generateBillHTML(data) {
//   const {
//     bill_start_date, bill_end_date,
//     res_name, bill_id, issue_date, due_date,
//     flat_no, inlet_num, inst_num, active_num,
//     inlets = {},
//     tariff_per_kl,
//     leakage = {},
//     leakage_penalty_per_l,
//     prev_consumed, prev_charges,
//     total_amount_due,
//     society_legal_name, app_name,
//     society_bank, society_acc_no, society_ifsc,
//   } = data;

//   const inletKeys   = ["kitchen", "bath1", "bath2", "bath3", "utility"];
//   const inletLabels = ["Kitchen", "Bath 1", "Bath 2", "Bath 3", "Utility"];

//   const consumed     = inletKeys.map(k => Number(inlets[k]  || 0));
//   const leaked       = inletKeys.map(k => Number(leakage[k] || 0));
//   const totalConsumed = consumed.reduce((s, v) => s + v, 0);
//   const totalLeaked   = leaked.reduce((s, v) => s + v, 0);

//   const tariff       = consumed.map(v => +(v * (tariff_per_kl / 1000)).toFixed(2));
//   const totalTariff  = +tariff.reduce((s, v) => s + v, 0).toFixed(2);

//   const penalty      = leaked.map(v => +(v * (leakage_penalty_per_l || 0)).toFixed(2));
//   const totalPenalty = +penalty.reduce((s, v) => s + v, 0).toFixed(2);

//   const totals       = tariff.map((t, i) => +(t + penalty[i]).toFixed(2));
//   const grandTotal   = +(totalTariff + totalPenalty).toFixed(2);
//   const amountDue    = total_amount_due ?? grandTotal;

//   const fmt  = (n) => (n === 0 ? "—" : Number(n).toLocaleString("en-IN"));
//   const cols = (arr) => arr.map(v => `<td>${fmt(v)}</td>`).join("");

//   return `<!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="UTF-8"/>
// <meta name="viewport" content="width=device-width,initial-scale=1"/>
// <style>
//   body{margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;font-size:13px;color:#222}
//   .wrap{max-width:680px;margin:28px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.1)}
//   .hdr{background:#1a6b3a;padding:22px 28px;color:#fff}
//   .hdr h1{margin:0 0 4px;font-size:19px;letter-spacing:.4px}
//   .hdr p{margin:0;font-size:12px;opacity:.85}
//   .body{padding:24px 28px}
//   .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a6b3a;border-bottom:2px solid #1a6b3a;padding-bottom:4px;margin:22px 0 12px}
//   .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
//   .box{background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:11px 13px}
//   .lbl{font-size:10px;color:#666;margin-bottom:2px}
//   .val{font-weight:700;color:#111;font-size:13px}
//   .val.red{color:#c0392b}
//   table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
//   th{background:#1a6b3a;color:#fff;padding:7px 5px;text-align:center;font-size:11px}
//   th.l{text-align:left;padding-left:8px}
//   td{padding:6px 5px;border-bottom:1px solid #eef0f2;text-align:center;vertical-align:middle}
//   td.l{text-align:left;padding-left:8px}
//   tr.sub td{background:#edf7f1;font-weight:700;color:#1a6b3a}
//   tr.gap td{height:6px;background:#fff;border:none}
//   tr.grd td{background:#1a6b3a;color:#fff;font-weight:700;font-size:12px}
//   .prev{display:grid;grid-template-columns:1fr 1fr;gap:10px}
//   .prev .box .val{font-size:15px}
//   .due-box{background:#fff8e1;border:1px solid #f0c040;border-radius:6px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin:20px 0 0}
//   .due-box .dlbl{font-size:13px;color:#555}
//   .due-box .damt{font-size:22px;font-weight:700;color:#1a6b3a}
//   .pay{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
//   .pay .box .method{font-weight:700;font-size:12px;color:#1a6b3a;margin-bottom:5px}
//   .pay .box .detail{font-size:12px;color:#444;line-height:1.6}
//   .ftr{background:#f0f4f8;padding:14px 28px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e2e8f0}
// </style>
// </head>
// <body>
// <div class="wrap">

//   <div class="hdr">
//     <h1>💧 Water Usage &amp; Charge Report</h1>
//     <p>Billing Period: <strong>${bill_start_date} — ${bill_end_date}</strong></p>
//   </div>

//   <div class="body">

//     <div class="sec">Basic Information</div>
//     <div class="grid3">
//       <div class="box">
//         <div class="lbl">Resident Name</div><div class="val">${res_name}</div>
//         <div class="lbl" style="margin-top:8px">Block &amp; Flat</div><div class="val">${flat_no}</div>
//       </div>
//       <div class="box">
//         <div class="lbl">Bill Number</div><div class="val">#${bill_id}</div>
//         <div class="lbl" style="margin-top:8px">Issued</div><div class="val">${issue_date}</div>
//         <div class="lbl" style="margin-top:8px">Due Date</div><div class="val red">${due_date}</div>
//       </div>
//       <div class="box">
//         <div class="lbl">Inlet Meters</div><div class="val">${inlet_num}</div>
//         <div class="lbl" style="margin-top:8px">Installed</div><div class="val">${inst_num}</div>
//         <div class="lbl" style="margin-top:8px">Active</div><div class="val">${active_num}</div>
//       </div>
//     </div>

//     <div class="sec">Water Consumption &amp; Charges — Current Cycle</div>
//     <table>
//       <thead>
//         <tr>
//           <th class="l" style="width:90px">Ref</th>
//           <th class="l">Details</th>
//           ${inletLabels.map(l => `<th>${l}</th>`).join("")}
//           <th>Total</th>
//         </tr>
//       </thead>
//       <tbody>
//         <tr>
//           <td class="l">A</td>
//           <td class="l">Water Consumed (L)</td>
//           ${cols(consumed)}<td><strong>${fmt(totalConsumed)}</strong></td>
//         </tr>
//         <tr>
//           <td class="l">B</td>
//           <td class="l">Tariff / KL (₹)</td>
//           <td colspan="5" style="text-align:left;padding-left:8px">₹${tariff_per_kl} per KL</td>
//           <td>—</td>
//         </tr>
//         <tr class="sub">
//           <td class="l">C = A×(B/1000)</td>
//           <td class="l">Total Water Tariff (₹)</td>
//           ${cols(tariff)}<td>₹${fmt(totalTariff)}</td>
//         </tr>
//         <tr class="gap"><td colspan="8"></td></tr>
//         <tr>
//           <td class="l">D</td>
//           <td class="l">Leakage Detected (L)</td>
//           ${cols(leaked)}<td><strong>${fmt(totalLeaked)}</strong></td>
//         </tr>
//         <tr>
//           <td class="l">E</td>
//           <td class="l">Leakage Penalty / L (₹)</td>
//           <td colspan="5" style="text-align:left;padding-left:8px">₹${leakage_penalty_per_l} per L</td>
//           <td>—</td>
//         </tr>
//         <tr class="sub">
//           <td class="l">F = D×E</td>
//           <td class="l">Total Leakage Penalty (₹)</td>
//           ${cols(penalty)}<td>₹${fmt(totalPenalty)}</td>
//         </tr>
//         <tr class="gap"><td colspan="8"></td></tr>
//         <tr class="grd">
//           <td class="l">G = C + F</td>
//           <td class="l">Total Water Charge (₹)</td>
//           ${cols(totals)}<td>₹${fmt(grandTotal)}</td>
//         </tr>
//       </tbody>
//     </table>

//     <div class="sec">Previous Billing Cycle</div>
//     <div class="prev">
//       <div class="box">
//         <div class="lbl">Total Water Consumed (L)</div>
//         <div class="val">${fmt(prev_consumed)}</div>
//       </div>
//       <div class="box">
//         <div class="lbl">Total Water Charges (₹)</div>
//         <div class="val">₹${fmt(prev_charges)}</div>
//       </div>
//     </div>

//     <div class="due-box">
//       <div class="dlbl">Total Amount Due by <strong>${due_date}</strong></div>
//       <div class="damt">₹ ${fmt(amountDue)}</div>
//     </div>

//     <div class="sec" style="margin-top:22px">Payment Instructions</div>
//     <p style="margin:0 0 10px;font-size:13px;">
//       Please pay <strong>₹ ${fmt(amountDue)}</strong> by <strong>${due_date}</strong>
//       directly to <em>${society_legal_name}</em> to avoid late fees or penalties.
//     </p>
//     <div class="pay">
//       <div class="box">
//         <div class="method">📱 Via App</div>
//         <div class="detail">Pay using the "Utility" section on <strong>${app_name}</strong></div>
//       </div>
//       <div class="box">
//         <div class="method">🏦 Bank Transfer</div>
//         <div class="detail">
//           <strong>${society_bank}</strong><br/>
//           Acc No: ${society_acc_no}<br/>
//           IFSC: ${society_ifsc}
//         </div>
//       </div>
//     </div>

//   </div>

//   <div class="ftr">This is a system-generated bill. For queries, contact your society management.</div>
// </div>
// </body>
// </html>`;
// }

// // ─── Send Mail ─────────────────────────────────────────────────────────────

// async function sendMail({ to, subject, text, html, from, cc, bcc, attachments }) {
//   if (!to || !subject) throw new Error("sendMail: 'to' and 'subject' are required.");
//   if (!text && !html)  throw new Error("sendMail: provide at least one of 'text' or 'html'.");

//   const info = await transporter.sendMail({
//     from: from || '"No Reply" <notifications@terraclime.com>',
//     to,
//     subject,
//     ...(text        && { text }),
//     ...(html        && { html }),
//     ...(cc          && { cc }),
//     ...(bcc         && { bcc }),
//     ...(attachments && { attachments }),
//   });

//   console.log(`📧 Email sent: ${info.messageId}`);
//   return info;
// }

// // ─── Send Bill Mail ────────────────────────────────────────────────────────

// const OVERRIDE_RECIPIENT = "prasathnarayanan6@gmail.com";

// async function sendBillMail(to, billData) {
//   return sendMail({
//     to: OVERRIDE_RECIPIENT,
//     subject: `Water Bill #${billData.bill_id} — Due ${billData.due_date}`,
//     html: generateBillHTML(billData),
//   });
// }

// // // ─── Test / Manual Run ─────────────────────────────────────────────────────

// const testBillData = {
//   bill_start_date: "01 Jun 2025",
//   bill_end_date: "30 Jun 2025",
//   res_name: "Ravi Kumar",
//   bill_id: "1042",
//   issue_date: "01 Jul 2025",
//   due_date: "10 Jul 2025",
//   flat_no: "B-204",
//   inlet_num: 5,
//   inst_num: 5,
//   active_num: 5,

//   inlets: {
//     kitchen: 800,
//     bath1: 600,
//     bath2: 500,
//     bath3: 300,
//     utility: 200,
//   },

//   tariff_per_kl: 25,           // ₹25 per KL

//   leakage: {
//     kitchen: 10,
//     bath1: 0,
//     bath2: 5,
//     bath3: 0,
//     utility: 0,
//   },
//   leakage_penalty_per_l: 0.5,  // ₹0.50 per litre

//   prev_consumed: 2200,
//   prev_charges: 55,

//   total_amount_due: 60,        // optional override; remove to auto-calc

//   society_legal_name: "Green Valley Residents Association",
//   app_name: "TerraClime",
//   society_bank: "HDFC Bank",
//   society_acc_no: "1234567890",
//   society_ifsc: "HDFC0001234",
// };

// // Send the bill email
// sendBillMail(testBillData)
//   .then(info => console.log("✅ Done:", info.messageId))
//   .catch(err => console.error("❌ Error:", err.message));
// //export { transporter, sendMail, sendBillMail, generateBillHTML };


//version 2

import nodemailer from "nodemailer";

// ─── SMTP Configuration ────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.zeptomail.in",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: "emailapikey",
    pass: process.env.ZEPTO_API_KEY || "PHtE6r1fF73simB59xhW5fPuFcWjM4l6r+w1KwhP5dtHDqQGTE1WqNstlzG+qR0tUfFBQPaYwIM5s7yU5umFd2++Mj5NCWqyqK3sx/VYSPOZsbq6x00btVkYfkPZXIfme99p0yzQvNvYNA==",
  }
});

// ─── Bill HTML Template ────────────────────────────────────────────────────

function generateBillHTML(data) {
  const {
    bill_start_date, bill_end_date,
    res_name, bill_id, issue_date, due_date,
    flat_no, inlet_num, inst_num, active_num,
    inlets = {},
    tariff_per_kl,
    leakage = {},
    leakage_penalty_per_l,
    prev_consumed, prev_charges,
    total_amount_due,
    society_legal_name, app_name,
    society_bank, society_acc_no, society_ifsc,
  } = data;

  const inletKeys   = ["kitchen", "bath1", "bath2", "bath3", "utility"];
  const inletLabels = ["Kitchen", "Bath 1", "Bath 2", "Bath 3", "Utility"];

  const consumed      = inletKeys.map(k => Number(inlets[k]  || 0));
  const leaked        = inletKeys.map(k => Number(leakage[k] || 0));
  const totalConsumed = consumed.reduce((s, v) => s + v, 0);
  const totalLeaked   = leaked.reduce((s, v) => s + v, 0);

  const tariff       = consumed.map(v => +(v * (tariff_per_kl / 1000)).toFixed(2));
  const totalTariff  = +tariff.reduce((s, v) => s + v, 0).toFixed(2);

  const penalty      = leaked.map(v => +(v * (leakage_penalty_per_l || 0)).toFixed(2));
  const totalPenalty = +penalty.reduce((s, v) => s + v, 0).toFixed(2);

  const totals     = tariff.map((t, i) => +(t + penalty[i]).toFixed(2));
  const grandTotal = +(totalTariff + totalPenalty).toFixed(2);
  const amountDue  = total_amount_due ?? grandTotal;

  const fmt  = (n) => (n === 0 ? "—" : Number(n).toLocaleString("en-IN"));
  const cols = (arr) => arr.map(v => `<td>${fmt(v)}</td>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;font-size:13px;color:#222}
  .wrap{max-width:680px;margin:28px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.1)}
  .hdr{background:#1a6b3a;padding:22px 28px;color:#fff}
  .hdr h1{margin:0 0 4px;font-size:19px;letter-spacing:.4px}
  .hdr p{margin:0;font-size:12px;opacity:.85}
  .body{padding:24px 28px}
  .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a6b3a;border-bottom:2px solid #1a6b3a;padding-bottom:4px;margin:22px 0 12px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
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
  .prev{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .prev .box .val{font-size:15px}
  .due-box{background:#fff8e1;border:1px solid #f0c040;border-radius:6px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin:20px 0 0}
  .due-box .dlbl{font-size:13px;color:#555}
  .due-box .damt{font-size:22px;font-weight:700;color:#1a6b3a}
  .pay{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
  .pay .box .method{font-weight:700;font-size:12px;color:#1a6b3a;margin-bottom:5px}
  .pay .box .detail{font-size:12px;color:#444;line-height:1.6}
  .ftr{background:#f0f4f8;padding:14px 28px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e2e8f0}
</style>
</head>
<body>
<div class="wrap">

  <div class="hdr">
    <h1>💧 Water Usage &amp; Charge Report</h1>
    <p>Billing Period: <strong>${bill_start_date} — ${bill_end_date}</strong></p>
  </div>

  <div class="body">

    <div class="sec">Basic Information</div>
    <div class="grid3">
      <div class="box">
        <div class="lbl">Resident Name</div><div class="val">${res_name}</div>
        <div class="lbl" style="margin-top:8px">Block &amp; Flat</div><div class="val">${flat_no}</div>
      </div>
      <div class="box">
        <div class="lbl">Bill Number</div><div class="val">#${bill_id}</div>
        <div class="lbl" style="margin-top:8px">Issued</div><div class="val">${issue_date}</div>
        <div class="lbl" style="margin-top:8px">Due Date</div><div class="val red">${due_date}</div>
      </div>
      <div class="box">
        <div class="lbl">Inlet Meters</div><div class="val">${inlet_num}</div>
        <div class="lbl" style="margin-top:8px">Installed</div><div class="val">${inst_num}</div>
        <div class="lbl" style="margin-top:8px">Active</div><div class="val">${active_num}</div>
      </div>
    </div>

    <div class="sec">Water Consumption &amp; Charges — Current Cycle</div>
    <table>
      <thead>
        <tr>
          <th class="l" style="width:90px">Ref</th>
          <th class="l">Details</th>
          ${inletLabels.map(l => `<th>${l}</th>`).join("")}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="l">A</td>
          <td class="l">Water Consumed (L)</td>
          ${cols(consumed)}<td><strong>${fmt(totalConsumed)}</strong></td>
        </tr>
        <tr>
          <td class="l">B</td>
          <td class="l">Tariff / KL (₹)</td>
          <td colspan="5" style="text-align:left;padding-left:8px">₹${tariff_per_kl} per KL</td>
          <td>—</td>
        </tr>
        <tr class="sub">
          <td class="l">C = A×(B/1000)</td>
          <td class="l">Total Water Tariff (₹)</td>
          ${cols(tariff)}<td>₹${fmt(totalTariff)}</td>
        </tr>
        <tr class="gap"><td colspan="8"></td></tr>
        <tr>
          <td class="l">D</td>
          <td class="l">Leakage Detected (L)</td>
          ${cols(leaked)}<td><strong>${fmt(totalLeaked)}</strong></td>
        </tr>
        <tr>
          <td class="l">E</td>
          <td class="l">Leakage Penalty / L (₹)</td>
          <td colspan="5" style="text-align:left;padding-left:8px">₹${leakage_penalty_per_l} per L</td>
          <td>—</td>
        </tr>
        <tr class="sub">
          <td class="l">F = D×E</td>
          <td class="l">Total Leakage Penalty (₹)</td>
          ${cols(penalty)}<td>₹${fmt(totalPenalty)}</td>
        </tr>
        <tr class="gap"><td colspan="8"></td></tr>
        <tr class="grd">
          <td class="l">G = C + F</td>
          <td class="l">Total Water Charge (₹)</td>
          ${cols(totals)}<td>₹${fmt(grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <div class="sec">Previous Billing Cycle</div>
    <div class="prev">
      <div class="box">
        <div class="lbl">Total Water Consumed (L)</div>
        <div class="val">${fmt(prev_consumed)}</div>
      </div>
      <div class="box">
        <div class="lbl">Total Water Charges (₹)</div>
        <div class="val">₹${fmt(prev_charges)}</div>
      </div>
    </div>

    <div class="due-box">
      <div class="dlbl">Total Amount Due by <strong>${due_date}</strong></div>
      <div class="damt">₹ ${fmt(amountDue)}</div>
    </div>

    <div class="sec" style="margin-top:22px">Payment Instructions</div>
    <p style="margin:0 0 10px;font-size:13px;">
      Please pay <strong>₹ ${fmt(amountDue)}</strong> by <strong>${due_date}</strong>
      directly to <em>${society_legal_name}</em> to avoid late fees or penalties.
    </p>
    <div class="pay">
      <div class="box">
        <div class="method">📱 Via App</div>
        <div class="detail">Pay using the "Utility" section on <strong>${app_name}</strong></div>
      </div>
      <div class="box">
        <div class="method">🏦 Bank Transfer</div>
        <div class="detail">
          <strong>${society_bank}</strong><br/>
          Acc No: ${society_acc_no}<br/>
          IFSC: ${society_ifsc}
        </div>
      </div>
    </div>

  </div>

  <div class="ftr">This is a system-generated bill. For queries, contact your society management.</div>
</div>
</body>
</html>`;
}

// ─── Send Mail ─────────────────────────────────────────────────────────────

async function sendMail({ to, subject, text, html, from, cc, bcc, attachments }) {
  if (!to || !subject) throw new Error("sendMail: 'to' and 'subject' are required.");
  if (!text && !html)  throw new Error("sendMail: provide at least one of 'text' or 'html'.");

  const info = await transporter.sendMail({
    from: from || '"TerraClime" <notifications@terraclime.com>',
    to,
    subject,
    ...(text        && { text }),
    ...(html        && { html }),
    ...(cc          && { cc }),
    ...(bcc         && { bcc }),
    ...(attachments && { attachments }),
  });

  console.log(`📧 Email sent: ${info.messageId}`);
  return info;
}

// ─── Send Bill Mail ────────────────────────────────────────────────────────

// ✅ Changed: now sends to prasathnarayanan6@gmail.com
const RECIPIENT = "prasathnarayanan6@gmail.com";

async function sendBillMail(billData) {
  return sendMail({
    to: RECIPIENT,
    subject: `Water Bill #${billData.bill_id} — Due ${billData.due_date}`,
    html: generateBillHTML(billData),
  });
}

// ─── Test Data & Run ───────────────────────────────────────────────────────

const testBillData = {
  bill_start_date: "01 Jun 2025",
  bill_end_date: "30 Jun 2025",
  res_name: "Ravi Kumar",
  bill_id: "1042",
  issue_date: "01 Jul 2025",
  due_date: "10 Jul 2025",
  flat_no: "B-204",
  inlet_num: 5,
  inst_num: 5,
  active_num: 5,
  inlets: {
    kitchen: 800,
    bath1: 600,
    bath2: 500,
    bath3: 300,
    utility: 200,
  },
  tariff_per_kl: 25,
  leakage: {
    kitchen: 10,
    bath1: 0,
    bath2: 5,
    bath3: 0,
    utility: 0,
  },
  leakage_penalty_per_l: 0.5,
  prev_consumed: 2200,
  prev_charges: 55,
  total_amount_due: 60,
  society_legal_name: "Green Valley Residents Association",
  app_name: "TerraClime",
  society_bank: "HDFC Bank",
  society_acc_no: "1234567890",
  society_ifsc: "HDFC0001234",
};

// ✅ Run — sends bill to prasathnarayanan6@gmail.com
sendBillMail(testBillData)
  .then(info => console.log("✅ Done:", info.messageId))
  .catch(err  => console.error("❌ Error:", err.message));

export { transporter, sendMail, sendBillMail, generateBillHTML };