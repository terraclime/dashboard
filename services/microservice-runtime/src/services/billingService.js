import { appConfig } from "../config/env.js";
import { demoApartment, demoBilling } from "../data/demoData.js";
import {
  normalizeIsoDate,
  normalizeIsoDateInTimezone,
  scanAllItems,
  scanItemsByAttribute,
  sortByIsoDate,
  sumHourlyValues,
  toFiniteNumber,
} from "./dynamoUtils.service.js";
import { listFinalizations } from "./billingFinalization.service.js";
import { normalizeOccupancy } from "./occupancy.service.js";

const APARTMENT_ID_FIELDS = ["apartment_id", "apartmentId"];
const DEVICE_ID_FIELDS = ["device_id", "deviceId", "meter_id", "meterId", "sensor_id", "sensorId"];
const FLAT_ID_FIELDS = ["flat_id", "flatId", "unit_id", "unitId"];
const FLAT_NUMBER_FIELDS = ["flat_number", "flatNumber", "flat_no", "flatNo"];

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
const normalizeApartmentId = (source) => normalizeText(getFirstValue(source, APARTMENT_ID_FIELDS));
const normalizeDeviceId = (source) => normalizeText(getFirstValue(source, DEVICE_ID_FIELDS));
const normalizeFlatId = (source) => normalizeText(getFirstValue(source, FLAT_ID_FIELDS));
const normalizeFlatNumber = (source) => normalizeText(getFirstValue(source, FLAT_NUMBER_FIELDS));
const normalizeTimestamp = (source) =>
  normalizeText(getFirstValue(source, ["timestamp", "created_at", "createdAt", "time", "date"]));
const uniqueKeys = (...values) =>
  Array.from(new Set(values.map(normalizeText).filter(Boolean)));
const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getReferenceNow = () => {
  const configuredNow = normalizeText(process.env.BILLING_REFERENCE_TIME);
  const parsed = configuredNow ? new Date(configuredNow) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getCurrentMonthBounds = (baseDate = getReferenceNow()) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0));

  return {
    period_start: toIsoDate(start),
    period_end: toIsoDate(end),
  };
};

