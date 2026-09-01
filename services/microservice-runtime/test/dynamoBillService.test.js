import assert from "node:assert/strict";
import test from "node:test";

process.env.USE_DEMO_DATA = "true";

const { getFlatById, getReadingsForFlat } = await import(
  "../src/services/dynamo.service.js"
);

test("demo bill columns follow the flat's configured inlet meters", async () => {
  const flat = await getFlatById("A-101");
  const readings = await getReadingsForFlat("A-101", "2025-04-01");

  assert.equal(readings.inletReadings.length, flat.inletCount);
  assert.deepEqual(
    readings.inletReadings.map((reading) => reading.label),
    ["Kitchen", "Bathroom", "Utility"]
  );
  assert.equal(
    readings.inletReadings.reduce((sum, reading) => sum + reading.consumed, 0),
    9783
  );
  assert.equal(readings.prevConsumed, null);
  assert.equal(readings.prevCharges, null);
});
