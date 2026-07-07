import { demoApartment, demoBilling, demoUsers } from "../data/demoData.js";
import { appConfig } from "../config/env.js";
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

const INLET_ALIASES = {
  kitchen: "Kitchen",
  bath: "Bathroom",
  bath1: "Bathroom",
  bath2: "Bathroom",
  bath3: "Bathroom",
  bathroom: "Bathroom",
  utility: "Utility",
};

const normalizeResidentName = (userRecord) => {
  const nameParts = [userRecord?.first_name, userRecord?.last_name].filter(Boolean);
  return nameParts.join(" ").trim();
};

const normalizeBillingCycle = (primarySource = {}, fallbackSource = {}) => {
  const source =
    primarySource?.billing_cycle && typeof primarySource.billing_cycle === "object"
      ? { ...fallbackSource, ...primarySource.billing_cycle, ...primarySource }
      : { ...fallbackSource, ...primarySource };

  const startDate = normalizeIsoDate(
    source.period_start || source.startDate || source.start_date || source.cycleId
  );
  const endDate = normalizeIsoDate(source.period_end || source.endDate || source.end_date);
  const dueDate = normalizeIsoDate(source.next_due || source.dueDate || source.due_date);

  return {
    label: source.label || source.name || source.cycle_name || "Current cycle",
    period_start: startDate,
    period_end: endDate,
    next_due: dueDate,
    tariff_per_kl: toFiniteNumber(
      source.tariff_per_kl || source.tariffPerKL || source.tariff || source.rate_per_kl,
      0
    ),
    maintenance_fee: toFiniteNumber(
      source.maintenance_fee || source.maintenanceFee || source.fixed_fee,
      0
    ),
  };
};

const normalizeApartmentItem = (apartmentId, item) => {
  const flats = Array.isArray(item?.flats) ? item.flats : [];

  return {
    apartment_id: item?.apartment_id || apartmentId,
    apartment_name: item?.apartment_name || item?.name || "Apartment",
    address: item?.address || "",
    billing_cycle: normalizeBillingCycle(item, item?.billing_cycle || {}),
    flats,
  };
};

const inferInlet = (device = {}) => {
  const rawValue =
    device.inlet ||
    device.source ||
    device.location ||
    (typeof device.device_id === "string" ? device.device_id.split("-").at(-1) : "");

  const normalized = String(rawValue || "").trim().toLowerCase();

  if (!normalized) {
    return "Unknown";
  }

  return (
    INLET_ALIASES[normalized] ||
    normalized
      .split(/[_\s]+/)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ")
  );
};

const bucketForSource = (source) => {
  const normalized = String(source || "").trim().toLowerCase();

  if (normalized.includes("kitchen")) return "kitchen";
  if (normalized.includes("utility")) return "utility";
  if (normalized.includes("bath")) return "bath1";

  return "bath1";
};

const matchCycleRecord = (record, cycleId) => {
  const candidates = [
    record?.cycle_id,
    record?.cycleId,
    record?.period_start,
    record?.startDate,
    record?.start_date,
    record?.billing_cycle?.cycle_id,
    record?.billing_cycle?.cycleId,
    record?.billing_cycle?.period_start,
  ]
    .map((value) => (value == null ? null : String(value)))
    .filter(Boolean);

  return candidates.includes(String(cycleId));
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getCalendarMonthBounds = (monthsAgo, baseDate = new Date()) => {
  const start = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - monthsAgo, 1)
  );
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - monthsAgo + 1, 0)
  );

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
};

const buildCycleSeries = (dailyTotals) => {
  const buildSeries = (monthsAgo) => {
    const { startDate, endDate } = getCalendarMonthBounds(monthsAgo);
    const labels = buildDateRange(startDate, endDate);

    return {
      labels,
      values: labels.map((date) => dailyTotals.get(date) || 0),
    };
  };

  return {
    current: buildSeries(0),
    "previous-1": buildSeries(1),
    "previous-2": buildSeries(2),
  };
};

