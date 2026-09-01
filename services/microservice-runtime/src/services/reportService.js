import { appConfig } from "../config/env.js";
import { demoApartment } from "../data/demoData.js";
import {
  normalizeIsoDate,
  scanAllItems,
  scanItemsByAttribute,
  sortByIsoDate,
  sumHourlyValues,
  toFiniteNumber,
} from "./dynamoUtils.service.js";
import { normalizeOccupancy } from "./occupancy.service.js";

const ACTIVE_WINDOW_HOURS = Number(process.env.REPORT_ACTIVE_WINDOW_HOURS || 24);
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_HOURS * 60 * 60 * 1000;

const FLAT_ID_FIELDS = [
  "flat_number",
  "flatNumber",
  "flat_no",
  "flatNo",
  "flat_id",
  "flatId",
  "unit_id",
  "unitId",
];

const CANONICAL_FLAT_ID_FIELDS = ["flat_id", "flatId", "unit_id", "unitId"];
const FLAT_NUMBER_FIELDS = ["flat_number", "flatNumber", "flat_no", "flatNo"];

const DEVICE_ID_FIELDS = [
  "device_id",
  "deviceId",
  "meter_id",
  "meterId",
  "sensor_id",
  "sensorId",
];

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

const normalizeFlatId = (source) => normalizeText(getFirstValue(source, FLAT_ID_FIELDS));

const normalizeCanonicalFlatId = (source) =>
  normalizeText(getFirstValue(source, CANONICAL_FLAT_ID_FIELDS));

const normalizeFlatNumber = (source) =>
  normalizeText(getFirstValue(source, FLAT_NUMBER_FIELDS));

const normalizeDeviceId = (source) =>
  normalizeText(getFirstValue(source, DEVICE_ID_FIELDS));

const inferBlockFromFlatNumber = (flatNumber) => {
  const match = normalizeText(flatNumber).match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
};

const normalizeBlockId = (source, flatId) => {
  const explicitBlock = normalizeText(
    getFirstValue(source, ["block_id", "blockId", "block", "tower", "wing"])
  );

  return explicitBlock || inferBlockFromFlatNumber(flatId);
};

const normalizeTimestamp = (source) =>
  normalizeText(
    getFirstValue(source, ["timestamp", "created_at", "createdAt", "time", "date"])
  );

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
  const configuredNow = normalizeText(process.env.REPORT_REFERENCE_TIME);
  const parsed = configuredNow ? new Date(configuredNow) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getDeviceStatus = (lastSeen, now) => {
  if (!isValidDate(lastSeen)) {
    return "inactive";
  }

  return now.getTime() - new Date(lastSeen).getTime() <= ACTIVE_WINDOW_MS
    ? "active"
    : "inactive";
};

const inferInlet = (source = {}) => {
  const rawValue = normalizeText(
    getFirstValue(source, ["inlet", "source", "location", "meter_type", "meterType"])
  );

  const fallback = normalizeDeviceId(source).split(/[-_]/).at(-1) || "";
  const normalized = (rawValue || fallback).toLowerCase();

  if (normalized.includes("kitchen")) return "Kitchen";
  if (normalized.includes("utility")) return "Utility";
  if (normalized.includes("bath")) return "Bathroom";

  return rawValue || fallback || "Unknown";
};

const normalizeResidentName = (source = {}) => {
  const directName = normalizeText(
    getFirstValue(source, [
      "resident_name",
      "residentName",
      "res_name",
      "resName",
      "owner_name",
      "ownerName",
      "name",
    ])
  );

  if (directName) {
    return directName;
  }

  return [source.first_name, source.last_name].map(normalizeText).filter(Boolean).join(" ");
};

const normalizeResidentEmail = (source = {}) =>
  normalizeText(
    getFirstValue(source, [
      "resident_email",
      "residentEmail",
      "res_email",
      "resEmail",
      "email",
      "user_mail",
      "userMail",
    ])
  );

