import { appConfig } from "../config/env.js";
import { demoApartment } from "../data/demoData.js";
import {
  buildDateRange,
  getItemByKey,
  normalizeIsoDate,
  scanAllItems,
  scanItemsByAttribute,
  sortByIsoDate,
  sumHourlyValues,
  toFiniteNumber,
} from "./dynamoUtils.service.js";

const DEFAULT_SOCIETY_INFO = {
  legalName: "Terraclime Residents Association",
  appName: "Terraclime",
  bank: "",
  accNo: "",
  ifsc: "",
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
  const rawValue =
    device.inlet ||
    device.source ||
    (typeof device.device_id === "string" ? device.device_id.split("-").at(-1) : "");

  const normalized = String(rawValue || "").trim().toLowerCase();

  if (normalized.includes("kitchen")) return "Kitchen";
  if (normalized.includes("utility")) return "Utility";
  if (normalized.includes("bath")) return "Bathroom";

  return rawValue || "Unknown";
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
        source.society_legal_name ||
        source.societyLegalName ||
        source.societyInfo?.legalName ||
        DEFAULT_SOCIETY_INFO.legalName,
      appName:
        source.app_name ||
        source.appName ||
        source.societyInfo?.appName ||
        DEFAULT_SOCIETY_INFO.appName,
      bank:
        source.society_bank ||
        source.societyBank ||
        source.societyInfo?.bank ||
        DEFAULT_SOCIETY_INFO.bank,
      accNo:
        source.society_acc_no ||
        source.societyAccNo ||
        source.societyInfo?.accNo ||
        DEFAULT_SOCIETY_INFO.accNo,
      ifsc:
        source.society_ifsc ||
        source.societyIfsc ||
        source.societyInfo?.ifsc ||
        DEFAULT_SOCIETY_INFO.ifsc,
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
      inlet: device?.inlet || inferInlet(device),
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

    const litres = sumHourlyValues(record);
    dailyMap.set(date, (dailyMap.get(date) || 0) + litres);

    const inlet = inferInlet(record);
    inletMap.set(inlet, (inletMap.get(inlet) || 0) + litres);
  });

  return { dailyMap, inletMap };
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

const buildInletDistribution = (inletMap = new Map(), totalLitres = 0) => {
  if (inletMap.size) {
    return {
      kitchen: Math.round(inletMap.get("Kitchen") || 0),
      bath1: Math.round(inletMap.get("Bathroom") || 0),
      bath2: 0,
      bath3: 0,
      utility: Math.round(inletMap.get("Utility") || 0),
    };
  }

  return {
    kitchen: Math.round(totalLitres * 0.3),
    bath1: Math.round(totalLitres * 0.25),
    bath2: Math.round(totalLitres * 0.2),
    bath3: Math.round(totalLitres * 0.15),
    utility: Math.round(totalLitres * 0.1),
  };
};