const buildUserLookup = (userRecords = []) => {
  const byMail = new Map();
  const byFlat = new Map();

  userRecords.forEach((userRecord) => {
    if (userRecord?.user_mail) {
      byMail.set(String(userRecord.user_mail).toLowerCase(), userRecord);
    }

    const flatId = userRecord?.flat_id || userRecord?.flatId;
    if (flatId) {
      byFlat.set(String(flatId).toLowerCase(), userRecord);
    }
  });

  return { byMail, byFlat };
};

const buildObservedFlowState = (flowRecords = []) => {
  const flatDaily = new Map();
  const flatDevices = new Map();
  const apartmentDaily = new Map();

  flowRecords.forEach((record) => {
    const flatId = record?.flat_id || record?.flatId;
    const date = normalizeIsoDate(record?.timestamp || record?.date);
    const litres = sumHourlyValues(record);

    if (!flatId || !date) {
      return;
    }

    const normalizedFlatId = String(flatId).toLowerCase();
    const deviceId = record?.device_id || record?.deviceId;
    const currentFlatDaily = flatDaily.get(normalizedFlatId) || new Map();
    currentFlatDaily.set(date, (currentFlatDaily.get(date) || 0) + litres);
    flatDaily.set(normalizedFlatId, currentFlatDaily);

    apartmentDaily.set(date, (apartmentDaily.get(date) || 0) + litres);

    if (deviceId) {
      const currentDevices = flatDevices.get(normalizedFlatId) || new Map();
      const currentDevice = currentDevices.get(deviceId) || {
        device_id: deviceId,
        inlet: inferInlet(record),
        status: "active",
        last_seen: null,
        leak_today_litres: 0,
      };

      currentDevice.inlet = currentDevice.inlet || inferInlet(record);
      currentDevice.last_seen =
        !currentDevice.last_seen || new Date(record.timestamp) > new Date(currentDevice.last_seen)
          ? record.timestamp
          : currentDevice.last_seen;
      currentDevice.status = record?.status || currentDevice.status || "active";

      currentDevices.set(deviceId, currentDevice);
      flatDevices.set(normalizedFlatId, currentDevices);
    }
  });

  return { flatDaily, flatDevices, apartmentDaily };
};

const buildLeakLookup = (leakRecords = []) => {
  const byFlat = new Map();

  leakRecords.forEach((record) => {
    const flatId = record?.flat_id || record?.flatId;
    if (!flatId) {
      return;
    }

    const normalizedFlatId = String(flatId).toLowerCase();
    const current = byFlat.get(normalizedFlatId) || [];
    current.push({
      ...record,
      timestamp: record?.timestamp || record?.created_at || new Date().toISOString(),
      litres: toFiniteNumber(record?.litres, 0),
      source: record?.source || inferInlet(record),
      status: record?.status || "pending",
      block: record?.block || record?.block_id || record?.blockId || null,
      device_id: record?.device_id || record?.deviceId || null,
    });
    byFlat.set(normalizedFlatId, current);
  });

  byFlat.forEach((events, flatId) => {
    byFlat.set(
      flatId,
      events.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
    );
  });

  return byFlat;
};

const mergeDevices = (metadataDevices = [], observedDevices = new Map(), leakEvents = []) => {
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
      leak_today_litres: toFiniteNumber(device?.leak_today_litres, 0),
    });
  });

  observedDevices.forEach((device, deviceId) => {
    const existing = devices.get(deviceId) || {
      device_id: deviceId,
      inlet: device.inlet,
      status: "active",
      last_seen: null,
      leak_today_litres: 0,
    };

    existing.inlet = existing.inlet || device.inlet;
    existing.status = device.status || existing.status || "active";
    existing.last_seen =
      !existing.last_seen || new Date(device.last_seen) > new Date(existing.last_seen)
        ? device.last_seen
        : existing.last_seen;
    devices.set(deviceId, existing);
  });

  leakEvents.forEach((event) => {
    const deviceId = event.device_id;
    if (!deviceId || !devices.has(deviceId)) {
      return;
    }

    const device = devices.get(deviceId);
    device.leak_today_litres += toFiniteNumber(event.litres, 0);
  });

  return Array.from(devices.values());
};

