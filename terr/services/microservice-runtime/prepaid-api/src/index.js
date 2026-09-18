import prepaidRoutes from "../../src/routes/prepaidRoutes.js";
import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

const app = createApiApp({
  serviceName: "prepaid-api",
  mounts: [{ path: "/api/prepaid", router: prepaidRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8093),
  serviceName: "prepaid-api",
});

export const handler = createHandler(app);
export default app;
