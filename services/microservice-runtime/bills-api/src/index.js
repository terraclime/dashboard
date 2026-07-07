import billingNotificationRoutes from "../../src/routes/billingNotificationRoutes.js";
import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

const app = createApiApp({
  serviceName: "bills-api",
  mounts: [{ path: "/api/bills", router: billingNotificationRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8091),
  serviceName: "bills-api",
});

export const handler = createHandler(app);
export default app;