const buildDailySeriesFromMap = (dailyMap = new Map(), fallbackSeries = []) => {
  if (dailyMap.size > 0) {
    return Array.from(dailyMap.entries())
      .sort((left, right) => sortByIsoDate(left[0], right[0]))
      .map(([date, litres]) => ({
        date,
        litres,
      }));
  }

  return Array.isArray(fallbackSeries) ? fallbackSeries : [];
};

const buildApartmentDailyTotals = (flats = []) => {
  const dailyTotals = new Map();

  flats.forEach((flat) => {
    (flat.daily_consumption || []).forEach((entry) => {
      const date = normalizeIsoDate(entry.date);
      if (!date) return;

      dailyTotals.set(date, (dailyTotals.get(date) || 0) + toFiniteNumber(entry.litres, 0));
    });
  });

  return dailyTotals;
};

const enrichFlat = (flat, userLookup, flatDaily, flatDevices, flatLeaks) => {
  const flatId = String(flat?.flat_id || flat?.flatId || "").trim();
  const flatKey = flatId.toLowerCase();
  const fallbackUser = userLookup.byFlat.get(flatKey);

  const dailyConsumption = buildDailySeriesFromMap(
    flatDaily.get(flatKey),
    flat?.daily_consumption
  );
  const leakEvents = flatLeaks.get(flatKey) || flat?.leak_events || [];
  const devices = mergeDevices(flat?.devices, flatDevices.get(flatKey), leakEvents);

  return {
    flat_id: flatId,
    block_id: flat?.block_id || flat?.blockId || leakEvents[0]?.block || "",
    resident_name:
      flat?.resident_name ||
      flat?.residentName ||
      normalizeResidentName(fallbackUser) ||
      `Flat ${flatId}`,
    resident_email:
      flat?.resident_email ||
      flat?.email ||
      fallbackUser?.resident_email ||
      fallbackUser?.user_mail ||
      "",
    resident_whatsapp: flat?.resident_whatsapp || flat?.residentWhatsapp || "",
    devices,
    daily_consumption: dailyConsumption,
    leak_events: leakEvents,
  };
};

const resolveApartmentItem = async (apartmentId) => {
  const direct = await getItemByKey(appConfig.tables.apartments, {
    apartment_id: apartmentId,
  });

  if (direct) {
    return direct;
  }

  const scanned = await scanItemsByAttribute(
    appConfig.tables.apartments,
    "apartment_id",
    apartmentId
  );

  return scanned[0] || null;
};

const resolveBillingRecord = async (apartmentId, apartmentCycle) => {
  const billingRecords = await scanItemsByAttribute(
    appConfig.tables.billing,
    "apartment_id",
    apartmentId
  );

  if (!billingRecords.length) {
    return null;
  }

  const preferredCycleId = apartmentCycle?.period_start;
  const preferredRecord =
    billingRecords.find((record) => matchCycleRecord(record, preferredCycleId)) ||
    billingRecords.sort((left, right) => {
      const leftDate =
        normalizeIsoDate(left?.period_start || left?.billing_cycle?.period_start) || "";
      const rightDate =
        normalizeIsoDate(right?.period_start || right?.billing_cycle?.period_start) || "";
      return sortByIsoDate(leftDate, rightDate);
    }).at(-1);

  return preferredRecord || null;
};

