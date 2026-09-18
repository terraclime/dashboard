import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

if (!process.env.LAMBDA_TASK_ROOT) {
  process.env.USE_DEMO_DATA = process.env.BILLING_API_USE_DEMO_DATA ?? "false";
}

const { default: billingRoutes } = await import("../../src/routes/billingRoutes.js");

const app = createApiApp({
  serviceName: "billing-api",
  mounts: [{ path: "/api/billing", router: billingRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8090),
  serviceName: "billing-api",
});

export const handler = createHandler(app);
export default app;