const sumFlowConsumption = (record = {}) => {
  const hourlyTotal = sumHourlyValues(record);

  if (hourlyTotal) {
    return hourlyTotal;
  }

  return toFiniteNumber(
    getFirstValue(record, [
      "litres",
      "liters",
      "consumption",
      "consumption_litres",
      "volume",
      "value",
    ]),
    0
  );
};

const normalizeDailyConsumption = (series = []) =>
  Array.isArray(series)
    ? series
        .map((entry) => ({
          date: normalizeIsoDate(entry?.date || entry?.timestamp),
          litres: toFiniteNumber(entry?.litres ?? entry?.value ?? entry?.consumption, 0),
        }))
        .filter((entry) => entry.date)
    : [];

const normalizeLeakEvents = (events = []) =>
  Array.isArray(events)
    ? events.map((event) => ({
        ...event,
        timestamp: normalizeTimestamp(event) || new Date().toISOString(),
        litres: toFiniteNumber(event?.litres, 0),
        source: event?.source || inferInlet(event),
        status: event?.status || "pending",
      }))
    : [];

const pushDevice = (devices, source, inletHint = "") => {
  const deviceId = normalizeDeviceId(source);

  if (!deviceId) {
    return;
  }

  devices.push({
    device_id: deviceId,
    inlet: inletHint || inferInlet(source),
    last_seen: normalizeText(source?.last_seen || source?.lastSeen),
  });
};

const extractDevices = (source = {}) => {
  const devices = [];

  if (Array.isArray(source.devices)) {
    source.devices.forEach((device) => pushDevice(devices, device));
  }

  if (source.device && typeof source.device === "object") {
    pushDevice(devices, source.device);
  }

  pushDevice(devices, source);

  Object.entries(source).forEach(([field, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }

    if (/^(apartment|flat|resident|owner|user)_?id$/i.test(field)) {
      return;
    }

    if (/(^|_)(device|meter|sensor)_?id$/i.test(field)) {
      pushDevice(devices, { device_id: value, inlet: field.replace(/_?(device|meter|sensor)_?id$/i, "") });
    }
  });

  const byId = new Map();
  devices.forEach((device) => {
    const existing = byId.get(device.device_id) || {};
    byId.set(device.device_id, {
      device_id: device.device_id,
      inlet: existing.inlet || device.inlet || "Unknown",
      last_seen: latestTimestamp(existing.last_seen, device.last_seen),
    });
  });

  return Array.from(byId.values());
};

const mergeFlatRecord = (target, source) => {
  target.block_id ||= source.block_id;
  if (source.occupancy_explicit) {
    target.resident_status = source.resident_status;
    target.occupancy_explicit = true;
    target.occupancy_id = source.occupancy_id;
    target.occupancy_start_date = source.occupancy_start_date;
    target.vacated_at = source.vacated_at;
  }
  if (target.resident_status !== "vacant") {
    target.resident_name ||= source.resident_name;
    target.resident_email ||= source.resident_email;
    target.resident_whatsapp ||= source.resident_whatsapp;
  }

  const devicesById = new Map(target.devices.map((device) => [device.device_id, device]));
  source.devices.forEach((device) => {
    const existing = devicesById.get(device.device_id) || {};
    devicesById.set(device.device_id, {
      device_id: device.device_id,
      inlet: existing.inlet || device.inlet || "Unknown",
      last_seen: latestTimestamp(existing.last_seen, device.last_seen),
    });
  });
  target.devices = Array.from(devicesById.values());

  if (!target.daily_consumption.length && source.daily_consumption.length) {
    target.daily_consumption = source.daily_consumption;
  }

  target.leak_events = [...target.leak_events, ...source.leak_events];
};

