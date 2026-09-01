import assert from "node:assert/strict";
import test from "node:test";

import { generateBillHTML } from "../src/services/mailService.js";

const billData = {
  bill_start_date: "2026-08-01",
  bill_end_date: "2026-08-31",
  res_name: "Test Resident",
  bill_id: "AUG-A-101",
  issue_date: "31 Aug 2026",
  due_date: "07 Sep 2026",
  flat_no: "Block A 101",
  inlet_num: 2,
  inst_num: 2,
  active_num: 1,
  inlet_readings: [
    { label: "Kitchen", consumed: 1200, leaked: 5 },
    { label: "Master Bathroom", consumed: 800, leaked: 0 },
  ],
  tariff_per_kl: 50,
  leakage_penalty_per_l: 1,
  prev_consumed: 1900,
  prev_charges: 95,
  society_legal_name: "Example Residents Welfare Association",
  society_acc_name: "Example RWA Water Fund",
  society_bank: "Example Bank",
  society_acc_no: "1234567890",
  society_ifsc: "EXAM0001234",
};

test("renders tabulated details and apartment-specific inlet columns", () => {
  const html = generateBillHTML(billData);

  assert.match(html, /<th>Resident Name<\/th><td>Test Resident<\/td>/);
  assert.match(html, /<th>Kitchen<\/th><th>Master Bathroom<\/th><th>Total<\/th>/);
  assert.match(html, /<th>Total Water Consumed \(L\)<\/th><td>1,900<\/td>/);
  assert.doesNotMatch(html, /Bath 1|Bath 2|Bath 3/);
});

test("renders only the RWA bank destination", () => {
  const html = generateBillHTML(billData);

  assert.match(html, /directly to <strong>Example Residents Welfare Association<\/strong> \(your RWA\)/);
  assert.match(html, /<th>Beneficiary<\/th><td>Example RWA Water Fund<\/td>/);
  assert.match(html, /<th>Account No\.<\/th><td>1234567890<\/td>/);
  assert.doesNotMatch(html, /Via App|Utility section|Terraclime/);
});

test("asks the resident to contact the RWA when bank data is unavailable", () => {
  const html = generateBillHTML({
    ...billData,
    society_bank: "",
    society_acc_no: "",
    society_ifsc: "",
  });

  assert.match(html, /contact your RWA for its bank account details/);
});

test("shows missing prior-cycle readings as unavailable", () => {
  const html = generateBillHTML({
    ...billData,
    prev_consumed: null,
    prev_charges: null,
  });

  assert.match(html, /<th>Total Water Consumed \(L\)<\/th><td>No data<\/td>/);
  assert.match(html, /<th>Total Water Charges<\/th><td>No data<\/td>/);
});

test("preserves an explicit unassigned inlet instead of inventing locations", () => {
  const html = generateBillHTML({
    ...billData,
    inlet_num: 0,
    inst_num: 0,
    active_num: 0,
    inlet_readings: [{ label: "Unassigned inlet", consumed: 2000, leaked: 0 }],
  });

  assert.match(html, /<th>Unassigned inlet<\/th><th>Total<\/th>/);
  assert.doesNotMatch(html, /Bath 1|Bath 2|Bath 3|Utility/);
});
