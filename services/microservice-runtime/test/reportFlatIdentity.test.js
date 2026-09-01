import assert from "node:assert/strict";
import test from "node:test";

process.env.USE_DEMO_DATA = "true";

const {
  buildOverviewFromDataset,
  buildReportsFromRecords,
} = await import("../src/services/reportService.js");

test("reports keep the display flat number but expose the canonical database flat id", () => {
  const dataset = buildReportsFromRecords({
    apartmentItems: [
      {
        apartment_id: "11806001",
        flat_id: "31806010",
        flat_number: "C21",
        res_name: "Resident",
        res_email: "resident@example.com",
      },
    ],
    deviceItems: [
      {
        apartment_id: "11806001",
        flat_id: "C21",
        device_id: "C21-KITCHEN",
      },
    ],
    flowRecords: [],
    now: new Date("2026-09-01T00:00:00Z"),
  });
  const overview = buildOverviewFromDataset(dataset);
  const flat = overview.flatDetails.find((entry) => entry.flat_id === "C21");

  assert.ok(flat);
  assert.equal(flat.flat_number, "C21");
  assert.equal(flat.bill_flat_id, "31806010");
});