const normalizeFlatRecord = (source = {}) => {
  const flatId = normalizeFlatId(source);

  if (!flatId) {
    return null;
  }
  const occupancy = normalizeOccupancy(source);
  const residentStatus = occupancy.explicit
    ? occupancy.status
    : occupancy.residentName || occupancy.residentEmail
      ? "occupied"
      : "";

  return {
    flat_id: flatId,
    block_id: normalizeBlockId(source, flatId),
    resident_name: residentStatus === "vacant" ? "" : occupancy.residentName || normalizeResidentName(source),
    resident_email: residentStatus === "vacant" ? "" : occupancy.residentEmail || normalizeResidentEmail(source),
    resident_whatsapp: residentStatus === "vacant" ? "" : occupancy.residentContact || normalizeText(source.resident_whatsapp || source.residentWhatsapp),
    resident_status: residentStatus,
    occupancy_explicit: occupancy.explicit,
    occupancy_id: occupancy.occupancyId,
    occupancy_start_date: occupancy.occupancyStartDate,
    vacated_at: occupancy.vacatedAt,
    devices: extractDevices(source),
    daily_consumption: normalizeDailyConsumption(source.daily_consumption),
    leak_events: normalizeLeakEvents(source.leak_events),
  };
};

const buildFlatsFromApartmentItems = (items = []) => {
  const flatsByKey = new Map();

  const addFlat = (source) => {
    const normalized = normalizeFlatRecord(source);
    if (!normalized) {
      return;
    }

    const flatKey = keyFor(normalized.flat_id);
    const existing = flatsByKey.get(flatKey);

    if (existing) {
      mergeFlatRecord(existing, normalized);
    } else {
      flatsByKey.set(flatKey, normalized);
    }
  };

  items.forEach((item) => {
    if (Array.isArray(item?.flats)) {
      item.flats.forEach((flat) => addFlat({ ...flat, apartment_id: item.apartment_id }));
    }

    addFlat(item);
  });

  return Array.from(flatsByKey.values()).sort((left, right) =>
    left.flat_id.localeCompare(right.flat_id, undefined, { numeric: true })
  );
};

const buildApartmentDetailsMap = (items = []) => {
  const detailsByKey = new Map();

  const addDetails = (source) => {
    const flatId = normalizeFlatId(source);

    if (!flatId) {
      return;
    }

    const canonicalFlatId = normalizeCanonicalFlatId(source) || flatId;
    const flatNumber = normalizeFlatNumber(source) || flatId;
    const aliases = Array.from(new Set([flatId, canonicalFlatId, flatNumber].filter(Boolean)));
    const existing = aliases.map((alias) => detailsByKey.get(keyFor(alias))).find(Boolean) || {};
    const residentName = normalizeResidentName(source);
    const residentEmail = normalizeResidentEmail(source);
    const residentWhatsapp = normalizeText(
      source.resident_whatsapp || source.residentWhatsapp || source.res_contact || source.resContact
    );
    const occupancy = normalizeOccupancy(source);

    const details = {
      bill_flat_id: canonicalFlatId,
      flat_number: flatNumber,
      block_id: existing.block_id || normalizeBlockId(source, flatId),
      resident_name: residentName || existing.resident_name || "",
      resident_email: residentEmail || existing.resident_email || "",
      resident_whatsapp: residentWhatsapp || existing.resident_whatsapp || "",
      resident_status: occupancy.explicit ? occupancy.status : existing.resident_status || "occupied",
      occupancy_id: occupancy.occupancyId || existing.occupancy_id || "",
      occupancy_start_date: occupancy.occupancyStartDate || existing.occupancy_start_date || "",
      vacated_at: occupancy.vacatedAt || existing.vacated_at || "",
    };
    aliases.forEach((alias) => detailsByKey.set(keyFor(alias), details));
  };

  items.forEach((item) => {
    if (Array.isArray(item?.flats)) {
      item.flats.forEach((flat) => addDetails({ ...flat, apartment_id: item.apartment_id }));
    }

    addDetails(item);
  });

  return detailsByKey;
};

