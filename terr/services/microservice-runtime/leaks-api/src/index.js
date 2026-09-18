import leakRoutes from "../../src/routes/leakRoutes.js";
import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

const app = createApiApp({
  serviceName: "leaks-api",
  mounts: [{ path: "/api/leaks", router: leakRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8089),
  serviceName: "leaks-api",
});

export const handler = createHandler(app);
export default app;
