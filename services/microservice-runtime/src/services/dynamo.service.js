import { appConfig } from "../config/env.js";
import { demoApartment } from "../data/demoData.js";
import {
  buildDateRange,
  getItemByKey,
  normalizeIsoDate,
  normalizeIsoDateInTimezone,
  scanAllItems,
  scanItemsByAttribute,
  sortByIsoDate,
  sumHourlyValues,
  toFiniteNumber,
} from "./dynamoUtils.service.js";

const DEFAULT_SOCIETY_INFO = {
  legalName: "Residents' Welfare Association",
  bank: "",
  accNo: "",
  ifsc: "",
  accountName: "",
};

const normalizeKey = (value) => String(value ?? "").trim().toLowerCase();

const getFirstValue = (source = {}, fields = []) => {
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
};

const getApartmentId = (source = {}) =>
  getFirstValue(source, [
    "apartment_id",
    "apartmentId",
    "apartmentID",
    "apartment",
    "society_id",
    "societyId",
    "id",
  ]);

const getFlatId = (source = {}) =>
  getFirstValue(source, [
    "flat_id",
    "flatId",
    "flat_number",
    "flatNumber",
    "flat_no",
    "flatNo",
    "unit_id",
    "unitId",
    "house_id",
    "houseId",
  ]);

const getEmail = (source = {}) =>
  getFirstValue(source, [
    "resident_email",
    "residentEmail",
    "res_email",
    "resEmail",
    "user_mail",
    "userMail",
    "mail",
    "email",
  ]);

const getResidentName = (source = {}) =>
  getFirstValue(source, [
    "resident_name",
    "residentName",
    "res_name",
    "resName",
    "owner_name",
    "ownerName",
    "name",
  ]);

const apartmentMatches = (source, apartmentId) =>
  !apartmentId || normalizeKey(getApartmentId(source)) === normalizeKey(apartmentId);

const recordBelongsToApartment = (record, apartmentId) => {
  if (!apartmentId) return true;
  const recordApartmentId = getApartmentId(record);
  return !recordApartmentId || normalizeKey(recordApartmentId) === normalizeKey(apartmentId);
};

const isMissingDynamoTable = (error) =>
  error?.name === "ResourceNotFoundException" ||
  error?.__type === "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException";

const scanAllOptional = async (tableName, label) => {
  try {
    return await scanAllItems(tableName);
  } catch (error) {
    if (isMissingDynamoTable(error)) {
      console.warn(
        `[billsService] Optional DynamoDB table "${tableName}" for ${label} was not found; continuing without it.`
      );
      return [];
    }

    throw error;
  }
};

const mapLeakBucket = (source) => {
  const normalized = String(source || "").trim().toLowerCase();

  if (normalized.includes("kitchen")) return "kitchen";
  if (normalized.includes("utility")) return "utility";
  if (normalized.includes("bath")) return "bath1";

  return "bath1";
};

const inferInlet = (device = {}) => {
  const explicitValue =
    device.inlet ||
    device.inlet_location ||
    device.inletLocation ||
    device.meter_location ||
    device.meterLocation ||
    device.location ||
    device.room_type ||
    device.roomType ||
    device.room_label ||
    device.roomLabel ||
    device.source ||
    device.zone;

  if (explicitValue) {
    return String(explicitValue).trim();
  }

  const rawValue =
    typeof (device.device_id || device.deviceId) === "string"
      ? (device.device_id || device.deviceId).split("-").at(-1)
      : "";

  const normalized = String(rawValue || "").trim().toLowerCase();

  if (normalized.includes("kitchen")) return "Kitchen";
  if (normalized.includes("utility")) return "Utility";
  if (normalized.includes("bath")) return "Bathroom";

  return rawValue || "Unknown";
};

const getFlowLitres = (record = {}) => {
  const hourlyTotal = sumHourlyValues(record);
  if (hourlyTotal) return hourlyTotal;

  return toFiniteNumber(
    record.litres ?? record.liters ?? record.consumption_litres ?? record.consumption ?? record.volume,
    0
  );
};