const enrichFlatsWithApartmentDetails = (flats = [], apartmentItems = []) => {
  const detailsByKey = buildApartmentDetailsMap(apartmentItems);

  if (!detailsByKey.size) {
    return flats;
  }

  return flats.map((flat) => {
    const details = detailsByKey.get(keyFor(flat.flat_id));

    if (!details) {
      return flat;
    }

    return {
      ...flat,
      bill_flat_id: details.bill_flat_id || flat.bill_flat_id || flat.flat_id,
      flat_number: details.flat_number || flat.flat_number || flat.flat_id,
      block_id: flat.block_id || details.block_id,
      resident_name: details.resident_status === "vacant" ? "" : details.resident_name || flat.resident_name,
      resident_email: details.resident_status === "vacant" ? "" : details.resident_email || flat.resident_email,
      resident_whatsapp: details.resident_status === "vacant" ? "" : details.resident_whatsapp || flat.resident_whatsapp,
      resident_status: details.resident_status,
      occupancy_id: details.occupancy_id,
      occupancy_start_date: details.occupancy_start_date,
      vacated_at: details.vacated_at,
    };
  });
};

const buildDeviceToFlatMap = (flats = []) => {
  const deviceToFlat = new Map();

  flats.forEach((flat) => {
    flat.devices.forEach((device) => {
      deviceToFlat.set(device.device_id, keyFor(flat.flat_id));
    });
  });

  return deviceToFlat;
};

const flowBelongsToKnownFlat = (record, knownFlatKeys, deviceToFlat) => {
  const flatId = normalizeFlatId(record);
  const deviceId = normalizeDeviceId(record);

  return (
    knownFlatKeys.has(keyFor(flatId)) ||
    (deviceId && deviceToFlat.has(deviceId))
  );
};

const loadApartmentItems = async (apartmentId) => {
  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  const scopedItems = await scanItemsByAttribute(
    appConfig.tables.apartments,
    "apartment_id",
    apartmentId
  );

  if (scopedItems.length) {
    return scopedItems;
  }

  return scanItemsByAttribute(appConfig.tables.apartments, "apartmentId", apartmentId);
};

const loadDeviceItems = async (apartmentId) => {
  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  const scopedItems = await scanItemsByAttribute(
    appConfig.tables.devices,
    "apartment_id",
    apartmentId
  );

  if (scopedItems.length) {
    return scopedItems;
  }

  const camelScopedItems = await scanItemsByAttribute(
    appConfig.tables.devices,
    "apartmentId",
    apartmentId
  );

  if (camelScopedItems.length) {
    return camelScopedItems;
  }

  const allItems = await scanAllItems(appConfig.tables.devices);
  const hasApartmentScope = allItems.some((item) =>
    normalizeText(getFirstValue(item, ["apartment_id", "apartmentId"]))
  );

  return hasApartmentScope ? [] : allItems;
};

const loadReportMetadataItems = async (apartmentId) => {
  return loadDeviceItems(apartmentId);
};

const loadFlowRecords = async (apartmentId, knownFlatKeys, deviceToFlat) => {
  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  const scopedRecords = await scanItemsByAttribute(
    appConfig.tables.flow,
    "apartment_id",
    apartmentId
  );

  if (scopedRecords.length) {
    return scopedRecords;
  }

  const camelScopedRecords = await scanItemsByAttribute(
    appConfig.tables.flow,
    "apartmentId",
    apartmentId
  );

  if (camelScopedRecords.length) {
    return camelScopedRecords;
  }

  const allRecords = await scanAllItems(appConfig.tables.flow);
  return allRecords.filter((record) =>
    flowBelongsToKnownFlat(record, knownFlatKeys, deviceToFlat)
  );
};

