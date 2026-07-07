import {
  login,
  validateLoginPayload,
  AuthPersistenceError,
  AuthUnauthorizedError,
  AuthValidationError,
} from "./services/authService.js";

const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const response = (statusCode, body) => ({
  statusCode,
  headers: defaultHeaders,
  body: body === null ? "" : JSON.stringify(body),
});

const parseRequestBody = (event) => {
  if (!event?.body) {
    throw new AuthValidationError("Request body must be valid JSON");
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  if (typeof rawBody !== "string" || rawBody.trim() === "") {
    throw new AuthValidationError("Request body must be valid JSON");
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new AuthValidationError("Request body must be valid JSON");
  }
};

export const handler = async (event) => {
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || "POST";

  if (method === "OPTIONS") {
    return response(204, null);
  }

  if (method !== "POST") {
    return response(405, {
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const credentials = validateLoginPayload(parseRequestBody(event));
    const result = await login(credentials);

    return response(200, result);
  } catch (error) {
    if (error instanceof AuthValidationError) {
      return response(error.statusCode, {
        success: false,
        message: error.message,
      });
    }

    if (error instanceof AuthUnauthorizedError) {
      return response(error.statusCode, {
        success: false,
        message: error.message,
      });
    }

    if (error instanceof AuthPersistenceError) {
      console.error("Authentication request failed", {
        message: error.message,
        details: error.details,
        cause: error.cause,
      });

      return response(error.statusCode, {
        success: false,
        message: "Authentication service failed",
        error: error.details,
      });
    }

    console.error("Unexpected login-auth failure", error);

    return response(500, {
      success: false,
      message: error.message || "Authentication service failed",
    });
  }
};
