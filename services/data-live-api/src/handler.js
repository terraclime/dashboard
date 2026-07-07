import {
  ingestLiveData,
  LiveDataPersistenceError,
  LiveDataValidationError,
} from "./services/liveDataService.js";

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});

const parseRequestBody = (event) => {
  if (!event?.body) {
    throw new LiveDataValidationError("Request body must be an object");
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  if (typeof rawBody !== "string" || rawBody.trim() === "") {
    throw new LiveDataValidationError("Request body must be an object");
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new LiveDataValidationError("Request body must be valid JSON");
  }
};

export const handler = async (event) => {
  try {
    const result = await ingestLiveData(parseRequestBody(event));
    const isBatchResponse = Array.isArray(result);

    return response(202, {
      success: true,
      message: isBatchResponse
        ? "Live data batch accepted"
        : "Live data accepted",
      count: isBatchResponse ? result.length : 1,
      data: result,
    });
  } catch (error) {
    if (error instanceof LiveDataValidationError) {
      return response(error.statusCode, {
        success: false,
        message: error.message,
      });
    }

    if (error instanceof LiveDataPersistenceError) {
      console.error("Live data DynamoDB write failed", {
        message: error.message,
        details: error.details,
        cause: error.cause,
      });

      return response(error.statusCode, {
        success: false,
        message: error.message,
        error: error.details,
      });
    }

    console.error("Unexpected live data ingestion failure", error);

    return response(500, {
      success: false,
      message: error.message || "Failed to ingest live data",
    });
  }
};