const buildFlowState = (flowRecords = [], flats = []) => {
  const flatDaily = new Map();
  const deviceDaily = new Map();
  const deviceState = new Map();
  const inferredFlats = new Map();
  const deviceToFlat = buildDeviceToFlatMap(flats);
  const flatByKey = new Map(flats.map((flat) => [keyFor(flat.flat_id), flat]));

  flowRecords.forEach((record) => {
    const deviceId = normalizeDeviceId(record);
    const recordFlatId = normalizeFlatId(record);
    const flatKey = keyFor(recordFlatId) || (deviceId ? deviceToFlat.get(deviceId) : "");

    if (!flatKey) {
      return;
    }

    const flatId = flatByKey.get(flatKey)?.flat_id || recordFlatId;
    const blockId = flatByKey.get(flatKey)?.block_id || normalizeBlockId(record, flatId);
    const timestamp = normalizeTimestamp(record);
    const date = normalizeIsoDate(timestamp);
    const litres = sumFlowConsumption(record);

    if (!flatByKey.has(flatKey) && !inferredFlats.has(flatKey)) {
      inferredFlats.set(flatKey, {
        flat_id: flatId,
        block_id: blockId,
        resident_name: `Flat ${flatId}`,
        resident_email: "",
        resident_whatsapp: "",
        devices: [],
        daily_consumption: [],
        leak_events: [],
      });
    }

    if (date) {
      const daily = flatDaily.get(flatKey) || new Map();
      daily.set(date, (daily.get(date) || 0) + litres);
      flatDaily.set(flatKey, daily);
    }

    if (!deviceId) {
      return;
    }

    const state = deviceState.get(deviceId) || {
      device_id: deviceId,
      flatKey,
      inlet: inferInlet(record),
      last_seen: null,
    };

    state.flatKey = state.flatKey || flatKey;
    state.inlet = state.inlet || inferInlet(record);
    state.last_seen = latestTimestamp(state.last_seen, timestamp);
    deviceState.set(deviceId, state);

    const perDevice = deviceDaily.get(deviceId) || new Map();
    if (date) {
      perDevice.set(date, (perDevice.get(date) || 0) + litres);
    }
    deviceDaily.set(deviceId, perDevice);
  });

  return {
    flatDaily,
    deviceDaily,
    deviceState,
    inferredFlats: Array.from(inferredFlats.values()),
  };
};

const mapToDailySeries = (dailyMap = new Map(), fallbackSeries = []) => {
  if (!dailyMap.size) {
    return fallbackSeries;
  }

  return Array.from(dailyMap.entries())
    .sort((left, right) => sortByIsoDate(left[0], right[0]))
    .map(([date, litres]) => ({ date, litres }));
};

const sumDailyConsumption = (series = []) =>
  series.reduce((sum, entry) => sum + toFiniteNumber(entry?.litres, 0), 0);

const getDevicesForFlat = (flat, flowState, now) => {
  const devices = new Map();
  const flatKey = keyFor(flat.flat_id);

  flat.devices.forEach((device) => {
    devices.set(device.device_id, {
      device_id: device.device_id,
      inlet: device.inlet || "Unknown",
      last_seen: device.last_seen || null,
    });
  });

  flowState.deviceState.forEach((device) => {
    if (device.flatKey !== flatKey) {
      return;
    }

    const existing = devices.get(device.device_id) || {
      device_id: device.device_id,
      inlet: device.inlet || "Unknown",
      last_seen: null,
    };

    devices.set(device.device_id, {
      ...existing,
      inlet: existing.inlet || device.inlet || "Unknown",
      last_seen: latestTimestamp(existing.last_seen, device.last_seen),
    });
  });

  return Array.from(devices.values()).map((device) => ({
    ...device,
    status: getDeviceStatus(device.last_seen, now),
  }));
};

const buildDeviceConsumptionSeries = (devices, flowState, dates) =>
  devices.map((device) => {
    const daily = flowState.deviceDaily.get(device.device_id) || new Map();
    return {
      device_id: device.device_id,
      data: dates.map((date) => ({
        date,
        litres: toFiniteNumber(daily.get(date), 0),
      })),
    };
  });

