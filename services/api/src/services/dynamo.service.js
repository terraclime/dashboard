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

  return {
    cycleId: String(cycleId || ""),
    startDate: normalizeIsoDate(source.period_start || source.startDate || source.start_date),
    endDate: normalizeIsoDate(source.period_end || source.endDate || source.end_date),
    dueDate: normalizeIsoDate(source.next_due || source.dueDate || source.due_date),
    tariffPerKL: toFiniteNumber(
      source.tariff_per_kl || source.tariffPerKL || source.tariff || source.rate_per_kl,
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

const resolveUsers = async () => scanAllItems(appConfig.tables.users);

const getBillingRecords = async () => scanAllItems(appConfig.tables.billing);

const getFlowRecords = async () => scanAllItems(appConfig.tables.flow);

const getLeakRecords = async () => scanAllItems(appConfig.tables.leaks);

const findFlatAcrossApartments = async (flatId) => {
  const [apartments, users, flowRecords, leakRecords] = await Promise.all([
    resolveApartmentItems(),
    resolveUsers(),
    getFlowRecords(),
    getLeakRecords(),
  ]);

  const normalizedFlatId = String(flatId).toLowerCase();
  const apartment = apartments.find((item) =>
    (item?.flats || []).some(
      (flat) => String(flat?.flat_id || flat?.flatId || "").toLowerCase() === normalizedFlatId
    )
  );

  const flat =
    apartment?.flats?.find(
      (item) => String(item?.flat_id || item?.flatId || "").toLowerCase() === normalizedFlatId
    ) || null;

  if (!flat) {
    throw new Error(`Flat ${flatId} not found`);
  }

  const flatUsers = users.filter(
    (userRecord) => String(userRecord?.flat_id || userRecord?.flatId || "").toLowerCase() === normalizedFlatId
  );
  const primaryUser = flatUsers[0] || null;

  const matchingFlowRecords = flowRecords.filter(
    (record) => String(record?.flat_id || record?.flatId || "").toLowerCase() === normalizedFlatId
  );
  const matchingLeaks = leakRecords.filter(
    (record) => String(record?.flat_id || record?.flatId || "").toLowerCase() === normalizedFlatId
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
  flatId: flat.flat_id || flat.flatId,
  residentName:
    flat.resident_name ||
    flat.residentName ||
    [primaryUser?.first_name, primaryUser?.last_name].filter(Boolean).join(" ") ||
    String(flat.flat_id || flat.flatId),
  email:
    flat.resident_email ||
    flat.email ||
    primaryUser?.resident_email ||
    primaryUser?.user_mail ||
    "",
  block: flat.block_id || flat.blockId || "",
  flatNo: flat.flat_no || flat.flatNo || flat.flat_id || flat.flatId,
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

export async function getBillingCycle(cycleId) {
  if (appConfig.demoMode) {
    return demoCycle();
  }

  const billingRecords = await getBillingRecords();
  const matchingRecord = billingRecords.find((record) => matchCycleRecord(record, cycleId));

  if (matchingRecord) {
    return normalizeBillingCycle(matchingRecord, {});
  }

  const apartments = await resolveApartmentItems();
  const apartmentMatch = apartments.find((record) =>
    matchCycleRecord(record?.billing_cycle || record, cycleId)
  );

  if (!apartmentMatch) {
    throw new Error(`Billing cycle ${cycleId} not found`);
  }

  return normalizeBillingCycle(apartmentMatch?.billing_cycle || apartmentMatch, {});
}

export async function getAllActiveFlats() {
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
      .filter((userRecord) => userRecord?.flat_id || userRecord?.flatId)
      .map((userRecord) => [
        String(userRecord.flat_id || userRecord.flatId).toLowerCase(),
        userRecord,
      ])
  );

  return apartments
    .flatMap((apartment) => apartment?.flats || [])
    .map((flat) => {
      const flatId = String(flat.flat_id || flat.flatId);
      const devices = buildObservedDevices(
        flat.devices,
        flowRecords.filter(
          (record) => String(record?.flat_id || record?.flatId || "").toLowerCase() === flatId.toLowerCase()
        ),
        leakRecords.filter(
          (record) => String(record?.flat_id || record?.flatId || "").toLowerCase() === flatId.toLowerCase()
        )
      );

      return buildFlatInfo({
        flat,
        primaryUser: userByFlat.get(flatId.toLowerCase()) || null,
        devices,
      });
    })
    .filter((flat) => flat.email);
}

export async function getFlatById(flatId) {
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

  const result = await findFlatAcrossApartments(flatId);
  return buildFlatInfo(result);
}

export async function getReadingsForFlat(flatId, cycleId) {
  if (appConfig.demoMode) {
    const rawFlat = demoApartment.flats.find((flat) => flat.flat_id === flatId);
    if (!rawFlat) throw new Error(`Flat ${flatId} not found`);
    return demoReadingsForFlat(rawFlat);
  }

  const [cycle, flatResult] = await Promise.all([
    getBillingCycle(cycleId),
    findFlatAcrossApartments(flatId),
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

export async function getReadingsForCycle(cycleId, flatIds) {
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

  const cycle = await getBillingCycle(cycleId);
  const results = await Promise.all(
    flatIds.map(async (flatId) => [flatId, await getReadingsForFlat(flatId, cycle.cycleId)])
  );

  return Object.fromEntries(results);
}

