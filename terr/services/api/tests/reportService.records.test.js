import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.USE_DEMO_DATA = "true";

const {
  buildFlatReportFromDataset,
  buildOverviewFromDataset,
  buildReportsFromRecords,
} = await import("../src/services/reportService.js");

describe("Report record aggregation", () => {
  it("joins device_data to repeated 24-hour flow_data rows by device_id", () => {
    const oneLitreHours = Object.fromEntries(
      Array.from({ length: 24 }, (_, hour) => [`value_${hour}`, 1])
    );
    const twoLitreHours = Object.fromEntries(
      Array.from({ length: 24 }, (_, hour) => [`value_${hour}`, 2])
    );

    const dataset = buildReportsFromRecords({
      now: new Date("2026-06-18T12:00:00Z"),
      deviceItems: [
        {
          apartment_id: "APT-1",
          flat_number: "A12",
          device_id: "meter-a12-kitchen",
          inlet: "Kitchen",
        },
        {
          apartment_id: "APT-1",
          flat_number: "A12",
          device_id: "meter-a12-utility",
          inlet: "Utility",
        },
        {
          apartment_id: "APT-1",
          flat_number: "B11",
          device_id: "meter-b11-kitchen",
          inlet: "Kitchen",
        },
        {
          apartment_id: "APT-1",
          flat_number: "C234",
          device_id: "meter-c234-kitchen",
          inlet: "Kitchen",
        },
      ],
      apartmentItems: [
        {
          apartment_id: "APT-1",
          flat_number: "A12",
          res_name: "A Block Resident",
          res_email: "a12@example.com",
        },
      ],
      flowRecords: [
        {
          device_id: "meter-a12-kitchen",
          timestamp: "2026-06-18T00:00:00Z",
          ...oneLitreHours,
        },
        {
          device_id: "meter-a12-kitchen",
          timestamp: "2026-06-18T06:00:00Z",
          ...twoLitreHours,
        },
        {
          device_id: "meter-b11-kitchen",
          timestamp: "2026-06-17T11:59:00Z",
          value_0: 5,
        },
      ],
    });

    const overview = buildOverviewFromDataset(dataset);
    const inactiveByBlock = Object.fromEntries(
      overview.donutChartData.map((entry) => [entry.block, entry.inactiveDevices])
    );

    assert.equal(overview.blockConsumption.A, 72);
    assert.equal(overview.blockConsumption.B, 5);
    assert.equal(overview.blockConsumption.C, 0);
    assert.deepEqual(overview.flatHealthMap.A12, { active: 1, total: 2 });
    assert.deepEqual(
      overview.flatDetails.find((flat) => flat.flat_id === "A12"),
      {
        flat_id: "A12",
        block_id: "A",
        resident_name: "A Block Resident",
        resident_email: "a12@example.com",
        consumption: 72,
        active_devices: 1,
        total_devices: 2,
      }
    );
    assert.equal(inactiveByBlock.A, 1);
    assert.equal(inactiveByBlock.B, 1);
    assert.equal(inactiveByBlock.C, 1);
  });

  it("derives blocks from flat_number and marks stale devices inactive", () => {
    const dataset = buildReportsFromRecords({
      now: new Date("2026-06-18T12:00:00Z"),
      apartmentItems: [
        {
          apartment_id: "APT-1",
          flat_number: "c21",
          resident_name: "C Block Resident",
          resident_email: "c21@example.com",
          device_id: "meter-c21-kitchen",
          inlet: "Kitchen",
        },
        {
          apartment_id: "APT-1",
          flat_number: "d08",
          resident_name: "D Block Resident",
          device_id: "meter-d08-kitchen",
        },
      ],
      flowRecords: [
        {
          flat_number: "c21",
          device_id: "meter-c21-kitchen",
          timestamp: "2026-06-18T00:30:00Z",
          value_1: 10,
          value_2: 15,
        },
        {
          flat_number: "d08",
          device_id: "meter-d08-kitchen",
          timestamp: "2026-06-16T11:59:00Z",
          value_1: 8,
        },
      ],
    });

    const overview = buildOverviewFromDataset(dataset);
    assert.equal(overview.blockConsumption.C, 25);
    assert.equal(overview.blockConsumption.D, 8);
    assert.deepEqual(overview.flatHealthMap.c21, { active: 1, total: 1 });
    assert.deepEqual(overview.flatHealthMap.d08, { active: 0, total: 1 });
  });

  it("returns flat report device series from flow_data", () => {
    const dataset = buildReportsFromRecords({
      now: new Date("2026-06-18T12:00:00Z"),
      apartmentItems: [
        {
          flat_number: "c21",
          resident_name: "C Block Resident",
          device_id: "meter-c21-kitchen",
          inlet: "Kitchen",
        },
      ],
      flowRecords: [
        {
          flat_number: "c21",
          device_id: "meter-c21-kitchen",
          timestamp: "2026-06-18T00:30:00Z",
          value_1: 10,
          value_2: 15,
        },
      ],
    });

    const report = buildFlatReportFromDataset(dataset, "C21");
    assert.equal(report.flat_id, "c21");
    assert.equal(report.block_id, "C");
    assert.equal(report.totals.consumption, 25);
    assert.equal(report.device_consumption[0].data[0].litres, 25);
    assert.equal(report.device_status[0].status, "active");
  });
});