const buildDataset = async (apartmentId) => {
  const [metadataItems, apartmentItems] = await Promise.all([
    loadReportMetadataItems(apartmentId),
    loadApartmentItems(apartmentId),
  ]);
  const metadataFlats = enrichFlatsWithApartmentDetails(
    buildFlatsFromApartmentItems(metadataItems),
    apartmentItems
  );
  const knownFlatKeys = new Set(metadataFlats.map((flat) => keyFor(flat.flat_id)));
  const deviceToFlat = buildDeviceToFlatMap(metadataFlats);
  const flowRecords = await loadFlowRecords(apartmentId, knownFlatKeys, deviceToFlat);
  const flowState = buildFlowState(flowRecords, metadataFlats);
  const flats = [...metadataFlats, ...flowState.inferredFlats].sort((left, right) =>
    left.flat_id.localeCompare(right.flat_id, undefined, { numeric: true })
  );

  return { flats, flowState, now: getReferenceNow() };
};

export const buildOverviewFromDataset = ({ flats, flowState, now }) => {
  const blockConsumption = {};
  const blockDeviceSummary = {};
  const flatConsumptionMap = {};
  const flatHealthMap = {};

  flats.forEach((flat) => {
    const flatKey = keyFor(flat.flat_id);
    const blockId = flat.block_id || inferBlockFromFlatNumber(flat.flat_id) || "-";
    const dailySeries = mapToDailySeries(
      flowState.flatDaily.get(flatKey),
      flat.daily_consumption
    );
    const totalConsumption = sumDailyConsumption(dailySeries);
    const devices = getDevicesForFlat(flat, flowState, now);
    const activeDevices = devices.filter((device) => device.status === "active").length;

    blockConsumption[blockId] = (blockConsumption[blockId] || 0) + totalConsumption;

    if (!blockDeviceSummary[blockId]) {
      blockDeviceSummary[blockId] = { total: 0, active: 0 };
    }

    blockDeviceSummary[blockId].total += devices.length;
    blockDeviceSummary[blockId].active += activeDevices;
    flatConsumptionMap[flat.flat_id] = totalConsumption;
    flatHealthMap[flat.flat_id] = {
      active: activeDevices,
      total: devices.length,
    };
  });

  const donutChartData = Object.entries(blockDeviceSummary)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([block, summary]) => ({
      block,
      activeDevices: summary.active,
      inactiveDevices: Math.max(summary.total - summary.active, 0),
    }));

  const flatDetails = flats.map((flat) => ({
    flat_id: flat.flat_id,
    bill_flat_id: flat.bill_flat_id || flat.flat_id,
    flat_number: flat.flat_number || flat.flat_id,
    block_id: flat.block_id || inferBlockFromFlatNumber(flat.flat_id),
    resident_name: flat.resident_status === "vacant" ? "" : flat.resident_name || `Flat ${flat.flat_id}`,
    resident_email: flat.resident_email || "",
    resident_contact: flat.resident_whatsapp || "",
    resident_status: flat.resident_status || "occupied",
    occupancy_id: flat.occupancy_id || null,
    occupancy_start_date: flat.occupancy_start_date || null,
    vacated_at: flat.vacated_at || null,
    consumption: flatConsumptionMap[flat.flat_id] || 0,
    active_devices: flatHealthMap[flat.flat_id]?.active || 0,
    total_devices: flatHealthMap[flat.flat_id]?.total || 0,
  }));

  return {
    blockConsumption,
    donutChartData,
    flatDetails,
    flatConsumptionMap,
    flatHealthMap,
  };
};

