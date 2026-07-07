import {
  createApiApp,
  createHandler,
  startLocalServer,
} from "../../src/common/serviceApp.js";

if (!process.env.LAMBDA_TASK_ROOT) {
  process.env.USE_DEMO_DATA = process.env.PROFILE_API_USE_DEMO_DATA ?? "false";
}

const { default: profileRoutes } = await import("../../src/routes/profileRoutes.js");

const app = createApiApp({
  serviceName: "profile-api",
  mounts: [{ path: "/api/profile", router: profileRoutes }],
});

startLocalServer(app, {
  port: Number(process.env.PORT || 8092),
  serviceName: "profile-api",
});

export const handler = createHandler(app);
export default app;
