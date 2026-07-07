import bcrypt from "bcryptjs";

const passwordHash = bcrypt.hashSync("Demo@123", 10);

const BLOCKS = ["Block A", "Block B", "Block C", "Block D", "Block E"];
const DAYS_IN_CYCLE = 30;
const CYCLE_START = new Date("2025-04-01T00:00:00Z");

const generateDailyConsumption = (baseLitres, variation = 0.12) =>
  Array.from({ length: DAYS_IN_CYCLE }).map((_, index) => {
    const date = new Date(CYCLE_START);
    date.setDate(date.getDate() + index);
    const modifier = 1 + variation * Math.sin(index / 3);
    const litres = Math.round(baseLitres * modifier);
    return {
      date: date.toISOString().slice(0, 10),
      litres,
    };
  });

const generateDevices = (blockId, flatCode, baseLeak = 0) => {
  const baseId = `${blockId.replace("Block ", "").toUpperCase()}${flatCode}`;
  return [
    {
      device_id: `${baseId}-KITCHEN`,
      inlet: "Kitchen",
      status: "active",
      last_seen: "2025-04-15T09:45:00+05:30",
      leak_today_litres: Math.max(0, baseLeak - 2),
    },
    {
      device_id: `${baseId}-BATH`,
      inlet: "Bathroom",
      status: "active",
      last_seen: "2025-04-15T09:30:00+05:30",
      leak_today_litres: Math.max(0, baseLeak - 4),
    },
    {
      device_id: `${baseId}-UTILITY`,
      inlet: "Utility",
      status: Math.random() > 0.85 ? "inactive" : "active",
      last_seen: "2025-04-15T09:15:00+05:30",
      leak_today_litres: Math.max(0, baseLeak - 6),
    },
  ];
};

const generateLeakEvents = (dailySeries, apartmentBlock) => {
  const events = [];
  dailySeries.forEach((entry, index) => {
    if (index % 9 === 0 && Math.random() > 0.4) {
      events.push({
        timestamp: `${entry.date}T08:00:00+05:30`,
        litres: Math.round(entry.litres * 0.03),
        status: index % 18 === 0 ? "resolved" : "pending",
        source: ["Kitchen", "Bathroom", "Utility"][index % 3],
        block: apartmentBlock,
      });
    }
  });
  return events;
};

const residents = Array.from({ length: 50 }).map((_, index) => {
  const blockIndex = index % BLOCKS.length;
  const blockId = BLOCKS[blockIndex];
  const flatNumber = Math.floor(index / BLOCKS.length) + 101;
  const flatCode = `${blockId.split(" ")[1][0]}-${flatNumber}`;
  const baseLitres = 320 + (index % 7) * 35;
  const daily_consumption = generateDailyConsumption(baseLitres, 0.1 + (index % 5) * 0.02);
  const leak_events = generateLeakEvents(daily_consumption, blockId).slice(0, 3);

  return {
    flat_id: flatCode,
    block_id: blockId,
    resident_name: `Resident ${blockId.split(" ")[1]} ${flatNumber}`,
    resident_email: `resident${index + 1}@example.com`,
    resident_whatsapp: `+91 98${(7650000 + index * 17).toString().padStart(7, "0")}`,
    devices: generateDevices(blockId, flatNumber, index % 5),
    daily_consumption,
    leak_events,
  };
});

const totalConsumption = residents.reduce((sum, flat) => {
  return (
    sum +
    flat.daily_consumption.reduce((inner, entry) => inner + entry.litres, 0)
  );
}, 0);

const billingCycle = {
  label: "April 2025",
  period_start: "2025-04-01",
  period_end: "2025-04-30",
  next_due: "2025-04-28",
  tariff_per_kl: 48,
  maintenance_fee: 0,
};

const previousCycle = (monthsAgo, factor) => {
  const start = new Date(CYCLE_START);
  start.setMonth(start.getMonth() - monthsAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + DAYS_IN_CYCLE - 1);
  const formatter = (date) => date.toISOString().slice(0, 10);

  const labels = Array.from({ length: DAYS_IN_CYCLE }).map((_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return formatter(date);
  });

  const values = labels.map((_, index) => {
    const base = totalConsumption / DAYS_IN_CYCLE;
    const modifier = 1 + 0.08 * Math.sin((index + monthsAgo) / 2);
    return Math.round((base * factor) * modifier);
  });

  return { labels, values };
};

const cycleSeries = {
  current: {
    labels: residents[0].daily_consumption.map((entry) => entry.date),
    values: residents[0].daily_consumption.map((_, index) =>
      residents.reduce((sum, flat) => {
        const reading = flat.daily_consumption[index];
        return sum + (reading ? reading.litres : 0);
      }, 0)
    ),
  },
  "previous-1": previousCycle(1, 0.94),
  "previous-2": previousCycle(2, 0.89),
};

export const demoUsers = [
  {
    user_mail: "demo@terraclime.com",
    role: "user",
    first_name: "Hariprasad",
    last_name: "Manoharan",
    apartment_id: "SOBHA-TWR-1",
    apartment_name: "Sobha Lakeview Apartments",
    hash_password: passwordHash,
  },
];

export const demoApartment = {
  apartment_id: "SOBHA-TWR-1",
  apartment_name: "Sobha Lakeview Apartments",
  address: "Bellandur, Bengaluru",
  billing_cycle: billingCycle,
  flats: residents,
  cycle_series: cycleSeries,
};

const perFlatBilling = residents.map((flat) => {
  const consumption = flat.daily_consumption.reduce(
    (sum, entry) => sum + entry.litres,
    0
  );
  return {
    flat_id: flat.flat_id,
    block_id: flat.block_id,
    resident_name: flat.resident_name,
    consumption_litres: consumption,
    projected_amount: Math.round((consumption / 1000) * billingCycle.tariff_per_kl),
  };
});

export const demoBilling = {
  last_generated_on: "2025-04-10",
  next_bill_on: "2025-04-30",
  total_consumption_litres: totalConsumption,
  projected_amount: perFlatBilling.reduce(
    (sum, entry) => sum + entry.projected_amount,
    0
  ),
  outstanding_amount: 2150,
  notes: [],
  per_flat: perFlatBilling,
};
