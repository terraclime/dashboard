import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { appConfig } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import leakRoutes from "./routes/leakRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";

const app = express();

app.use(cors());
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
app.use("/api/profile", profileRoutes);

const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);
const isTest = process.env.NODE_ENV === "test";

if (!isLambda && !isTest) {
  app.listen(appConfig.port, () => {
    console.log(
      `Terraclime demo API running on port ${appConfig.port} (demo mode: ${appConfig.demoMode})`
    );
  });
}

export const handler = serverless(app);
export default app;