const buildCycleBounds = (cycle) => {
  if (!cycle?.startDate || !cycle?.endDate) {
    return null;
  }

  return {
    current: new Set(buildDateRange(cycle.startDate, cycle.endDate)),
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
  const [apartments, users, flowRecords, leakRecords] = await Promise.all([
    resolveApartmentItems(),
    resolveUsers(),
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

  const matchingFlowRecords = flowRecords.filter(
    (record) =>
      normalizeKey(getFlatId(record)) === normalizedFlatId &&
      recordBelongsToApartment(record, apartmentId)
  );
  const matchingLeaks = leakRecords.filter(
    (record) =>
      normalizeKey(getFlatId(record)) === normalizedFlatId &&
      recordBelongsToApartment(record, apartmentId)
  );
  const devices = buildObservedDevices(flat?.devices, matchingFlowRecords, matchingLeaks);

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
      appName: "MyGate",
      bank: "HDFC Bank",
      accNo: "XXXX1234567",
      ifsc: "HDFC0001234",
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

function demoReadingsForFlat(flat) {
  const totalLitres = flat.daily_consumption.reduce((sum, d) => sum + d.litres, 0);
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
        flat.leak_events
          ?.filter((event) => event.source === "Kitchen")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
      bath1:
        flat.leak_events
          ?.filter((event) => event.source === "Bathroom")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
      bath2: 0,
      bath3: 0,
      utility:
        flat.leak_events
          ?.filter((event) => event.source === "Utility")
          .reduce((sum, event) => sum + event.litres, 0) ?? 0,
    },
    prevConsumed: Math.round(totalLitres * 0.94),
    prevCharges: Math.round(
      ((totalLitres * 0.94) / 1000) * demoApartment.billing_cycle.tariff_per_kl
    ),
  };
}

export async function getBillingCycle(cycleId, apartmentId) {
  if (appConfig.demoMode) {
    return demoCycle();
  }

  const tariffRecord = await getTariffRecord(apartmentId, cycleId);
  const apartments = await resolveApartmentItems();
  const apartmentMatch = apartments.find(
    (record) =>
      apartmentMatches(record, apartmentId) &&
      matchCycleRecord(record?.billing_cycle || record, cycleId)
  );

  if (apartmentMatch) {
    const cycle = normalizeBillingCycle(apartmentMatch?.billing_cycle || apartmentMatch, {});
    return mergeCycleWithTariff(cycle, tariffRecord);
  }

  if (tariffRecord) {
    return normalizeBillingCycle(tariffRecord, {});
  }

  const billingRecords = await getBillingRecords();
  const matchingRecord = billingRecords.find(
    (record) => matchCycleRecord(record, cycleId) && recordBelongsToApartment(record, apartmentId)
  );

  if (matchingRecord) {
    return normalizeBillingCycle(matchingRecord, {});
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
    .map((record) => normalizeBillingCycle(record, {}))
    .filter((cycle) => cycle.startDate);

  const latestTariffCycle = tariffCycles.sort((left, right) =>
    sortByIsoDate(left.startDate, right.startDate)
  ).at(-1);

  if (latestTariffCycle) {
    return latestTariffCycle;
  }

  const billingRecords = (await getBillingRecords())
    .filter((record) => recordBelongsToApartment(record, apartmentId))
    .map((record) => normalizeBillingCycle(record, {}))
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

  const [apartments, users, flowRecords, leakRecords] = await Promise.all([
    resolveApartmentItems(),
    resolveUsers(),
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
      const devices = buildObservedDevices(
        flat.devices,
        flowRecords.filter(
          (record) =>
            normalizeKey(getFlatId(record)) === normalizeKey(flatId) &&
            recordBelongsToApartment(record, apartmentId)
        ),
        leakRecords.filter(
          (record) =>
            normalizeKey(getFlatId(record)) === normalizeKey(flatId) &&
            recordBelongsToApartment(record, apartmentId)
        )
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

export async function getReadingsForFlat(flatId, cycleId, apartmentId) {
  if (appConfig.demoMode) {
    const rawFlat = demoApartment.flats.find((flat) => flat.flat_id === flatId);
    if (!rawFlat) throw new Error(`Flat ${flatId} not found`);
    return demoReadingsForFlat(rawFlat);
  }

  const [cycle, flatResult] = await Promise.all([
    getBillingCycle(cycleId, apartmentId),
    findFlatAcrossApartments(flatId, apartmentId),
  ]);

  const bounds = buildCycleBounds(cycle);
  const currentFlow = bounds
    ? flatResult.flowRecords.filter((record) =>
        bounds.current.has(normalizeIsoDate(record?.timestamp || record?.date))
      )
    : flatResult.flowRecords;
  const previousFlow = bounds
    ? flatResult.flowRecords.filter((record) =>
        bounds.previous.has(normalizeIsoDate(record?.timestamp || record?.date))
      )
    : [];

  const currentLeaks = bounds
    ? flatResult.leakEvents.filter((event) =>
        bounds.current.has(normalizeIsoDate(event?.timestamp || event?.date))
      )
    : flatResult.leakEvents;

  const { dailyMap, inletMap } = aggregateDailyConsumption(currentFlow);
  const totalLitres = Array.from(dailyMap.values()).reduce((sum, litres) => sum + litres, 0);
  const previousConsumption = previousFlow.reduce(
    (sum, record) => sum + sumHourlyValues(record),
    0
  );

  return {
    inlets: buildInletDistribution(inletMap, totalLitres),
    leakage: aggregateLeakage(currentLeaks),
    prevConsumed: previousConsumption || Math.round(totalLitres * 0.94),
    prevCharges: Math.round(
      ((previousConsumption || Math.round(totalLitres * 0.94)) / 1000) * cycle.tariffPerKL
    ),
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