export const buildFlatReportFromDataset = ({ flats, flowState, now }, flatId) => {
  const requestedKey = keyFor(flatId);
  const flat = flats.find((item) => keyFor(item.flat_id) === requestedKey);

  if (!flat) {
    return null;
  }

  const flatKey = keyFor(flat.flat_id);
  const consumptionSeries = mapToDailySeries(
    flowState.flatDaily.get(flatKey),
    flat.daily_consumption
  );
  const dates = consumptionSeries.map((entry) => entry.date);
  const devices = getDevicesForFlat(flat, flowState, now);
  const leakEvents = normalizeLeakEvents(flat.leak_events);
  const leakTotalsByInlet = leakEvents.reduce((acc, event) => {
    acc[event.source] = (acc[event.source] || 0) + toFiniteNumber(event.litres, 0);
    return acc;
  }, {});

  return {
    flat_id: flat.flat_id,
    block_id: flat.block_id || inferBlockFromFlatNumber(flat.flat_id),
    resident_name: flat.resident_name || `Flat ${flat.flat_id}`,
    resident_email: flat.resident_email || "",
    consumption_series: consumptionSeries,
    device_consumption: buildDeviceConsumptionSeries(devices, flowState, dates),
    leak_events: leakEvents,
    device_status: devices.map((device) => ({
      device_id: device.device_id,
      inlet: device.inlet,
      status: device.status,
      last_seen: device.last_seen,
      leak_cycle_litres: leakTotalsByInlet[device.inlet] || 0,
    })),
    totals: {
      consumption: sumDailyConsumption(consumptionSeries),
      leak_litres: leakEvents.reduce(
        (sum, leak) => sum + toFiniteNumber(leak.litres, 0),
        0
      ),
    },
    latest_leak: leakEvents.at(-1) || null,
  };
};

const buildDemoDataset = () => {
  const flowState = {
    flatDaily: new Map(),
    deviceDaily: new Map(),
    deviceState: new Map(),
    inferredFlats: [],
  };
  const now = new Date("2025-04-15T10:00:00+05:30");

  demoApartment.flats.forEach((flat) => {
    flat.daily_consumption.forEach((entry) => {
      const daily = flowState.flatDaily.get(keyFor(flat.flat_id)) || new Map();
      daily.set(entry.date, entry.litres);
      flowState.flatDaily.set(keyFor(flat.flat_id), daily);
    });

    flat.devices.forEach((device, index) => {
      flowState.deviceState.set(device.device_id, {
        device_id: device.device_id,
        flatKey: keyFor(flat.flat_id),
        inlet: device.inlet,
        last_seen: device.last_seen,
      });

      const weights = flat.devices.map((_, idx) => 1 + idx * 0.25);
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      flowState.deviceDaily.set(
        device.device_id,
        new Map(
          flat.daily_consumption.map((entry) => [
            entry.date,
            Math.round((entry.litres * weights[index]) / weightSum),
          ])
        )
      );
    });
  });

  return {
    flats: buildFlatsFromApartmentItems([demoApartment]),
    flowState,
    now,
  };
};

export const buildReportsFromRecords = ({
  apartmentItems = [],
  deviceItems = [],
  flowRecords = [],
  now,
}) => {
  const sourceItems = deviceItems.length ? deviceItems : apartmentItems;
  const flats = enrichFlatsWithApartmentDetails(
    buildFlatsFromApartmentItems(sourceItems),
    apartmentItems
  );
  const flowState = buildFlowState(flowRecords, flats);
  return {
    flats: [...flats, ...flowState.inferredFlats],
    flowState,
    now: now || getReferenceNow(),
  };
};

export const getReportsOverview = async (apartmentId) => {
  const dataset = appConfig.demoMode ? buildDemoDataset() : await buildDataset(apartmentId);
  return buildOverviewFromDataset(dataset);
};

export const getFlatReport = async (flatId, apartmentId) => {
  const dataset = appConfig.demoMode ? buildDemoDataset() : await buildDataset(apartmentId);
  return buildFlatReportFromDataset(dataset, flatId);
};
