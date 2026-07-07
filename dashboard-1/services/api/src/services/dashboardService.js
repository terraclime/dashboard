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

const formatLabel = (dateString) => {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  });
  return formatter.format(new Date(`${dateString}T00:00:00`));
};

const toChartSeries = (isoLabels = [], values = []) => {
  const formattedLabels = isoLabels.map((date) => formatLabel(date));
  return {
    isoLabels,
    labels: formattedLabels,
    values,
  };
};

export const getDashboardOverview = (apartmentId) => {
  const snapshot = getApartmentSnapshot(apartmentId);
  const deviceSets = snapshot.flats.map((flat) => flat.devices || []);
  const devices = deviceSets.flat();
  const totalDevices = devices.length;
  const activeDevices = devices.filter(
    (device) => device.status === "active"
  ).length;

  const aggregated = new Map();
  snapshot.flats.forEach((flat) => {
    flat.daily_consumption.forEach((entry) => {
      const current = aggregated.get(entry.date) || 0;
      aggregated.set(entry.date, current + entry.litres);
    });
  });

  const sortedDates = Array.from(aggregated.keys()).sort(
    (a, b) => new Date(a) - new Date(b)
  );

  const values = sortedDates.map((date) => aggregated.get(date));
  const labels = sortedDates.map((date) => formatLabel(date));

  const totalConsumption = values.reduce((sum, entry) => sum + entry, 0);

  const blockBreakdown = snapshot.flats.reduce((acc, flat) => {
    acc[flat.block_id] = (acc[flat.block_id] || 0) + flat.devices.length;
    return acc;
  }, {});

  const cycleSeries = Object.entries(snapshot.cycle_series || {}).reduce(
    (acc, [key, series]) => {
      acc[key] = toChartSeries(series.labels, series.values);
      return acc;
    },
    {}
  );

  cycleSeries.current = toChartSeries(sortedDates, values);

  return {
    apartment: {
      id: snapshot.apartment_id,
      name: snapshot.apartment_name,
      billing_cycle: snapshot.billing_cycle,
    },
    Dashboard_Total_Devices: totalDevices,
    Active_devices: activeDevices,
    Inactive_Devices: totalDevices - activeDevices,
    Consumption_Total: totalConsumption,
    labels,
    values,
    deviceBreakdown: blockBreakdown,
    cycle_series: cycleSeries,
  };
};