const normalizeBillingCycle = (primarySource = {}, fallbackSource = {}) => {
  const source =
    primarySource?.billing_cycle && typeof primarySource.billing_cycle === "object"
      ? { ...fallbackSource, ...primarySource.billing_cycle, ...primarySource }
      : { ...fallbackSource, ...primarySource };

  const cycleId =
    source.cycle_id ||
    source.cycleId ||
    source.period_start ||
    source.startDate ||
    source.start_date;
  const startDate = normalizeIsoDate(source.period_start || source.startDate || source.start_date || cycleId);
  const explicitEndDate = normalizeIsoDate(source.period_end || source.endDate || source.end_date);
  const endDate =
    explicitEndDate ||
    (startDate
      ? new Date(Date.UTC(
          new Date(`${startDate}T00:00:00Z`).getUTCFullYear(),
          new Date(`${startDate}T00:00:00Z`).getUTCMonth() + 1,
          0
        ))
          .toISOString()
          .slice(0, 10)
      : null);

  return {
    cycleId: String(cycleId || ""),
    startDate,
    endDate,
    dueDate: normalizeIsoDate(source.next_due || source.dueDate || source.due_date),
    tariffPerKL: toFiniteNumber(
      source.tariff_per_kl ||
        source.tariffPerKL ||
        source.blended_rate ||
        source.blendedRate ||
        source.tariff ||
        source.rate_per_kl,
      0
    ),
    leakagePenaltyPerL: toFiniteNumber(
      source.leakage_penalty_per_l || source.leakagePenaltyPerL,
      0.5
    ),
    societyInfo: {
      legalName:
        source.rwa_name ||
        source.rwaName ||
        source.association_name ||
        source.associationName ||
        source.society_legal_name ||
        source.societyLegalName ||
        source.society_name ||
        source.societyName ||
        source.societyInfo?.legalName ||
        source.apartment_name ||
        source.apartmentName ||
        DEFAULT_SOCIETY_INFO.legalName,
      bank:
        source.rwa_bank ||
        source.rwaBank ||
        source.society_bank ||
        source.societyBank ||
        source.rwa_bank_account?.bank ||
        source.rwaBankAccount?.bank ||
        source.bank_details?.bank ||
        source.societyInfo?.bank ||
        DEFAULT_SOCIETY_INFO.bank,
      accNo:
        source.rwa_acc_no ||
        source.rwaAccNo ||
        source.rwa_account_number ||
        source.rwaAccountNumber ||
        source.society_acc_no ||
        source.societyAccNo ||
        source.rwa_bank_account?.account_number ||
        source.rwaBankAccount?.accountNumber ||
        source.bank_details?.account_number ||
        source.societyInfo?.accNo ||
        DEFAULT_SOCIETY_INFO.accNo,
      ifsc:
        source.rwa_ifsc ||
        source.rwaIfsc ||
        source.society_ifsc ||
        source.societyIfsc ||
        source.rwa_bank_account?.ifsc ||
        source.rwaBankAccount?.ifsc ||
        source.bank_details?.ifsc ||
        source.societyInfo?.ifsc ||
        DEFAULT_SOCIETY_INFO.ifsc,
      accountName:
        source.rwa_account_name ||
        source.rwaAccountName ||
        source.society_account_name ||
        source.societyAccountName ||
        source.rwa_bank_account?.account_name ||
        source.rwaBankAccount?.accountName ||
        source.bank_details?.account_name ||
        source.societyInfo?.accountName ||
        DEFAULT_SOCIETY_INFO.accountName,
    },
  };
};

const matchCycleRecord = (record, cycleId) => {
  const candidates = [
    record?.cycle_id,
    record?.cycleId,
    record?.period_start,
    record?.billing_cycle?.cycle_id,
    record?.billing_cycle?.cycleId,
    record?.billing_cycle?.period_start,
  ]
    .map((value) => (value == null ? null : String(value)))
    .filter(Boolean);

  return candidates.includes(String(cycleId));
};

