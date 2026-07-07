import dotenv from "dotenv";

dotenv.config();

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

export const appConfig = {
  port: process.env.API_PORT || 8080,
  jwtSecret: process.env.JWT_SECRET || "terraclime-demo-secret",
  demoMode: bool(process.env.USE_DEMO_DATA, true),
  awsRegion: process.env.AWS_REGION || "ap-south-1",
  tables: {
    users: process.env.USERS_TABLE || "UserCredentials",
    flow: process.env.FLOW_TABLE || "flow_data",
    apartments: process.env.APARTMENT_TABLE || "apartment_data",
    billing: process.env.BILLING_TABLE || "billing_cycles",
    leaks: process.env.LEAKS_TABLE || "leak_events",
  },
};
