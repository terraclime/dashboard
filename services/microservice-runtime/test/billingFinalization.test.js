import assert from "node:assert/strict";
import test from "node:test";

process.env.USE_DEMO_DATA = "true";

const { demoApartment } = await import("../src/data/demoData.js");
const { getReadingsForFlat } = await import("../src/services/dynamo.service.js");
const { normalizeIsoDateInTimezone } = await import("../src/services/dynamoUtils.service.js");
const {
  buildFinalizationId,
  createFinalization,
  getFinalization,
  resetDemoFinalizations,
  updateFinalizationEmail,
} = await import("../src/services/billingFinalization.service.js");
const { buildFinalizationPreview } = await import(
  "../src/controllers/billingNotificationController.js"
);
const {
  assignOccupancy,
  finalizeOccupancy,
  getDemoOccupancy,
  resetDemoOccupancies,
  updateCurrentOccupancy,
} = await import("../src/services/occupancy.service.js");

test.beforeEach(() => {
  resetDemoFinalizations();
  resetDemoOccupancies();
});

test("partial readings include only the inclusive tenant billing window", async () => {
  const flat = demoApartment.flats.find((entry) => entry.flat_id === "A-101");
  const expected = flat.daily_consumption
    .filter((entry) => entry.date >= "2025-04-01" && entry.date <= "2025-04-10")
    .reduce((sum, entry) => sum + entry.litres, 0);

  const readings = await getReadingsForFlat("A-101", "2025-04", demoApartment.apartment_id, {
    periodStart: "2025-04-01",
    periodEnd: "2025-04-10",
  });

  assert.equal(
    readings.inletReadings.reduce((sum, entry) => sum + entry.consumed, 0),
    expected
  );
  assert.equal(readings.hasReadings, true);
});

test("billing dates use the configured apartment timezone", () => {
  assert.equal(
    normalizeIsoDateInTimezone("2026-08-31T19:00:00.000Z", "Asia/Kolkata"),
    "2026-09-01"
  );
});

test("finalization preview uses the cutoff in the bill and authoritative totals", async () => {
  const preview = await buildFinalizationPreview({
    apartmentId: demoApartment.apartment_id,
    flatId: "A-101",
    cycleId: "2025-04",
    cutoffDate: "2025-04-10",
  });

  assert.equal(preview.periodStart, "2025-04-01");
  assert.equal(preview.periodEnd, "2025-04-10");
  assert.equal(preview.bill_data.bill_end_date, "2025-04-10");
  assert.equal(
    preview.total_amount,
    Number((preview.water_charge + preview.leakage_charge).toFixed(2))
  );
});

test("resident finalization is idempotent and email state can be retried", async () => {
  const snapshot = {
    apartmentId: "APT-1",
    flatId: "A-101",
    cycleId: "2025-04",
    cycleKey: "2025-04-01",
    residentEmail: "Resident@example.com",
    periodStart: "2025-04-01",
    periodEnd: "2025-04-10",
    consumption_litres: 1200,
    bill_data: { bill_id: "FINAL-1" },
  };
  const expectedId = buildFinalizationId(snapshot);

  const first = await createFinalization(snapshot);
  const duplicate = await createFinalization({ ...snapshot, periodEnd: "2025-04-11" });
  const failed = await updateFinalizationEmail(expectedId, "failed", { emailError: "SMTP down" });
  const sent = await updateFinalizationEmail(expectedId, "sent", { messageId: "mail-123" });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.item.periodEnd, "2025-04-10");
  assert.equal(failed.email_error, "SMTP down");
  assert.equal(sent.message_id, "mail-123");
  assert.equal((await getFinalization(expectedId)).email_status, "sent");
});

test("finalizing a tenant makes the flat vacant before a new occupancy is assigned", async () => {
  const flat = demoApartment.flats.find((entry) => entry.flat_id === "A-101");
  const preview = await buildFinalizationPreview({
    apartmentId: demoApartment.apartment_id,
    flatId: flat.flat_id,
    cycleId: "2025-04",
    cutoffDate: "2025-04-10",
  });

  const finalized = await finalizeOccupancy(preview);
  assert.equal(finalized.created, true);
  assert.equal(getDemoOccupancy(flat.flat_id).resident_status, "vacant");
  assert.equal(getDemoOccupancy(flat.flat_id).vacated_at, "2025-04-10");

  const assigned = await assignOccupancy({
    apartmentId: demoApartment.apartment_id,
    flatId: flat.flat_id,
    residentName: "New Resident",
    residentEmail: "resident1@example.com",
    residentContact: "+91 9000000000",
    startDate: "2025-04-11",
    expectedVacatedAt: "2025-04-10",
  });

  assert.equal(assigned.resident_status, "occupied");
  assert.equal(assigned.occupancy_start_date, "2025-04-11");
  assert.notEqual(assigned.occupancy_id, preview.occupancyId);
  assert.notEqual(
    buildFinalizationId({ ...preview, occupancyId: assigned.occupancy_id }),
    finalized.item.finalization_id
  );
});

test("tenant corrections preserve the occupancy identity", async () => {
  await finalizeOccupancy({
    apartmentId: demoApartment.apartment_id,
    flatId: "A-101",
    cycleId: "2025-04",
    cycleKey: "2025-04-01",
    occupancyId: "occ-old",
    residentEmail: "old@example.com",
    periodEnd: "2025-04-10",
  });
  const assigned = await assignOccupancy({
    apartmentId: demoApartment.apartment_id,
    flatId: "A-101",
    residentName: "New Resident",
    residentEmail: "new@example.com",
    residentContact: "",
    startDate: "2025-04-11",
    expectedVacatedAt: "2025-04-10",
  });
  const corrected = await updateCurrentOccupancy({
    apartmentId: demoApartment.apartment_id,
    flatId: "A-101",
    occupancyId: assigned.occupancy_id,
    residentName: "Corrected Name",
    residentEmail: "corrected@example.com",
    residentContact: "+91 9111111111",
  });

  assert.equal(corrected.occupancy_id, assigned.occupancy_id);
  assert.equal(corrected.resident_name, "Corrected Name");
  assert.equal(corrected.resident_email, "corrected@example.com");
});
