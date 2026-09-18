// Prepaid water metering demo data
// City-wide distribution network — one meter per house, prepaid credit model

const ZONE_TARIFF_PER_KL = 15;        // ₹15 per kL (city distribution rate)
const LOW_BALANCE_THRESHOLD = 50;     // ₹50 — valve shutoff below this
const CYCLE_START = new Date("2025-04-01T00:00:00Z");
const DAYS = 30;

const residentInfo = [
  { name: "Arun Kumar",         email: "arun.kumar@example.com",       address: "12, 1st Main Rd, 1st Block" },
  { name: "Deepa Nair",         email: "deepa.nair@example.com",       address: "34, 5th Cross, 2nd Block" },
  { name: "Vikram Singh",       email: "vikram.singh@example.com",     address: "7, 80 Feet Rd, 3rd Block" },
  { name: "Kavitha Rajan",      email: "kavitha.rajan@example.com",    address: "21, Church St, 4th Block" },
  { name: "Sanjay Bhat",        email: "sanjay.bhat@example.com",      address: "9, 3rd Main, 5th Block" },
  { name: "Meena Iyer",         email: "meena.iyer@example.com",       address: "56, 7th Cross, 1st Block" },
  { name: "Rahul Verma",        email: "rahul.verma@example.com",      address: "18, 2nd Main, 6th Block" },
  { name: "Sunita Pillai",      email: "sunita.pillai@example.com",    address: "3, Koramangala Rd, 7th Block" },
  { name: "Gopal Krishnan",     email: "gopal.krishnan@example.com",   address: "44, 4th Cross, 8th Block" },
  { name: "Anitha Reddy",       email: "anitha.reddy@example.com",     address: "27, 6th Main, 1st Block" },
  { name: "Mohan Das",          email: "mohan.das@example.com",        address: "15, BDA Complex, 2nd Block" },
  { name: "Lakshmi Patel",      email: "lakshmi.patel@example.com",    address: "62, 9th Cross, 3rd Block" },
  { name: "Suresh Gupta",       email: "suresh.gupta@example.com",     address: "5, 1st Cross, 4th Block" },
  { name: "Rekha Menon",        email: "rekha.menon@example.com",      address: "38, 8th Main, 5th Block" },
  { name: "Prakash Nayak",      email: "prakash.nayak@example.com",    address: "11, 3rd Cross, 6th Block" },
  { name: "Usha Rao",           email: "usha.rao@example.com",         address: "29, 5th Main, 7th Block" },
  { name: "Dinesh Joshi",       email: "dinesh.joshi@example.com",     address: "47, 11th Cross, 8th Block" },
  { name: "Padma Subramaniam",  email: "padma.sub@example.com",        address: "8, 2nd Stage, 1st Block" },
  { name: "Balaji Nair",        email: "balaji.nair@example.com",      address: "33, 7th Main, 2nd Block" },
  { name: "Geetha Srinivas",    email: "geetha.srinivas@example.com",  address: "19, 4th Main, 3rd Block" },
];

// Spread of credit balances — healthy, medium, low, and zero to test shutoff logic
const creditBalances = [
  350, 220, 480, 175, 310,   // good balance
  95,  420, 260, 140, 380,   // good balance
  200, 445,                  // good balance
  38,  22,  0,   15,         // low / zero  → shutoff
  290, 75,  165, 330,        // good / borderline
];

function generateHouseConsumption(baseLitres) {
  return Array.from({ length: DAYS }).map((_, i) => {
    const date = new Date(CYCLE_START);
    date.setDate(date.getDate() + i);
    const modifier = 1 + 0.15 * Math.sin(i / 3);
    return {
      date: date.toISOString().slice(0, 10),
      litres: Math.round(baseLitres * modifier),
    };
  });
}

const houses = residentInfo.map((res, index) => {
  const houseNum = String(index + 1).padStart(3, "0");
  const baseLitres = 150 + (index % 8) * 20;   // 150–290 L/day per household
  const credit = creditBalances[index];
  return {
    house_id: `KRM-${houseNum}`,
    meter_id: `MTR-KRM-${houseNum}`,
    resident_name: res.name,
    resident_email: res.email,
    address: res.address,
    valve_status: credit >= LOW_BALANCE_THRESHOLD ? "open" : "shutoff",
    credit_balance_inr: credit,
    daily_consumption: generateHouseConsumption(baseLitres),
  };
});

export const prepaidZone = {
  zone_id: "KRM-ZONE-1",
  name: "Koramangala Urban Water Zone",
  address: "Koramangala, Bengaluru – 560034",
  tariff_per_kl: ZONE_TARIFF_PER_KL,
  low_balance_threshold_inr: LOW_BALANCE_THRESHOLD,
  houses,
};
