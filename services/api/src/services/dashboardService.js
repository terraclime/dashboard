import { appConfig } from "../config/env.js";
import { demoApartment } from "../data/demoData.js";
import {
  buildDateRange,
  getItemByKey,
  normalizeIsoDate,
  scanAllItems,
  scanItemsByAttribute,
  sumHourlyValues,
  toFiniteNumber,
  updateItem,
} from "./dynamoUtils.service.js";

const ACTIVE_WINDOW_HOURS = Number(process.env.DASHBOARD_ACTIVE_WINDOW_HOURS || 24);
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_HOURS * 60 * 60 * 1000;

const CYCLE_LABELS = {
  current: "Current Billing Cycle",
  "previous-1": "Last Month Billing Cycle",
  "previous-2": "Two Months Ago Billing Cycle",
};

const DEVICE_ID_FIELDS = ["device_id", "deviceId", "meter_id", "meterId", "sensor_id", "sensorId"];
const FLAT_ID_FIELDS = ["flat_number", "flatNumber", "flat_no", "flatNo", "flat_id", "flatId", "unit_id", "unitId"];
const APARTMENT_ID_FIELDS = ["apartment_id", "apartmentId"];

const getFirstValue = (source, fields) => {
  for (const field of fields) {
    const value = source?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
};

const normalizeText = (value) => String(value ?? "").trim();
const keyFor = (value) => normalizeText(value).toLowerCase();
const normalizeDeviceId = (source) => normalizeText(getFirstValue(source, DEVICE_ID_FIELDS));
const normalizeFlatId = (source) => normalizeText(getFirstValue(source, FLAT_ID_FIELDS));
const normalizeTimestamp = (source) =>
  normalizeText(getFirstValue(source, ["timestamp", "created_at", "createdAt", "time", "date"]));

const isValidDate = (value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const latestTimestamp = (left, right) => {
  if (!isValidDate(left)) return right || null;
  if (!isValidDate(right)) return left || null;
  return new Date(left) > new Date(right) ? left : right;
};

const getReferenceNow = () => {
  const fallback = appConfig.demoMode ? "2025-04-15T10:00:00+05:30" : null;
  const configuredNow = normalizeText(process.env.DASHBOARD_REFERENCE_TIME || fallback);
  const parsed = configuredNow ? new Date(configuredNow) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatLabel = (dateString) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${dateString}T00:00:00`));

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getCalendarMonthBounds = (monthsAgo, baseDate) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - monthsAgo + 1, 0));

  return {
    period_start: toIsoDate(start),
    period_end: toIsoDate(end),
  };
};

const buildBillingCycles = (baseDate) =>
  [
    { id: "current", monthsAgo: 0 },
    { id: "previous-1", monthsAgo: 1 },
    { id: "previous-2", monthsAgo: 2 },
  ].map((cycle) => ({
    id: cycle.id,
    label: CYCLE_LABELS[cycle.id],
    ...getCalendarMonthBounds(cycle.monthsAgo, baseDate),
  }));

const toChartSeries = (isoLabels = [], values = []) => ({
  isoLabels,
  labels: isoLabels.map((date) => formatLabel(date)),
  values,
});

const inferBlockFromFlatNumber = (flatNumber) => {
  const match = normalizeText(flatNumber).match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
};

const normalizeBlockId = (source, flatId = "") =>
  normalizeText(getFirstValue(source, ["block_id", "blockId", "block", "tower", "wing"])) ||
  inferBlockFromFlatNumber(flatId);

const normalizeApartment = (apartmentId, apartmentItems = []) => {
  const apartmentItem =
    apartmentItems.find((item) => normalizeText(getFirstValue(item, APARTMENT_ID_FIELDS)) === apartmentId) ||
    apartmentItems[0] ||
    {};
  const billingCycle =
    apartmentItem.billing_cycle && typeof apartmentItem.billing_cycle === "object"
      ? apartmentItem.billing_cycle
      : apartmentItem;

  return {
    id: apartmentId,
    name:
      apartmentItem.apartment_name ||
      apartmentItem.apartmentName ||
      apartmentItem.name ||
      "Apartment",
    billing_cycle: {
      label: billingCycle.label || "Current cycle",
      period_start: normalizeIsoDate(billingCycle.period_start || billingCycle.startDate || billingCycle.start_date),
      period_end: normalizeIsoDate(billingCycle.period_end || billingCycle.endDate || billingCycle.end_date),
      tariff_per_kl: toFiniteNumber(
        billingCycle.tariff_per_kl || billingCycle.tariffPerKL || billingCycle.tariff || billingCycle.rate_per_kl,
        0
      ),
      maintenance_fee: toFiniteNumber(billingCycle.maintenance_fee || billingCycle.maintenanceFee, 0),
    },
  };
};

const sumFlowConsumption = (record = {}) => {
  const hourlyTotal = sumHourlyValues(record);
  if (hourlyTotal) return hourlyTotal;

  return toFiniteNumber(
    getFirstValue(record, ["litres", "liters", "consumption", "consumption_litres", "volume", "value"]),
    0
  );
};

const extractHourlyValues = (record = {}) => {
  const hourlyEntries = Object.entries(record)
    .map(([key, value]) => {
      const match = key.match(/^value_(\d+)$/);
      return match ? [Number(match[1]), toFiniteNumber(value, 0)] : null;
    })
    .filter(Boolean);

  if (!hourlyEntries.length) {
    return [];
  }

  const oneBased = hourlyEntries.some(([hour]) => hour === 24) || !hourlyEntries.some(([hour]) => hour === 0);
  return hourlyEntries
    .map(([hour, value]) => ({
      hour: oneBased ? hour - 1 : hour,
      value,
    }))
    .filter((entry) => entry.hour >= 0 && entry.hour <= 23);
};

const scanScopedItems = async (tableName, apartmentId) => {
  const snakeItems = await scanItemsByAttribute(tableName, "apartment_id", apartmentId);
  if (snakeItems.length) return snakeItems;

  return scanItemsByAttribute(tableName, "apartmentId", apartmentId);
};

const loadApartmentItems = async (apartmentId) => scanScopedItems(appConfig.tables.apartments, apartmentId);

const loadDeviceItems = async (apartmentId) => {
  const scopedItems = await scanScopedItems(appConfig.tables.devices, apartmentId);
  if (scopedItems.length) return scopedItems;

  const allItems = await scanAllItems(appConfig.tables.devices);
  const hasApartmentScope = allItems.some((item) => normalizeText(getFirstValue(item, APARTMENT_ID_FIELDS)));

  return hasApartmentScope ? [] : allItems;
};

const loadFlowRecords = async (apartmentId, deviceIds) => {
  const scopedRecords = await scanScopedItems(appConfig.tables.flow, apartmentId);
  if (scopedRecords.length) return scopedRecords;

  const allRecords = await scanAllItems(appConfig.tables.flow);
  return allRecords.filter((record) => deviceIds.has(normalizeDeviceId(record)));
};

const normalizeDevices = (deviceItems = []) => {
  const devices = new Map();

  deviceItems.forEach((item) => {
    const deviceId = normalizeDeviceId(item);
    if (!deviceId) return;

    devices.set(deviceId, {
      device_id: deviceId,
      flat_id: normalizeFlatId(item),
      block_id: normalizeBlockId(item, normalizeFlatId(item)),
      last_seen: normalizeText(item.last_seen || item.lastSeen),
    });
  });

  return devices;
};

const buildFlowMetrics = (flowRecords = [], devices, cycles) => {
  const dailyTotals = new Map();
  const hourlyTotals = new Map();
  const latestByDevice = new Map();

  cycles.forEach((cycle) => {
    dailyTotals.set(cycle.id, new Map());
    hourlyTotals.set(cycle.id, new Map());
  });

  flowRecords.forEach((record) => {
    const deviceId = normalizeDeviceId(record);
    const timestamp = normalizeTimestamp(record);
    const date = normalizeIsoDate(timestamp);
    const litres = sumFlowConsumption(record);

    if (deviceId) {
      latestByDevice.set(deviceId, latestTimestamp(latestByDevice.get(deviceId), timestamp));

      if (!devices.has(deviceId)) {
        const flatId = normalizeFlatId(record);
        devices.set(deviceId, {
          device_id: deviceId,
          flat_id: flatId,
          block_id: normalizeBlockId(record, flatId),
          last_seen: null,
        });
      }
    }

    if (!date) return;

    cycles.forEach((cycle) => {
      if (date < cycle.period_start || date > cycle.period_end) return;

      const cycleDaily = dailyTotals.get(cycle.id);
      cycleDaily.set(date, (cycleDaily.get(date) || 0) + litres);

      const cycleHourly = hourlyTotals.get(cycle.id);
      const dayHourly = cycleHourly.get(date) || Array.from({ length: 24 }, () => 0);
      extractHourlyValues(record).forEach(({ hour, value }) => {
        dayHourly[hour] += value;
      });
      cycleHourly.set(date, dayHourly);
    });
  });

  return { dailyTotals, hourlyTotals, latestByDevice };
};

const buildCycleSeries = (cycles, dailyTotals) =>
  cycles.reduce((acc, cycle) => {
    const isoLabels = buildDateRange(cycle.period_start, cycle.period_end);
    const values = isoLabels.map((date) => dailyTotals.get(cycle.id)?.get(date) || 0);
    acc[cycle.id] = toChartSeries(isoLabels, values);
    return acc;
  }, {});

const buildHourlySeries = (cycles, hourlyTotals) =>
  cycles.reduce((acc, cycle) => {
    const isoLabels = buildDateRange(cycle.period_start, cycle.period_end);
    const cycleHourly = hourlyTotals.get(cycle.id) || new Map();
    acc[cycle.id] = isoLabels.reduce((days, date) => {
      days[date] = {
        labels: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`),
        values: cycleHourly.get(date) || Array.from({ length: 24 }, () => 0),
      };
      return days;
    }, {});
    return acc;
  }, {});