const mergeCycleWithTariff = (cycle, tariffRecord) => {
  if (!tariffRecord) {
    return cycle;
  }

  return normalizeBillingCycle(
    {
      ...cycle,
      ...tariffRecord,
      period_start: cycle?.startDate || tariffRecord.period_start || tariffRecord.cycle_id,
      period_end: cycle?.endDate || tariffRecord.period_end,
      next_due: cycle?.dueDate || tariffRecord.next_due,
      tariff_per_kl:
        tariffRecord.tariff_per_kl ||
        tariffRecord.tariffPerKL ||
        tariffRecord.blended_rate ||
        tariffRecord.blendedRate ||
        cycle?.tariffPerKL,
      leakage_penalty_per_l:
        tariffRecord.leakage_penalty_per_l ||
        tariffRecord.leakagePenaltyPerL ||
        cycle?.leakagePenaltyPerL,
    },
    {}
  );
};

const findApartmentById = async (apartmentId) => {
  const apartments = await resolveApartmentItems();
  return apartments.find((apartment) => apartmentMatches(apartment, apartmentId)) || null;
};

const buildObservedDevices = (metadataDevices = [], flowRecords = [], leakEvents = []) => {
  const devices = new Map();

  metadataDevices.forEach((device) => {
    const deviceId = device?.device_id || device?.deviceId;
    if (!deviceId) {
      return;
    }

    devices.set(deviceId, {
      device_id: deviceId,
      inlet: inferInlet(device),
      status: device?.status || "inactive",
      last_seen: device?.last_seen || device?.lastSeen || null,
    });
  });

  flowRecords.forEach((record) => {
    const deviceId = record?.device_id || record?.deviceId;
    if (!deviceId) {
      return;
    }

    const existing = devices.get(deviceId) || {
      device_id: deviceId,
      inlet: inferInlet(record),
      status: "active",
      last_seen: null,
    };

    existing.inlet = existing.inlet || inferInlet(record);
    existing.status = record?.status || "active";
    existing.last_seen =
      !existing.last_seen || new Date(record.timestamp) > new Date(existing.last_seen)
        ? record.timestamp
        : existing.last_seen;
    devices.set(deviceId, existing);
  });

  leakEvents.forEach((event) => {
    const deviceId = event?.device_id || event?.deviceId;
    if (!deviceId || !devices.has(deviceId)) {
      return;
    }

    const device = devices.get(deviceId);
    device.last_seen =
      !device.last_seen || new Date(event.timestamp) > new Date(device.last_seen)
        ? event.timestamp
        : device.last_seen;
  });

  return Array.from(devices.values());
};

const aggregateDailyConsumption = (flowRecords = []) => {
  const dailyMap = new Map();
  const inletMap = new Map();

  flowRecords.forEach((record) => {
    const date = normalizeIsoDate(record?.timestamp || record?.date);
    if (!date) {
      return;
    }

    const litres = getFlowLitres(record);
    dailyMap.set(date, (dailyMap.get(date) || 0) + litres);

    const inlet = inferInlet(record);
    inletMap.set(inlet, (inletMap.get(inlet) || 0) + litres);
  });

  return { dailyMap, inletMap };
};

const getDeviceId = (source = {}) => String(source.device_id || source.deviceId || "").trim();

const recordMatchesFlat = (record, flatId, deviceIds, apartmentId) =>
  recordBelongsToApartment(record, apartmentId) &&
  (normalizeKey(getFlatId(record)) === normalizeKey(flatId) ||
    deviceIds.has(normalizeKey(getDeviceId(record))));

const makeUniqueInletLabels = (devices = []) => {
  const totals = new Map();
  const seen = new Map();

  devices.forEach((device) => {
    const label = inferInlet(device) || "Unknown";
    totals.set(normalizeKey(label), (totals.get(normalizeKey(label)) || 0) + 1);
  });

  return devices.map((device, index) => {
    const baseLabel = inferInlet(device) || `Inlet ${index + 1}`;
    const labelKey = normalizeKey(baseLabel);
    const occurrence = (seen.get(labelKey) || 0) + 1;
    seen.set(labelKey, occurrence);

    return {
      deviceId: getDeviceId(device),
      baseLabel,
      label: totals.get(labelKey) > 1 ? `${baseLabel} ${occurrence}` : baseLabel,
      consumed: 0,
      leaked: 0,
    };
  });
};

