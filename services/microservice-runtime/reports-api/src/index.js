import reportRoutes from "../../src/routes/reportRoutes.js";
import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

const app = createApiApp({
  serviceName: "reports-api",
  mounts: [{ path: "/api/reports", router: reportRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8088),
  serviceName: "reports-api",
});

export const handler = createHandler(app);
export default app;
