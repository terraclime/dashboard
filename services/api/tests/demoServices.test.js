import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDashboardOverview } from "../src/services/dashboardService.js";
import { getReportsOverview, getFlatReport } from "../src/services/reportService.js";
import { getLeakOverview } from "../src/services/leakService.js";
import { getBillingSummary } from "../src/services/billingService.js";
import { demoUsers } from "../src/data/demoData.js";

const demoApartmentId = demoUsers[0].apartment_id;

describe("Demo service layer", () => {
  it("returns dashboard metrics", () => {
    const overview = getDashboardOverview(demoApartmentId);
    assert.ok(overview.Dashboard_Total_Devices > 0);
    assert.equal(overview.labels.length, overview.values.length);
  });

  it("returns report overview", () => {
    const reports = getReportsOverview(demoApartmentId);
    assert.ok(Object.keys(reports.blockConsumption).length > 0);
    assert.ok(reports.flatDetails.length > 0);
  });

  it("returns flat detail", () => {
    const reports = getReportsOverview(demoApartmentId);
    const flatId = reports.flatDetails[0].flat_id;
    const detail = getFlatReport(flatId, demoApartmentId);
    assert.equal(detail.flat_id, flatId);
    assert.ok(detail.consumption_series.length > 0);
  });

  it("returns leak overview", () => {
    const leaks = getLeakOverview(demoApartmentId);
    assert.ok(leaks.summary.blocks.length > 0);
  });

  it("returns billing summary", () => {
    const billing = getBillingSummary(demoApartmentId);
    assert.ok(billing.per_flat.length > 0);
    assert.ok(billing.total_consumption_litres > 0);
  });
});