const buildInletReadings = (devices = [], flowRecords = [], leakEvents = []) => {
  const inferredDevices = [];
  const knownIds = new Set();

  [...devices, ...flowRecords].forEach((source) => {
    const deviceId = getDeviceId(source);
    if (deviceId && !knownIds.has(normalizeKey(deviceId))) {
      knownIds.add(normalizeKey(deviceId));
      inferredDevices.push({ ...source, device_id: deviceId, inlet: inferInlet(source) });
    }
  });

  if (!inferredDevices.length) {
    const knownLocations = new Set();
    [...flowRecords, ...leakEvents].forEach((source) => {
      const label = inferInlet(source);
      if (label && normalizeKey(label) !== "unknown" && !knownLocations.has(normalizeKey(label))) {
        knownLocations.add(normalizeKey(label));
        inferredDevices.push({ inlet: label });
      }
    });
  }

  const readings = makeUniqueInletLabels(inferredDevices);
  const byDeviceId = new Map(
    readings.filter((row) => row.deviceId).map((row) => [normalizeKey(row.deviceId), row])
  );
  const byLocation = new Map();
  readings.forEach((row) => {
    const locationKey = normalizeKey(row.baseLabel);
    if (!byLocation.has(locationKey)) byLocation.set(locationKey, row);
  });

  const findReading = (source) =>
    byDeviceId.get(normalizeKey(getDeviceId(source))) ||
    byLocation.get(normalizeKey(inferInlet(source)));

  let unassignedConsumption = 0;
  flowRecords.forEach((record) => {
    const litres = getFlowLitres(record);
    const reading = findReading(record);
    if (reading) reading.consumed += litres;
    else unassignedConsumption += litres;
  });

  let unassignedLeakage = 0;
  leakEvents.forEach((event) => {
    const litres = toFiniteNumber(event?.litres, 0);
    const reading = findReading(event);
    if (reading) reading.leaked += litres;
    else unassignedLeakage += litres;
  });

  if (unassignedConsumption || unassignedLeakage) {
    readings.push({
      deviceId: "",
      baseLabel: "Unassigned inlet",
      label: "Unassigned inlet",
      consumed: unassignedConsumption,
      leaked: unassignedLeakage,
    });
  }

  return readings.map(({ label, consumed, leaked }) => ({
    label,
    consumed: Math.round(consumed),
    leaked: Math.round(leaked),
  }));
};

const aggregateLeakage = (leakEvents = []) =>
  leakEvents.reduce(
    (acc, event) => {
      const bucket = mapLeakBucket(event?.source);
      acc[bucket] = (acc[bucket] || 0) + toFiniteNumber(event?.litres, 0);
      return acc;
    },
    {
      kitchen: 0,
      bath1: 0,
      bath2: 0,
      bath3: 0,
      utility: 0,
    }
  );

const buildCycleBounds = (cycle, options = {}) => {
  if (!cycle?.startDate || !cycle?.endDate) {
    return null;
  }

  const currentStart = normalizeIsoDate(options.periodStart) || cycle.startDate;
  const currentEnd = normalizeIsoDate(options.periodEnd) || cycle.endDate;

  return {
    current: new Set(buildDateRange(currentStart, currentEnd)),
    previous: new Set(
      buildDateRange(
        new Date(new Date(`${cycle.startDate}T00:00:00Z`).setUTCMonth(
          new Date(`${cycle.startDate}T00:00:00Z`).getUTCMonth() - 1
        ))
          .toISOString()
          .slice(0, 10),
        new Date(new Date(`${cycle.endDate}T00:00:00Z`).setUTCMonth(
          new Date(`${cycle.endDate}T00:00:00Z`).getUTCMonth() - 1
        ))
          .toISOString()
          .slice(0, 10)
      )
    ),
  };
};

const resolveApartmentItems = async () => scanAllItems(appConfig.tables.apartments);

const resolveUsers = async () => scanAllOptional(appConfig.tables.users, "resident users");

const resolveDevices = async () => scanAllOptional(appConfig.tables.devices, "meter metadata");

const getBillingRecords = async () =>
  process.env.BILLING_TABLE
    ? scanAllOptional(appConfig.tables.billing, "legacy billing cycles")
    : [];

