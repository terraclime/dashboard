import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { appConfig } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import leakRoutes from "./routes/leakRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import billingNotificationRoutes from "./routes/billingNotificationRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import prepaidRoutes from "./routes/prepaidRoutes.js";
import liveDataRoutes from "./routes/liveDataRoutes.js";

const app = express();

const corsOptions = {
  origin: [
    "http://dashboard.terraclime.com",
    "https://dashboard.terraclime.com",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Handle preflight requests for ALL routes
app.options("*", cors(corsOptions));

// Apply CORS to all routes
app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    demoMode: appConfig.demoMode,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/leaks", leakRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/bills", billingNotificationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/prepaid", prepaidRoutes);
app.use("/", liveDataRoutes);
app.use("/api", liveDataRoutes);

const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);
const isTest = process.env.NODE_ENV === "test";

if (!isLambda && !isTest) {
  app.listen('8081', () => {
    console.log(
      `Terraclime demo API running on port ${appConfig.port} (demo mode: ${appConfig.demoMode})`
    );
  });
}

export const handler = serverless(app);
export default app;
