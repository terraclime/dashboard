import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
process.env.USE_DEMO_DATA = "true";

const { buildDashboardOverviewFromRecords, getDashboardOverview } = await import(
  "../src/services/dashboardService.js"
);
const { getReportsOverview, getFlatReport } = await import(
  "../src/services/reportService.js"
);
const { getLeakOverview } = await import("../src/services/leakService.js");
const { getBillingSummary } = await import("../src/services/billingService.js");
const {
  getLiveDataByDeviceId,
  ingestLiveData,
  LiveDataValidationError,
  resetLiveDataStore,
} = await import("../src/services/liveDataService.js");
const { demoUsers } = await import("../src/data/demoData.js");

const demoApartmentId = demoUsers[0].apartment_id;

describe("Demo service layer", () => {
  beforeEach(() => {
    resetLiveDataStore();
  });

  it("returns dashboard metrics", async () => {
    const overview = await getDashboardOverview(demoApartmentId);
    assert.ok(overview.Dashboard_Total_Devices > 0);
    assert.equal(overview.labels.length, overview.values.length);
    assert.deepEqual(
      overview.billing_cycles.map((cycle) => cycle.id),
      ["current", "previous-1", "previous-2"]
    );
    assert.equal(overview.cycle_series.current.isoLabels[0].endsWith("-01"), true);
    assert.ok(Array.isArray(overview.leakBreakdown));
  });

  it("builds dashboard metrics from apartment, device, and flow records", () => {
    const overview = buildDashboardOverviewFromRecords({
      apartmentId: "APT-1",
      now: new Date("2026-06-21T12:00:00Z"),
      apartmentItems: [
        {
          apartment_id: "APT-1",
          apartment_name: "Live Apartment",
          tariff_per_kl: 50,
        },
      ],
      deviceItems: [
        { apartment_id: "APT-1", device_id: "meter-1", flat_number: "A101" },
        { apartment_id: "APT-1", device_id: "meter-2", flat_number: "A102" },
        { apartment_id: "APT-1", device_id: "meter-3", flat_number: "B101" },
      ],
      flowRecords: [
        {
          apartment_id: "APT-1",
          device_id: "meter-1",
          timestamp: "2026-06-21T10:00:00Z",
          value_0: 1000,
          value_1: 500,
        },
        {
          apartment_id: "APT-1",
          device_id: "meter-2",
          timestamp: "2026-06-19T10:00:00Z",
          value_0: 300,
        },
        {
          apartment_id: "APT-1",
          device_id: "meter-1",
          timestamp: "2026-05-21T10:00:00Z",
          value_0: 999,
        },
      ],
    });

    assert.equal(overview.Dashboard_Total_Devices, 3);
    assert.equal(overview.Active_devices, 1);
    assert.equal(overview.Consumption_Total, 1800);
    assert.equal(overview.apartment.billing_cycle.period_start, "2026-06-01");
    assert.equal(overview.apartment.billing_cycle.period_end, "2026-06-30");
    assert.equal(overview.hourly_series.current["2026-06-21"].values[0], 1000);
    assert.equal(overview.hourly_series.current["2026-06-21"].values[1], 500);
  });

  it("returns report overview", async () => {
    const reports = await getReportsOverview(demoApartmentId);
    assert.ok(Object.keys(reports.blockConsumption).length > 0);
    assert.ok(reports.flatDetails.length > 0);
  });

  it("returns flat detail", async () => {
    const reports = await getReportsOverview(demoApartmentId);
    const flatId = reports.flatDetails[0].flat_id;
    const detail = await getFlatReport(flatId, demoApartmentId);
    assert.equal(detail.flat_id, flatId);
    assert.ok(detail.consumption_series.length > 0);
  });

  it("returns leak overview", async () => {
    const leaks = await getLeakOverview(demoApartmentId);
    assert.ok(leaks.summary.blocks.length > 0);
  });

  it("returns billing summary", async () => {
    const billing = await getBillingSummary(demoApartmentId);
    assert.ok(billing.per_flat.length > 0);
    assert.deepEqual(billing.per_flat_summary, billing.per_flat);
    assert.equal(billing.summary.total_flats, billing.per_flat.length);
    assert.ok(billing.total_consumption_litres > 0);
    assert.equal(
      billing.summary.total_consumption_litres,
      billing.total_consumption_litres
    );
    assert.equal(billing.summary.tariff_per_kl, billing.tariff_per_kl);
  });

  it("stores live device data", async () => {
    const payload = {
      device_id: "device-101",
      values: Array.from({ length: 24 }, (_, index) => index + 1),
    };

    const record = await ingestLiveData(payload);

    assert.equal(record.device_id, payload.device_id);
    assert.ok(record.timestamp);
    assert.equal(record.value_1, 1);
    assert.equal(record.value_24, 24);
    assert.deepEqual(getLiveDataByDeviceId(payload.device_id), record);
  });

  it("rejects invalid live device payloads", async () => {
    await assert.rejects(
      ingestLiveData({ device_id: "device-101", values: "bad-payload" }),
      LiveDataValidationError
    );
  });

  it("rejects live payloads without exactly 24 values", async () => {
    await assert.rejects(
      ingestLiveData({ device_id: "device-101", values: [1, 2, 3] }),
      LiveDataValidationError
    );
  });
});