const getTariffRecords = async () => scanAllOptional(appConfig.tables.tariffs, "tariff configs");

const getTariffRecord = async (apartmentId, cycleId) => {
  const tariffs = await getTariffRecords();
  return (
    tariffs.find(
      (record) =>
        apartmentMatches(record, apartmentId) &&
        (!cycleId || matchCycleRecord(record, cycleId))
    ) || null
  );
};

const getFlowRecords = async () => scanAllItems(appConfig.tables.flow);

const getLeakRecords = async () => scanAllOptional(appConfig.tables.leaks, "leak events");

const getApartmentFlatRows = (apartmentItems = [], apartmentId) =>
  apartmentItems
    .filter((item) => apartmentMatches(item, apartmentId))
    .flatMap((item) => {
      if (Array.isArray(item?.flats)) {
        return item.flats.map((flat) => ({
          apartment: item,
          flat,
        }));
      }

      if (getFlatId(item)) {
        return [
          {
            apartment: item,
            flat: item,
          },
        ];
      }

      return [];
    });

const findFlatAcrossApartments = async (flatId, apartmentId) => {
  const [apartments, users, deviceRecords, flowRecords, leakRecords] = await Promise.all([
    resolveApartmentItems(),
    resolveUsers(),
    resolveDevices(),
    getFlowRecords(),
    getLeakRecords(),
  ]);

  const normalizedFlatId = normalizeKey(flatId);
  const matched = getApartmentFlatRows(apartments, apartmentId).find(
    ({ flat }) => normalizeKey(getFlatId(flat)) === normalizedFlatId
  );
  const apartment = matched?.apartment || null;
  const flat = matched?.flat || null;

  if (!flat) {
    throw new Error(
      apartmentId
        ? `Flat ${flatId} not found for apartment ${apartmentId}`
        : `Flat ${flatId} not found`
    );
  }

  const flatUsers = users.filter(
    (userRecord) =>
      normalizeKey(getFlatId(userRecord)) === normalizedFlatId &&
      recordBelongsToApartment(userRecord, apartmentId)
  );
  const primaryUser = flatUsers[0] || null;

  const matchingDevices = deviceRecords.filter(
    (record) =>
      normalizeKey(getFlatId(record)) === normalizedFlatId &&
      recordBelongsToApartment(record, apartmentId)
  );
  const configuredDevices = [...(flat?.devices || []), ...matchingDevices];
  const deviceIds = new Set(configuredDevices.map(getDeviceId).map(normalizeKey).filter(Boolean));
  const matchingFlowRecords = flowRecords.filter((record) =>
    recordMatchesFlat(record, flatId, deviceIds, apartmentId)
  );
  const matchingLeaks = leakRecords.filter((record) =>
    recordMatchesFlat(record, flatId, deviceIds, apartmentId)
  );
  const devices = buildObservedDevices(
    configuredDevices,
    matchingFlowRecords,
    matchingLeaks
  );

  return {
    apartment,
    flat,
    primaryUser,
    flowRecords: matchingFlowRecords,
    leakEvents: matchingLeaks,
    devices,
  };
};

const buildFlatInfo = ({ flat, primaryUser, devices }) => ({
  flatId: getFlatId(flat),
  residentName:
    getResidentName(flat) ||
    getResidentName(primaryUser) ||
    [primaryUser?.first_name, primaryUser?.last_name].filter(Boolean).join(" ") ||
    String(getFlatId(flat)),
  email: getEmail(flat) || getEmail(primaryUser) || "",
  block: flat.block_id || flat.blockId || "",
  flatNo: flat.flat_no || flat.flatNo || getFlatId(flat),
  inletCount: devices.length || toFiniteNumber(flat.inlet_count || flat.inletCount, 0),
  installedMeters: devices.length || toFiniteNumber(flat.installed_meters || flat.installedMeters, 0),
  activeMeters: devices.filter((device) => device.status === "active").length,
});

