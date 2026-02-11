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

const sumDailyConsumption = (flat) =>
  flat.daily_consumption.reduce((sum, entry) => sum + entry.litres, 0);

export const getReportsOverview = (apartmentId) => {
  const snapshot = getApartmentSnapshot(apartmentId);

  const blockConsumption = {};
  const blockDeviceSummary = {};
  const flatConsumptionMap = {};
  const flatHealthMap = {};

  snapshot.flats.forEach((flat) => {
    const blockId = flat.block_id;
    const deviceCount = flat.devices.length;
    const activeDevices = flat.devices.filter(
      (device) => device.status === "active"
    ).length;

    blockConsumption[blockId] =
      (blockConsumption[blockId] || 0) + sumDailyConsumption(flat);

    if (!blockDeviceSummary[blockId]) {
      blockDeviceSummary[blockId] = { total: 0, active: 0 };
    }
    flat.devices.forEach((device) => {
      blockDeviceSummary[blockId].total += 1;
      if (device.status === "active") {
        blockDeviceSummary[blockId].active += 1;
      }
    });

    flatConsumptionMap[flat.flat_id] = sumDailyConsumption(flat);
    flatHealthMap[flat.flat_id] = {
      active: activeDevices,
      total: deviceCount,
    };
  });

  const donutChartData = Object.entries(blockDeviceSummary).map(
    ([block, summary]) => ({
      block,
      activeDevices: summary.active,
      inactiveDevices: summary.total - summary.active,
    })
  );

  const flatDetails = snapshot.flats.map((flat) => ({
    flat_id: flat.flat_id,
    block_id: flat.block_id,
    resident_name: flat.resident_name,
    resident_email: flat.resident_email,
  }));

  return {
    blockConsumption,
    donutChartData,
    flatDetails,
    flatConsumptionMap,
    flatHealthMap,
  };
};

export const getFlatReport = (flatId, apartmentId) => {
  const snapshot = getApartmentSnapshot(apartmentId);
  const flat = snapshot.flats.find(
    (item) => item.flat_id.toLowerCase() === flatId.toLowerCase()
  );

  if (!flat) {
    return null;
  }

  const totalConsumption = sumDailyConsumption(flat);
  const latestLeak = flat.leak_events.at(-1) || null;
  const leakTotalsByInlet = flat.leak_events.reduce((acc, event) => {
    if (event.source) {
      acc[event.source] = (acc[event.source] || 0) + event.litres;
    }
    return acc;
  }, {});

  const weights = flat.devices.map((_, idx) => 1 + idx * 0.25);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const deviceConsumptionSeries = flat.devices.map((device, deviceIndex) => ({
    device_id: device.device_id,
    data: flat.daily_consumption.map((entry) => ({
      date: entry.date,
      litres: Math.round((entry.litres * weights[deviceIndex]) / weightSum),
    })),
  }));

  const deviceStatus = flat.devices.map((device) => ({
    device_id: device.device_id,
    inlet: device.inlet,
    status: device.status,
    last_seen: device.last_seen,
    leak_cycle_litres: leakTotalsByInlet[device.inlet] || 0,
  }));

  return {
    flat_id: flat.flat_id,
    block_id: flat.block_id,
    resident_name: flat.resident_name,
    resident_email: flat.resident_email,
    consumption_series: flat.daily_consumption,
    device_consumption: deviceConsumptionSeries,
    leak_events: flat.leak_events,
    device_status: deviceStatus,
    totals: {
      consumption: totalConsumption,
      leak_litres: flat.leak_events.reduce(
        (sum, leak) => sum + leak.litres,
        0
      ),
    },
    latest_leak: latestLeak,
  };
};
