import dotenv from "dotenv";

dotenv.config();

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

export const appConfig = {
  demoMode: bool(process.env.USE_DEMO_DATA, false),
  awsRegion: process.env.AWS_REGION || "ap-south-1",
  tables: {
    flow: process.env.FLOW_TABLE || "flow_data",
  },
};
