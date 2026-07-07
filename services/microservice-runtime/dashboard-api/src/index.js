import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

if (!process.env.LAMBDA_TASK_ROOT) {
  process.env.USE_DEMO_DATA = process.env.DASHBOARD_API_USE_DEMO_DATA ?? "false";
}

const { default: dashboardRoutes } = await import("../../src/routes/dashboardRoutes.js");

const app = createApiApp({
  serviceName: "dashboard-api",
  mounts: [{ path: "/api/dashboard", router: dashboardRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8087),
  serviceName: "dashboard-api",
});

export const handler = createHandler(app);
export default app;