const buildDeviceBreakdown = (devices) => {
  const breakdown = {};

  devices.forEach((device) => {
    const blockId = device.block_id || inferBlockFromFlatNumber(device.flat_id) || "-";
    breakdown[blockId] = (breakdown[blockId] || 0) + 1;
  });

  return breakdown;
};

const buildDemoFlowRecords = () =>
  demoApartment.flats.flatMap((flat) =>
    flat.daily_consumption.flatMap((entry) =>
      flat.devices.map((device, index) => ({
        apartment_id: demoApartment.apartment_id,
        flat_id: flat.flat_id,
        block_id: flat.block_id,
        device_id: device.device_id,
        timestamp: `${entry.date}T${String(8 + index).padStart(2, "0")}:00:00+05:30`,
        value_1: Math.round(entry.litres / flat.devices.length),
      }))
    )
  );

const buildDemoDeviceItems = () =>
  demoApartment.flats.flatMap((flat) =>
    flat.devices.map((device) => ({
      apartment_id: demoApartment.apartment_id,
      flat_id: flat.flat_id,
      block_id: flat.block_id,
      device_id: device.device_id,
      last_seen: device.last_seen,
    }))
  );

export const buildDashboardOverviewFromRecords = ({
  apartmentId,
  apartmentItems = [],
  deviceItems = [],
  flowRecords = [],
  now = getReferenceNow(),
}) => {
  const cycles = buildBillingCycles(now);
  const devices = normalizeDevices(deviceItems);
  const metrics = buildFlowMetrics(flowRecords, devices, cycles);
  const activeDeviceCount = Array.from(devices.values()).filter((device) => {
    const lastSeen = latestTimestamp(device.last_seen, metrics.latestByDevice.get(device.device_id));
    return isValidDate(lastSeen) && now.getTime() - new Date(lastSeen).getTime() <= ACTIVE_WINDOW_MS;
  }).length;
  const cycleSeries = buildCycleSeries(cycles, metrics.dailyTotals);
  const currentValues = cycleSeries.current?.values || [];
  const totalConsumption = currentValues.reduce((sum, value) => sum + value, 0);
  const apartment = normalizeApartment(apartmentId, apartmentItems);
  const currentCycle = cycles.find((cycle) => cycle.id === "current");

  return {
    apartment: {
      ...apartment,
      billing_cycle: {
        ...apartment.billing_cycle,
        label: "Current Billing Cycle",
        period_start: currentCycle.period_start,
        period_end: currentCycle.period_end,
      },
    },
    Dashboard_Total_Devices: devices.size,
    Active_devices: activeDeviceCount,
    Inactive_Devices: Math.max(devices.size - activeDeviceCount, 0),
    Consumption_Total: totalConsumption,
    labels: cycleSeries.current?.labels || [],
    values: currentValues,
    deviceBreakdown: buildDeviceBreakdown(devices),
    leakBreakdown: [],
    billing_cycles: cycles,
    cycle_series: cycleSeries,
    hourly_series: buildHourlySeries(cycles, metrics.hourlyTotals),
  };
};