function demoCycle() {
  const bc = demoApartment.billing_cycle;
  return {
    cycleId: `${bc.period_start}`,
    startDate: bc.period_start,
    endDate: bc.period_end,
    dueDate: bc.next_due,
    tariffPerKL: bc.tariff_per_kl,
    leakagePenaltyPerL: 0.5,
    societyInfo: {
      legalName: "Sobha Lakeview Residents Association",
      bank: "HDFC Bank",
      accNo: "XXXX1234567",
      ifsc: "HDFC0001234",
      accountName: "Sobha Lakeview Residents Association",
    },
  };
}

function demoFlats() {
  return demoApartment.flats.map((f) => ({
    flatId: f.flat_id,
    residentName: f.resident_name,
    email: f.resident_email,
    block: f.block_id,
    flatNo: f.flat_id,
    inletCount: f.devices?.length ?? 5,
    installedMeters: f.devices?.length ?? 5,
    activeMeters: f.devices?.filter((d) => d.status === "active").length ?? 5,
  }));
}

function demoReadingsForFlat(flat, options = {}) {
  const includedDates = options.periodStart && options.periodEnd
    ? new Set(buildDateRange(options.periodStart, options.periodEnd))
    : null;
  const dailyConsumption = includedDates
    ? flat.daily_consumption.filter((entry) => includedDates.has(normalizeIsoDate(entry.date)))
    : flat.daily_consumption;
  const leakEvents = includedDates
    ? (flat.leak_events || []).filter((event) =>
        includedDates.has(normalizeIsoDate(event.timestamp || event.date))
      )
    : (flat.leak_events || []);
  const totalLitres = dailyConsumption.reduce((sum, d) => sum + d.litres, 0);
  const devices = flat.devices || [];
  const baseShare = devices.length ? Math.floor(totalLitres / devices.length) : 0;
  let allocated = 0;
  const inletReadings = devices.map((device, index) => {
    const consumed = index === devices.length - 1 ? totalLitres - allocated : baseShare;
    allocated += consumed;
    const inlet = inferInlet(device);
    const leaked =
      leakEvents
        .filter((event) => normalizeKey(inferInlet(event)) === normalizeKey(inlet))
        .reduce((sum, event) => sum + toFiniteNumber(event.litres, 0), 0) ?? 0;

    return { label: inlet, consumed, leaked };
  });

  return {
    inlets: {
      kitchen: Math.round(totalLitres * 0.3),
      bath1: Math.round(totalLitres * 0.25),
      bath2: Math.round(totalLitres * 0.2),
      bath3: Math.round(totalLitres * 0.15),
      utility: Math.round(totalLitres * 0.1),
    },
    leakage: {
      kitchen:
        leakEvents
          .filter((event) => event.source === "Kitchen")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
      bath1:
        leakEvents
          .filter((event) => event.source === "Bathroom")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
      bath2: 0,
      bath3: 0,
      utility:
        leakEvents
          .filter((event) => event.source === "Utility")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
    },
    inletReadings,
    hasReadings: dailyConsumption.length > 0,
    prevConsumed: null,
    prevCharges: null,
  };
}

export async function getBillingCycle(cycleId, apartmentId) {
  if (appConfig.demoMode) {
    return demoCycle();
  }

  const tariffRecord = await getTariffRecord(apartmentId, cycleId);
  const apartments = await resolveApartmentItems();
  const apartmentInfo = apartments.find((record) => apartmentMatches(record, apartmentId));
  const apartmentMatch = apartments.find(
    (record) =>
      apartmentMatches(record, apartmentId) &&
      matchCycleRecord(record?.billing_cycle || record, cycleId)
  );

  if (apartmentMatch) {
    const cycle = normalizeBillingCycle(apartmentMatch?.billing_cycle || apartmentMatch, apartmentMatch);
    return mergeCycleWithTariff(cycle, tariffRecord);
  }

  if (tariffRecord) {
    return normalizeBillingCycle(tariffRecord, apartmentInfo || {});
  }

  const billingRecords = await getBillingRecords();
  const matchingRecord = billingRecords.find(
    (record) => matchCycleRecord(record, cycleId) && recordBelongsToApartment(record, apartmentId)
  );

  if (matchingRecord) {
    return normalizeBillingCycle(matchingRecord, apartmentInfo || {});
  }

  throw new Error(`Billing cycle ${cycleId} not found`);
}