export const getAnalyticsSnapshot = async (apartmentId) => {
  if (appConfig.demoMode) {
    const dailyTotals = buildApartmentDailyTotals(demoApartment.flats);

    return {
      apartment_id: demoApartment.apartment_id,
      apartment_name: demoApartment.apartment_name,
      address: demoApartment.address,
      billing_cycle: demoApartment.billing_cycle,
      flats: demoApartment.flats,
      cycle_series: buildCycleSeries(dailyTotals),
      finance: demoBilling,
    };
  }

  if (!apartmentId) {
    throw new Error("apartment_id is required");
  }

  const apartmentItem = await resolveApartmentItem(apartmentId);
  if (!apartmentItem) {
    throw new Error(`Apartment ${apartmentId} not found`);
  }

  const apartment = normalizeApartmentItem(apartmentId, apartmentItem);
  const flatIds = new Set(
    apartment.flats
      .map((flat) => flat?.flat_id || flat?.flatId)
      .filter(Boolean)
      .map((flatId) => String(flatId).toLowerCase())
  );

  let [flowRecords, leakRecords, userRecords, billingRecord] = await Promise.all([
    scanItemsByAttribute(appConfig.tables.flow, "apartment_id", apartmentId),
    scanItemsByAttribute(appConfig.tables.leaks, "apartment_id", apartmentId),
    scanItemsByAttribute(appConfig.tables.users, "apartment_id", apartmentId),
    resolveBillingRecord(apartmentId, apartment.billing_cycle),
  ]);

  if (!flowRecords.length && flatIds.size) {
    const allFlow = await scanAllItems(appConfig.tables.flow);
    flowRecords = allFlow.filter((record) =>
      flatIds.has(String(record?.flat_id || record?.flatId || "").toLowerCase())
    );
  }

  if (!leakRecords.length && flatIds.size) {
    const allLeaks = await scanAllItems(appConfig.tables.leaks);
    leakRecords = allLeaks.filter((record) =>
      flatIds.has(String(record?.flat_id || record?.flatId || "").toLowerCase())
    );
  }

  const userLookup = buildUserLookup(userRecords);
  const { flatDaily, flatDevices, apartmentDaily } = buildObservedFlowState(flowRecords);
  const flatLeaks = buildLeakLookup(leakRecords);
  const enrichedFlats = apartment.flats.map((flat) =>
    enrichFlat(flat, userLookup, flatDaily, flatDevices, flatLeaks)
  );

  const inferredFlatIds = new Set([
    ...flatDaily.keys(),
    ...flatDevices.keys(),
    ...flatLeaks.keys(),
  ]);

  inferredFlatIds.forEach((flatKey) => {
    if (enrichedFlats.some((flat) => flat.flat_id.toLowerCase() === flatKey)) {
      return;
    }

    enrichedFlats.push(
      enrichFlat(
        {
          flat_id: flatKey.toUpperCase(),
          resident_name: `Flat ${flatKey.toUpperCase()}`,
        },
        userLookup,
        flatDaily,
        flatDevices,
        flatLeaks
      )
    );
  });

  const billingCycle = normalizeBillingCycle(
    billingRecord || apartmentItem?.billing_cycle || {},
    apartment.billing_cycle
  );

  return {
    apartment_id: apartment.apartment_id,
    apartment_name: apartment.apartment_name,
    address: apartment.address,
    billing_cycle: billingCycle,
    flats: enrichedFlats,
    cycle_series: buildCycleSeries(apartmentDaily),
    finance: billingRecord || demoBilling,
  };
};

export const getLiveUserProfile = async (userMail) => {
  if (appConfig.demoMode) {
    const userRecord = demoUsers.find(
      (record) => record.user_mail.toLowerCase() === String(userMail).toLowerCase()
    );

    if (!userRecord) {
      return null;
    }

    return {
      userRecord,
      apartment: demoApartment,
    };
  }

  const userRecord =
    (await getItemByKey(appConfig.tables.users, {
      user_mail: userMail,
    })) ||
    (await scanItemsByAttribute(appConfig.tables.users, "user_mail", userMail))[0] ||
    null;

  if (!userRecord) {
    return null;
  }

  const apartment = await getAnalyticsSnapshot(userRecord.apartment_id);
  return { userRecord, apartment };
};