export const getDashboardOverview = async (apartmentId) => {
  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  if (appConfig.demoMode) {
    return buildDashboardOverviewFromRecords({
      apartmentId: demoApartment.apartment_id,
      apartmentItems: [demoApartment],
      deviceItems: buildDemoDeviceItems(),
      flowRecords: buildDemoFlowRecords(),
    });
  }

  const [apartmentItems, deviceItems] = await Promise.all([
    loadApartmentItems(apartmentId),
    loadDeviceItems(apartmentId),
  ]);
  const deviceIds = new Set(deviceItems.map((item) => normalizeDeviceId(item)).filter(Boolean));
  const flowRecords = await loadFlowRecords(apartmentId, deviceIds);

  return buildDashboardOverviewFromRecords({
    apartmentId,
    apartmentItems,
    deviceItems,
    flowRecords,
  });
};

const sanitizeTariffSources = (sources = []) =>
  (Array.isArray(sources) ? sources : [])
    .map((source, index) => ({
      id: normalizeText(source?.id) || `source-${index + 1}`,
      name: normalizeText(source?.name) || `Source ${index + 1}`,
      volume: toFiniteNumber(source?.volume, 0),
      rate: toFiniteNumber(source?.rate, 0),
    }))
    .filter((source) => source.name || source.volume || source.rate);

