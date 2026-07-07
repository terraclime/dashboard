import http from "node:http";
import { fileURLToPath } from "node:url";
import { handler } from "./handler.js";

const DEFAULT_PORT = Number(process.env.PORT || 8086);

const buildEvent = (req, body) => ({
  httpMethod: req.method,
  path: req.url,
  headers: req.headers,
  body,
  isBase64Encoded: false,
  requestContext: {
    http: {
      method: req.method,
      path: req.url,
    },
  },
});

export const createLocalServer = () =>
  http.createServer(async (req, res) => {
    if (!req.url?.startsWith("/api/auth/login")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          message: "Route not found",
        })
      );
      return;
    }

    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        const lambdaResponse = await handler(buildEvent(req, body));

        res.writeHead(lambdaResponse.statusCode || 200, {
          "Content-Type": "application/json",
          ...(lambdaResponse.headers || {}),
        });
        res.end(lambdaResponse.body || "");
      } catch (error) {
        console.error("Local login-auth server failed", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            message: "Local server failed",
          })
        );
      }
    });

    req.on("error", (error) => {
      console.error("Request stream failed", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          message: "Request stream failed",
        })
      );
    });
  });

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const server = createLocalServer();

  server.listen(DEFAULT_PORT, () => {
    console.log(
      `login-auth-api local server listening on http://127.0.0.1:${DEFAULT_PORT}`
    );
  });
}
