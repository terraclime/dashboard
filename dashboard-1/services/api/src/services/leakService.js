import { demoApartment } from "../data/demoData.js";

const getApartmentSnapshot = (apartmentId) => {
  if (
    apartmentId &&
    apartmentId.toLowerCase() === demoApartment.apartment_id.toLowerCase()
  ) {
    return demoApartment;
  }
  return demoApartment;
};

const buildLeakSummary = (snapshot) => {
  const leakEvents = snapshot.flats.flatMap((flat) =>
    (flat.leak_events || []).map((event) => ({
      ...event,
      flat_id: flat.flat_id,
      block_id: flat.block_id,
    }))
  );

  const totalLeakVolume = leakEvents.reduce(
    (sum, event) => sum + (event.litres || 0),
    0
  );

  const blockMap = leakEvents.reduce((acc, event) => {
    const current = acc.get(event.block_id) || 0;
    acc.set(event.block_id, current + (event.litres || 0));
    return acc;
  }, new Map());

  const timelineMap = leakEvents.reduce((acc, event) => {
    const dateKey = event.timestamp?.slice(0, 10);
    if (!dateKey) return acc;
    const current = acc.get(dateKey) || 0;
    acc.set(dateKey, current + (event.litres || 0));
    return acc;
  }, new Map());

  const blocks = Array.from(blockMap.entries()).map(([block_id, litres]) => ({
    block_id,
    litres,
  }));

  const timeline = Array.from(timelineMap.entries())
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([date, litres]) => ({ date, litres }));

  return {
    total_leak_volume: totalLeakVolume,
    total_leaks_current_cycle: leakEvents.length,
    active_alerts: leakEvents.filter((event) => event.status !== "resolved")
      .length,
    blocks,
    timeline,
  };
};

export const getLeakOverview = (apartmentId) => {
  const snapshot = getApartmentSnapshot(apartmentId);

  const leakEvents = snapshot.flats.flatMap((flat) =>
    (flat.leak_events || []).map((event) => ({
      ...event,
      flat_id: flat.flat_id,
    }))
  );

  const sortedEvents = leakEvents.sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  return {
    summary: buildLeakSummary(snapshot),
    recent_events: sortedEvents.slice(-5),
  };
};