export const getDashboardTariff = async (apartmentId, cycleId) => {
  if (!apartmentId || !cycleId) {
    throw new Error("apartment_id and cycle_id are required");
  }

  if (appConfig.demoMode) {
    return null;
  }

  return getItemByKey(appConfig.tables.tariffs, {
    apartment_id: apartmentId,
    cycle_id: cycleId,
  });
};

export const saveDashboardTariff = async ({
  apartmentId,
  cycleId,
  sources,
  blendedRate,
}) => {
  if (!apartmentId || !cycleId) {
    throw new Error("apartment_id and cycle_id are required");
  }

  const safeSources = sanitizeTariffSources(sources);
  const safeBlendedRate = toFiniteNumber(blendedRate, 0);
  const updatedAt = new Date().toISOString();

  if (appConfig.demoMode) {
    return {
      apartment_id: apartmentId,
      cycle_id: cycleId,
      sources: safeSources,
      blended_rate: safeBlendedRate,
      updated_at: updatedAt,
    };
  }

  return updateItem(
    appConfig.tables.tariffs,
    {
      apartment_id: apartmentId,
      cycle_id: cycleId,
    },
    {
      UpdateExpression:
        "SET sources = :sources, blended_rate = :blendedRate, updated_at = :updatedAt",
      ExpressionAttributeValues: {
        ":sources": safeSources,
        ":blendedRate": safeBlendedRate,
        ":updatedAt": updatedAt,
      },
    }
  );
};