const formatCycleLabel = (startDate) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${startDate}T00:00:00Z`));

const getRequestedCycle = ({ periodStart, periodEnd } = {}) => {
  const current = getCurrentMonthBounds();
  const start = normalizeIsoDate(periodStart) || current.period_start;
  const end = normalizeIsoDate(periodEnd) || current.period_end;

  return {
    label: formatCycleLabel(start),
    period_start: start,
    period_end: end,
  };
};

const inferBlockFromFlatNumber = (flatNumber) => {
  const match = normalizeText(flatNumber).match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : "";
};

const normalizeBlockId = (source, flatId = "") =>
  normalizeText(getFirstValue(source, ["block_id", "blockId", "block", "tower", "wing"])) ||
  inferBlockFromFlatNumber(flatId);

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
  if (hourlyTotal) return hourlyTotal;

  return toFiniteNumber(
    getFirstValue(record, ["litres", "liters", "consumption", "consumption_litres", "volume", "value"]),
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

const pushDevice = (devices, source = {}) => {
  const deviceId = normalizeDeviceId(source);

  if (!deviceId) {
    return;
  }

  devices.push({
    device_id: deviceId,
    flat_id: normalizeFlatId(source) || normalizeFlatNumber(source),
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

  return Array.from(new Map(devices.map((device) => [device.device_id, device])).values());
};

const normalizeFlatRecord = (source = {}) => {
  const explicitFlatId = normalizeFlatId(source);
  const flatNumber = normalizeFlatNumber(source);
  const flatId = explicitFlatId || flatNumber;

  if (!flatId) {
    return null;
  }
  const occupancy = normalizeOccupancy(source, normalizeApartmentId(source));
  const residentStatus = occupancy.explicit
    ? occupancy.status
    : occupancy.residentName || occupancy.residentEmail
      ? "occupied"
      : "";

  return {
    flat_id: flatId,
    flat_number: flatNumber || flatId,
    canonical_flat_id: explicitFlatId,
    bill_flat_id: explicitFlatId || flatId,
    flat_aliases: uniqueKeys(explicitFlatId, flatNumber),
    block_id: normalizeBlockId(source, flatNumber || flatId),
    resident_name: residentStatus === "vacant" ? "" : occupancy.residentName || normalizeResidentName(source),
    resident_email: residentStatus === "vacant" ? "" : occupancy.residentEmail || normalizeResidentEmail(source),
    resident_whatsapp: residentStatus === "vacant" ? "" : occupancy.residentContact || normalizeText(source.resident_whatsapp || source.residentWhatsapp || source.res_contact || source.resContact),
    resident_status: residentStatus,
    occupancy_explicit: occupancy.explicit,
    occupancy_id: occupancy.occupancyId,
    occupancy_start_date: occupancy.occupancyStartDate,
    vacated_at: occupancy.vacatedAt,
    devices: extractDevices(source),
    daily_consumption: normalizeDailyConsumption(source.daily_consumption),
  };
};

const mergeFlatRecord = (target, source) => {
  target.block_id ||= source.block_id;
  if (source.canonical_flat_id) {
    target.flat_id = source.canonical_flat_id;
    target.canonical_flat_id = source.canonical_flat_id;
    target.bill_flat_id = source.canonical_flat_id;
  } else {
    target.bill_flat_id = target.canonical_flat_id || target.bill_flat_id || source.bill_flat_id;
  }
  target.flat_number = target.flat_number || source.flat_number || target.flat_id;
  target.flat_aliases = uniqueKeys(...(target.flat_aliases || []), ...(source.flat_aliases || []), target.flat_id, target.flat_number);
  if (source.occupancy_explicit) {
    target.resident_status = source.resident_status;
    target.occupancy_explicit = true;
    target.occupancy_id = source.occupancy_id;
    target.occupancy_start_date = source.occupancy_start_date;
    target.vacated_at = source.vacated_at;
  } else if (!target.resident_status && source.resident_status) {
    target.resident_status = source.resident_status;
    target.occupancy_id ||= source.occupancy_id;
  }
  if (target.resident_status !== "vacant" && (!target.occupancy_explicit || source.occupancy_explicit)) {
    target.resident_name = source.resident_name || target.resident_name;
    target.resident_email = source.resident_email || target.resident_email;
    target.resident_whatsapp = source.resident_whatsapp || target.resident_whatsapp;
  } else {
    target.resident_name = "";
    target.resident_email = "";
    target.resident_whatsapp = "";
  }

  const devices = new Map(target.devices.map((device) => [device.device_id, device]));
  source.devices.forEach((device) => {
    devices.set(device.device_id, {
      ...devices.get(device.device_id),
      ...device,
    });
  });
  target.devices = Array.from(devices.values());

  if (!target.daily_consumption.length && source.daily_consumption.length) {
    target.daily_consumption = source.daily_consumption;
  }
};

const addFlatRecord = (flatsByKey, source = {}) => {
  const flat = normalizeFlatRecord(source);

  if (!flat) {
    return;
  }

  const aliases = uniqueKeys(...(flat.flat_aliases || []), flat.flat_id, flat.flat_number);
  const existing = aliases.map((alias) => flatsByKey.get(keyFor(alias))).find(Boolean);
  const target = existing || flat;

  if (existing) {
    mergeFlatRecord(target, flat);
  }

  uniqueKeys(...(target.flat_aliases || []), target.flat_id, target.flat_number).forEach((alias) => {
    flatsByKey.set(keyFor(alias), target);
  });
};

const getUniqueFlats = (flatsByKey) => Array.from(new Set(flatsByKey.values()));

const buildFlatMetadata = ({ apartmentItems = [], deviceItems = [], userItems = [] }) => {
  const flatsByKey = new Map();

  apartmentItems.forEach((item) => {
    if (Array.isArray(item?.flats)) {
      item.flats.forEach((flat) => addFlatRecord(flatsByKey, { ...flat, apartment_id: normalizeApartmentId(item) }));
    }

    addFlatRecord(flatsByKey, item);
  });

  deviceItems.forEach((item) => addFlatRecord(flatsByKey, item));
  userItems.forEach((item) => addFlatRecord(flatsByKey, item));

  return flatsByKey;
};

const buildDeviceToFlatMap = (flatsByKey) => {
  const deviceToFlat = new Map();

  getUniqueFlats(flatsByKey).forEach((flat) => {
    flat.devices.forEach((device) => {
      if (device.device_id) {
        deviceToFlat.set(device.device_id, keyFor(flat.flat_id));
      }
    });
  });

  return deviceToFlat;
};

const isMissingDynamoTable = (error) =>
  error?.name === "ResourceNotFoundException" ||
  error?.__type === "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException";

const isOptionalDynamoReadFailure = (error) =>
  isMissingDynamoTable(error) ||
  error?.name === "AccessDeniedException" ||
  error?.name === "UnrecognizedClientException" ||
  error?.__type === "com.amazonaws.dynamodb.v20120810#AccessDeniedException";

const scanAttributeSafely = async (tableName, attributeName, value, { optional = false } = {}) => {
  try {
    return await scanItemsByAttribute(tableName, attributeName, value);
  } catch (error) {
    if (optional && isOptionalDynamoReadFailure(error)) {
      console.warn(
        `[billingService] Optional DynamoDB read failed for table "${tableName}" (${error.name}); continuing without ${attributeName} metadata.`
      );
      return [];
    }

    throw error;
  }
};

const scanAllSafely = async (tableName, { optional = false } = {}) => {
  try {
    return await scanAllItems(tableName);
  } catch (error) {
    if (optional && isOptionalDynamoReadFailure(error)) {
      console.warn(
        `[billingService] Optional DynamoDB table scan failed for "${tableName}" (${error.name}); continuing without table scan metadata.`
      );
      return [];
    }

    throw error;
  }
};

const scanScopedItems = async (tableName, apartmentId, options = {}) => {
  const snakeItems = await scanAttributeSafely(tableName, "apartment_id", apartmentId, options);
  const camelItems = await scanAttributeSafely(tableName, "apartmentId", apartmentId, options);
  const byPayload = new Map();

  [...snakeItems, ...camelItems].forEach((item) => {
    byPayload.set(JSON.stringify(item), item);
  });

  return Array.from(byPayload.values());
};

const loadApartmentItems = async (apartmentId) =>
  scanScopedItems(appConfig.tables.apartments, apartmentId, { optional: true });
const loadUserItems = async (apartmentId) =>
  scanScopedItems(appConfig.tables.users, apartmentId, { optional: true });
const loadBillingRecords = async (apartmentId) =>
  scanScopedItems(appConfig.tables.billing, apartmentId, { optional: true });

const loadDeviceItems = async (apartmentId) => {
  const scopedItems = await scanScopedItems(appConfig.tables.devices, apartmentId, { optional: true });
  if (scopedItems.length) return scopedItems;

  const allItems = await scanAllSafely(appConfig.tables.devices, { optional: true });
  const hasApartmentScope = allItems.some((item) => normalizeApartmentId(item));
  return hasApartmentScope ? [] : allItems;
};

const flowBelongsToKnownFlat = (record, knownFlatKeys, deviceToFlat) => {
  const flatId = normalizeFlatId(record) || normalizeFlatNumber(record);
  const deviceId = normalizeDeviceId(record);

  return knownFlatKeys.has(keyFor(flatId)) || (deviceId && deviceToFlat.has(deviceId));
};

const loadFlowRecords = async (apartmentId, knownFlatKeys, deviceToFlat) => {
  const scopedRecords = await scanScopedItems(appConfig.tables.flow, apartmentId);
  if (scopedRecords.length) return scopedRecords;

  const allRecords = await scanAllItems(appConfig.tables.flow);
  return allRecords.filter((record) => flowBelongsToKnownFlat(record, knownFlatKeys, deviceToFlat));
};

const normalizeBillingCycle = (source = {}, requestedCycle) => {
  const nestedCycle = source.billing_cycle && typeof source.billing_cycle === "object" ? source.billing_cycle : {};
  const merged = { ...nestedCycle, ...source };
  const periodStart = normalizeIsoDate(
    merged.period_start || merged.startDate || merged.start_date || merged.cycle_id || merged.cycleId
  );
  const explicitPeriodEnd = normalizeIsoDate(merged.period_end || merged.endDate || merged.end_date);
  const periodEnd =
    explicitPeriodEnd ||
    (periodStart
      ? new Date(Date.UTC(
          new Date(`${periodStart}T00:00:00Z`).getUTCFullYear(),
          new Date(`${periodStart}T00:00:00Z`).getUTCMonth() + 1,
          0
        ))
          .toISOString()
          .slice(0, 10)
      : null);
  const nextDue = normalizeIsoDate(merged.next_due || merged.dueDate || merged.due_date);
  const sourceMatchesRequested =
    periodStart === requestedCycle.period_start ||
    (periodStart &&
      periodEnd &&
      periodStart <= requestedCycle.period_start &&
      periodEnd >= requestedCycle.period_end);

  return {
    label: requestedCycle.label,
    period_start: requestedCycle.period_start,
    period_end: requestedCycle.period_end,
    next_due: sourceMatchesRequested ? nextDue : null,
    tariff_per_kl: toFiniteNumber(
      merged.tariff_per_kl ||
        merged.tariffPerKL ||
        merged.blended_rate ||
        merged.blendedRate ||
        merged.tariff ||
        merged.rate_per_kl,
      0
    ),
    maintenance_fee: toFiniteNumber(merged.maintenance_fee || merged.maintenanceFee || merged.fixed_fee, 0),
    source_period_start: periodStart,
    source_period_end: periodEnd,
  };
};

const selectBillingRecord = (billingRecords = [], requestedCycle) => {
  const matchingRecord = billingRecords.find((record) => {
    const cycle = normalizeBillingCycle(record, requestedCycle);
    return (
      cycle.source_period_start === requestedCycle.period_start ||
      (cycle.source_period_start &&
        cycle.source_period_end &&
        cycle.source_period_start <= requestedCycle.period_start &&
        cycle.source_period_end >= requestedCycle.period_end)
    );
  });

  if (matchingRecord) {
    return matchingRecord;
  }

  return [...billingRecords]
    .sort((left, right) => {
      const leftDate = normalizeBillingCycle(left, requestedCycle).source_period_start || "";
      const rightDate = normalizeBillingCycle(right, requestedCycle).source_period_start || "";
      return sortByIsoDate(leftDate, rightDate);
    })
    .at(-1);
};

const getTariffSource = ({ billingRecord, apartmentItems, requestedCycle }) => {
  const apartmentCycle =
    apartmentItems.find((item) => item?.billing_cycle)?.billing_cycle ||
    apartmentItems.find((item) => item?.tariff_per_kl || item?.tariffPerKL || item?.tariff) ||
    {};

  const billingCycle = normalizeBillingCycle(billingRecord || apartmentCycle, requestedCycle);

  if (billingCycle.tariff_per_kl || billingCycle.maintenance_fee || billingCycle.next_due) {
    return billingCycle;
  }

  return normalizeBillingCycle(apartmentCycle, requestedCycle);
};

const ensureFlat = (flatsByKey, flatId, source = {}) => {
  const flatKey = keyFor(flatId);
  const existing = flatsByKey.get(flatKey);

  if (existing) {
    return existing;
  }

  const flat = {
    flat_id: flatId,
    flat_number: normalizeFlatNumber(source) || flatId,
    canonical_flat_id: normalizeFlatId(source),
    bill_flat_id: normalizeFlatId(source) || flatId,
    flat_aliases: uniqueKeys(flatId, normalizeFlatNumber(source)),
    block_id: normalizeBlockId(source, normalizeFlatNumber(source) || flatId),
    resident_name: normalizeResidentName(source) || `Flat ${normalizeFlatNumber(source) || flatId}`,
    resident_email: normalizeResidentEmail(source),
    resident_whatsapp: "",
    resident_status: "",
    occupancy_explicit: false,
    occupancy_id: "",
    occupancy_start_date: "",
    vacated_at: "",
    devices: extractDevices(source),
    daily_consumption: [],
  };

  flatsByKey.set(flatKey, flat);
  flat.flat_aliases.forEach((alias) => flatsByKey.set(keyFor(alias), flat));
  return flat;
};

const buildOccupancyWindows = ({ flatsByKey, finalizations = [], requestedCycle }) => {
  const windows = new Map();

  getUniqueFlats(flatsByKey).forEach((flat) => {
    const flatFinalizations = finalizations
      .filter((item) => keyFor(item.flatId) === keyFor(flat.flat_id))
      .sort((left, right) => normalizeText(left.periodEnd).localeCompare(normalizeText(right.periodEnd)));
    const matchingResident = [...flatFinalizations]
      .reverse()
      .find((item) =>
        item.occupancyId && flat.occupancy_id
          ? item.occupancyId === flat.occupancy_id
          : !(
              flat.occupancy_start_date &&
              item.periodEnd &&
              item.periodEnd < flat.occupancy_start_date
            ) && keyFor(item.residentEmail) === keyFor(flat.resident_email)
      );
    const latestPrior = flatFinalizations.at(-1);

    if (flat.resident_status === "vacant") {
      windows.set(keyFor(flat.flat_id), {
        start: null,
        end: null,
        status: "vacant",
        finalization: latestPrior || null,
      });
      return;
    }

    windows.set(keyFor(flat.flat_id), matchingResident
      ? {
          start: requestedCycle.period_start,
          end: matchingResident.periodEnd,
          status: "finalized",
          finalization: matchingResident,
        }
      : {
          start: flat.occupancy_start_date
            ? [requestedCycle.period_start, flat.occupancy_start_date].sort().at(-1)
            : latestPrior
              ? [requestedCycle.period_start, addDays(latestPrior.periodEnd, 1)].sort().at(-1)
              : requestedCycle.period_start,
          end: requestedCycle.period_end,
          status: "open",
          finalization: null,
        });
  });

  return windows;
};

const buildConsumptionByFlat = ({ flowRecords = [], flatsByKey, deviceToFlat, requestedCycle, occupancyWindows }) => {
  const consumptionByFlat = new Map();

  flowRecords.forEach((record) => {
    const date = normalizeIsoDateInTimezone(normalizeTimestamp(record));
    const deviceId = normalizeDeviceId(record);
    const recordFlatId = normalizeFlatId(record) || normalizeFlatNumber(record);
    const flatKey = keyFor(recordFlatId) || (deviceId ? deviceToFlat.get(deviceId) : "");

    if (!flatKey) {
      return;
    }

    const flat = flatsByKey.get(flatKey) || ensureFlat(flatsByKey, recordFlatId, record);
    const summaryKey = keyFor(flat.flat_id);
    const window = occupancyWindows.get(summaryKey) || {
      start: requestedCycle.period_start,
      end: requestedCycle.period_end,
    };
    if (!window.start || !window.end || !date || date < window.start || date > window.end) return;
    consumptionByFlat.set(summaryKey, (consumptionByFlat.get(summaryKey) || 0) + sumFlowConsumption(record));
  });

  getUniqueFlats(flatsByKey).forEach((flat) => {
    const flatKey = keyFor(flat.flat_id);
    if (consumptionByFlat.has(flatKey)) {
      return;
    }

    const window = occupancyWindows.get(flatKey) || {
      start: requestedCycle.period_start,
      end: requestedCycle.period_end,
    };
    if (!window.start || !window.end) return;
    const fallbackTotal = flat.daily_consumption
      .filter((entry) => entry.date >= window.start && entry.date <= window.end)
      .reduce((sum, entry) => sum + toFiniteNumber(entry.litres, 0), 0);

    if (fallbackTotal) {
      consumptionByFlat.set(flatKey, fallbackTotal);
    }
  });

  return consumptionByFlat;
};

const applyBillingRecordFallback = ({ billingRecord, flatsByKey, consumptionByFlat, occupancyWindows, requestedCycle }) => {
  const perFlat = billingRecord?.per_flat_summary || billingRecord?.per_flat || billingRecord?.flats || [];

  if (!Array.isArray(perFlat)) {
    return;
  }

  perFlat.forEach((entry) => {
    const flatId = normalizeFlatId(entry) || normalizeFlatNumber(entry);
    if (!flatId) {
      return;
    }

    const flat = ensureFlat(flatsByKey, flatId, entry);
    const flatKey = keyFor(flat.flat_id);
    const window = occupancyWindows.get(flatKey);

    if (!consumptionByFlat.has(flatKey) && (!window || (window.status !== "vacant" && window.start === requestedCycle.period_start))) {
      consumptionByFlat.set(
        flatKey,
        toFiniteNumber(entry.consumption_litres ?? entry.consumption ?? entry.litres ?? entry.volume, 0)
      );
    }
  });
};

const buildPerFlatSummary = ({ flatsByKey, consumptionByFlat, tariffPerKl, occupancyWindows }) =>
  getUniqueFlats(flatsByKey)
    .map((flat) => {
      const consumption = Math.round(toFiniteNumber(consumptionByFlat.get(keyFor(flat.flat_id)), 0));
      const window = occupancyWindows.get(keyFor(flat.flat_id));
      const effectiveTariff = window?.status === "finalized"
        ? toFiniteNumber(window.finalization.tariffPerKL, tariffPerKl)
        : tariffPerKl;
      const projectedAmount = window?.status === "finalized"
        ? toFiniteNumber(window.finalization.water_charge, 0)
        : Math.round((consumption / 1000) * effectiveTariff);

      return {
        flat_id: flat.flat_id,
        flat_number: flat.flat_number || flat.flat_id,
        bill_flat_id: flat.bill_flat_id || flat.flat_id,
        block_id: flat.block_id || inferBlockFromFlatNumber(flat.flat_number || flat.flat_id) || "-",
        resident_name: flat.resident_status === "vacant" ? "" : flat.resident_name || `Flat ${flat.flat_number || flat.flat_id}`,
        resident_email: flat.resident_email || "",
        resident_whatsapp: flat.resident_whatsapp || "",
        consumption_litres: consumption,
        tariff_per_kl: effectiveTariff,
        projected_amount: projectedAmount,
        billing_status: window?.status || "open",
        billing_period_start: window?.start,
        billing_period_end: window?.end,
        finalization_id: window?.finalization?.finalization_id || null,
        finalization_email_status: window?.finalization?.email_status || null,
        resident_status: flat.resident_status || "occupied",
        occupancy_id: flat.occupancy_id || null,
        occupancy_start_date: flat.occupancy_start_date || null,
        vacated_at: flat.vacated_at || null,
      };
    })
    .filter((entry) => entry.consumption_litres > 0 || ["finalized", "vacant"].includes(entry.billing_status))
    .sort((left, right) => left.flat_id.localeCompare(right.flat_id, undefined, { numeric: true }));

const applyFinalizedSnapshots = (consumptionByFlat, occupancyWindows) => {
  occupancyWindows.forEach((window, flatKey) => {
    if (window.status === "finalized" && window.finalization) {
      consumptionByFlat.set(
        flatKey,
        toFiniteNumber(window.finalization.consumption_litres, 0)
      );
    }
  });
};

const buildBillingSummary = ({ requestedCycle, billingCycle, perFlat, finance }) => {
  const totalConsumption = perFlat.reduce((sum, entry) => sum + entry.consumption_litres, 0);
  const projectedAmount = perFlat.reduce((sum, entry) => sum + entry.projected_amount, 0);
  const summary = {
    total_consumption_litres: totalConsumption,
    tariff_per_kl: billingCycle.tariff_per_kl,
    projected_amount: projectedAmount,
    total_flats: perFlat.length,
    period_start: requestedCycle.period_start,
    period_end: requestedCycle.period_end,
  };

  return {
    billing_cycle: {
      label: billingCycle.label,
      period_start: requestedCycle.period_start,
      period_end: requestedCycle.period_end,
      next_due: billingCycle.next_due,
      tariff_per_kl: billingCycle.tariff_per_kl,
      maintenance_fee: billingCycle.maintenance_fee,
    },
    total_consumption_litres: totalConsumption,
    tariff_per_kl: billingCycle.tariff_per_kl,
    maintenance_fee: billingCycle.maintenance_fee,
    per_flat: perFlat,
    summary,
    per_flat_summary: perFlat,
    finance,
  };
};

const buildDemoBillingSummary = (requestedCycle) => {
  const billingCycle = normalizeBillingCycle(demoApartment.billing_cycle, requestedCycle);
  const flatsByKey = buildFlatMetadata({
    apartmentItems: [demoApartment],
    deviceItems: [],
    userItems: [],
  });
  const deviceToFlat = buildDeviceToFlatMap(flatsByKey);
  const occupancyWindows = buildOccupancyWindows({
    flatsByKey,
    finalizations: [],
    requestedCycle,
  });
  const flowRecords = demoApartment.flats.flatMap((flat) =>
    flat.daily_consumption.map((entry) => ({
      apartment_id: demoApartment.apartment_id,
      flat_id: flat.flat_id,
      block_id: flat.block_id,
      timestamp: entry.date,
      litres: entry.litres,
    }))
  );
  const consumptionByFlat = buildConsumptionByFlat({
    flowRecords,
    flatsByKey,
    deviceToFlat,
    requestedCycle,
    occupancyWindows,
  });
  const perFlat = buildPerFlatSummary({
    flatsByKey,
    consumptionByFlat,
    tariffPerKl: billingCycle.tariff_per_kl,
    occupancyWindows,
  });

  return buildBillingSummary({
    requestedCycle,
    billingCycle,
    perFlat,
    finance: demoBilling,
  });
};

export const getBillingSummary = async (apartmentId, options = {}) => {
  const requestedCycle = getRequestedCycle(options);

  if (appConfig.demoMode) {
    return buildDemoBillingSummary(requestedCycle);
  }

  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  const [apartmentItems, deviceItems, userItems, billingRecords, finalizations] = await Promise.all([
    loadApartmentItems(apartmentId),
    loadDeviceItems(apartmentId),
    loadUserItems(apartmentId),
    loadBillingRecords(apartmentId),
    listFinalizations(apartmentId, requestedCycle.period_start),
  ]);

  const flatsByKey = buildFlatMetadata({ apartmentItems, deviceItems, userItems });
  const knownFlatKeys = new Set(flatsByKey.keys());
  const deviceToFlat = buildDeviceToFlatMap(flatsByKey);
  const occupancyWindows = buildOccupancyWindows({
    flatsByKey,
    finalizations,
    requestedCycle,
  });
  const flowRecords = await loadFlowRecords(apartmentId, knownFlatKeys, deviceToFlat);
  const billingRecord = selectBillingRecord(billingRecords, requestedCycle);
  const billingCycle = getTariffSource({ billingRecord, apartmentItems, requestedCycle });
  const consumptionByFlat = buildConsumptionByFlat({
    flowRecords,
    flatsByKey,
    deviceToFlat,
    requestedCycle,
    occupancyWindows,
  });

  applyBillingRecordFallback({
    billingRecord,
    flatsByKey,
    consumptionByFlat,
    occupancyWindows,
    requestedCycle,
  });
  applyFinalizedSnapshots(consumptionByFlat, occupancyWindows);

  const perFlat = buildPerFlatSummary({
    flatsByKey,
    consumptionByFlat,
    tariffPerKl: billingCycle.tariff_per_kl,
    occupancyWindows,
  });

  return buildBillingSummary({
    requestedCycle,
    billingCycle,
    perFlat,
    finance: billingRecord || {},
  });
};