export async function getCurrentBillingCycle(apartmentId) {
  if (appConfig.demoMode) {
    return demoCycle();
  }

  const apartment = await findApartmentById(apartmentId);
  if (apartment?.billing_cycle) {
    const cycle = normalizeBillingCycle(apartment.billing_cycle, apartment);
    const tariffRecord = await getTariffRecord(apartmentId, cycle.cycleId);
    return mergeCycleWithTariff(cycle, tariffRecord);
  }

  const tariffCycles = (await getTariffRecords())
    .filter((record) => apartmentMatches(record, apartmentId))
    .map((record) => normalizeBillingCycle(record, apartment || {}))
    .filter((cycle) => cycle.startDate);

  const latestTariffCycle = tariffCycles.sort((left, right) =>
    sortByIsoDate(left.startDate, right.startDate)
  ).at(-1);

  if (latestTariffCycle) {
    return latestTariffCycle;
  }

  const billingRecords = (await getBillingRecords())
    .filter((record) => recordBelongsToApartment(record, apartmentId))
    .map((record) => normalizeBillingCycle(record, apartment || {}))
    .filter((cycle) => cycle.startDate);

  const latestCycle = billingRecords.sort((left, right) =>
    sortByIsoDate(left.startDate, right.startDate)
  ).at(-1);

  if (!latestCycle) {
    throw new Error(
      apartmentId
        ? `Current billing cycle not found for apartment ${apartmentId}`
        : "Current billing cycle not found"
    );
  }

  return latestCycle;
}

export async function getAllActiveFlats(apartmentId) {
  if (appConfig.demoMode) {
    return demoFlats().filter((flat) => flat.email);
  }

  const [apartments, users, deviceRecords, flowRecords, leakRecords] = await Promise.all([
    resolveApartmentItems(),
    resolveUsers(),
    resolveDevices(),
    getFlowRecords(),
    getLeakRecords(),
  ]);

  const userByFlat = new Map(
    users
      .filter(
        (userRecord) =>
          getFlatId(userRecord) &&
          recordBelongsToApartment(userRecord, apartmentId)
      )
      .map((userRecord) => [
        normalizeKey(getFlatId(userRecord)),
        userRecord,
      ])
  );

  return getApartmentFlatRows(apartments, apartmentId)
    .map(({ flat }) => {
      const flatId = String(getFlatId(flat));
      const configuredDevices = [
        ...(flat.devices || []),
        ...deviceRecords.filter(
          (record) =>
            normalizeKey(getFlatId(record)) === normalizeKey(flatId) &&
            recordBelongsToApartment(record, apartmentId)
        ),
      ];
      const deviceIds = new Set(configuredDevices.map(getDeviceId).map(normalizeKey).filter(Boolean));
      const devices = buildObservedDevices(
        configuredDevices,
        flowRecords.filter((record) => recordMatchesFlat(record, flatId, deviceIds, apartmentId)),
        leakRecords.filter((record) => recordMatchesFlat(record, flatId, deviceIds, apartmentId))
      );

      return buildFlatInfo({
        flat,
        primaryUser: userByFlat.get(normalizeKey(flatId)) || null,
        devices,
      });
    })
    .filter((flat) => flat.email);
}

export async function getFlatById(flatId, apartmentId) {
  if (appConfig.demoMode) {
    const rawFlat = demoApartment.flats.find((flat) => flat.flat_id === flatId);
    if (!rawFlat) throw new Error(`Flat ${flatId} not found`);

    return {
      flatId: rawFlat.flat_id,
      residentName: rawFlat.resident_name,
      email: rawFlat.resident_email,
      block: rawFlat.block_id,
      flatNo: rawFlat.flat_id,
      inletCount: rawFlat.devices?.length ?? 5,
      installedMeters: rawFlat.devices?.length ?? 5,
      activeMeters: rawFlat.devices?.filter((device) => device.status === "active").length ?? 5,
    };
  }

  const result = await findFlatAcrossApartments(flatId, apartmentId);
  return buildFlatInfo(result);
}

