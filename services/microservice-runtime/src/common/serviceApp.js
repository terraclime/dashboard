import cors from "cors";
import express from "express";
import serverless from "serverless-http";

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

export const createApiApp = ({ serviceName, mounts }) => {
  const app = express();

  app.options("*", cors(corsOptions));
  app.use(cors(corsOptions));
  app.use(express.json());

  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: serviceName,
      demoMode:
        process.env.USE_DEMO_DATA === undefined
          ? true
          : ["1", "true", "yes", "on"].includes(
              String(process.env.USE_DEMO_DATA).toLowerCase()
            ),
      timestamp: new Date().toISOString(),
    });
  });

  mounts.forEach(({ path, router }) => {
    app.use(path, router);
  });

  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });

  return app;
};

export const createHandler = (app) => serverless(app);

export const startLocalServer = (app, { port, serviceName }) => {
  const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);
  const isTest = process.env.NODE_ENV === "test";

  if (!isLambda && !isTest) {
    app.listen(port, () => {
      console.log(
        `${serviceName} local server listening on http://127.0.0.1:${port}`
      );
    });
  }
};