export async function getFlatByEmail(email, apartmentId) {
  const normalizedEmail = normalizeKey(email);
  if (!normalizedEmail) {
    throw new Error("email is required");
  }

  if (appConfig.demoMode) {
    const flat = demoFlats().find((item) => normalizeKey(item.email) === normalizedEmail);
    if (flat) return flat;
  }

  const apartments = await resolveApartmentItems();
  const matched = getApartmentFlatRows(apartments, apartmentId).find(
    ({ flat }) => normalizeKey(getEmail(flat)) === normalizedEmail
  );

  if (matched) {
    return getFlatById(
      getFlatId(matched.flat),
      apartmentId || getApartmentId(matched.apartment)
    );
  }

  const flats = await getAllActiveFlats(apartmentId);
  const flat = flats.find((item) => normalizeKey(item.email) === normalizedEmail);

  if (flat) {
    return flat;
  }

  const users = await resolveUsers();
  const matchingUser = users.find(
    (userRecord) =>
      normalizeKey(getEmail(userRecord)) === normalizedEmail &&
      recordBelongsToApartment(userRecord, apartmentId)
  );

  if (matchingUser) {
    const flatId = getFlatId(matchingUser);
    if (!flatId) {
      throw new Error(
        `Email ${email} was found in UserCredentials, but that user has no flat_id/flat_number.`
      );
    }

    return getFlatById(flatId, apartmentId);
  }

  throw new Error(
    apartmentId
      ? `Email ${email} not found for apartment ${apartmentId}`
      : `Email ${email} not found`
  );
}

export async function getReadingsForFlat(flatId, cycleId, apartmentId, options = {}) {
  if (appConfig.demoMode) {
    const rawFlat = demoApartment.flats.find((flat) => flat.flat_id === flatId);
    if (!rawFlat) throw new Error(`Flat ${flatId} not found`);
    return demoReadingsForFlat(rawFlat, options);
  }

  const [cycle, flatResult] = await Promise.all([
    getBillingCycle(cycleId, apartmentId),
    findFlatAcrossApartments(flatId, apartmentId),
  ]);

  const bounds = buildCycleBounds(cycle, options);
  const currentFlow = bounds
    ? flatResult.flowRecords.filter((record) =>
        bounds.current.has(normalizeIsoDateInTimezone(record?.timestamp || record?.date))
      )
    : flatResult.flowRecords;
  const previousFlow = bounds
    ? flatResult.flowRecords.filter((record) =>
        bounds.previous.has(normalizeIsoDateInTimezone(record?.timestamp || record?.date))
      )
    : [];

  const currentLeaks = bounds
    ? flatResult.leakEvents.filter((event) =>
        bounds.current.has(normalizeIsoDateInTimezone(event?.timestamp || event?.date))
      )
    : flatResult.leakEvents;

  const { dailyMap } = aggregateDailyConsumption(currentFlow);
  const totalLitres = Array.from(dailyMap.values()).reduce((sum, litres) => sum + litres, 0);
  const previousConsumption = previousFlow.reduce(
    (sum, record) => sum + getFlowLitres(record),
    0
  );
  const hasPreviousReadings = previousFlow.length > 0;

  return {
    leakage: aggregateLeakage(currentLeaks),
    inletReadings: buildInletReadings(flatResult.devices, currentFlow, currentLeaks),
    hasReadings: currentFlow.length > 0,
    prevConsumed: hasPreviousReadings ? previousConsumption : null,
    prevCharges: hasPreviousReadings
      ? Math.round((previousConsumption / 1000) * cycle.tariffPerKL)
      : null,
  };
}

export async function getReadingsForCycle(cycleId, flatIds, apartmentId) {
  if (appConfig.demoMode) {
    const map = {};
    for (const id of flatIds) {
      const rawFlat = demoApartment.flats.find((flat) => flat.flat_id === id);
      if (rawFlat) {
        map[id] = demoReadingsForFlat(rawFlat);
      }
    }
    return map;
  }

  const cycle = await getBillingCycle(cycleId, apartmentId);
  const results = await Promise.all(
    flatIds.map(async (flatId) => [
      flatId,
      await getReadingsForFlat(flatId, cycle.cycleId, apartmentId),
    ])
  );

  return Object.fromEntries(results);
}

