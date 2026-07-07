import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "../config/env.js";
import { getDocumentClient } from "../datasources/dynamoClient.js";

const liveDataStore = new Map();

export class LiveDataValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LiveDataValidationError";
    this.statusCode = 400;
  }
}

export class LiveDataPersistenceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "LiveDataPersistenceError";
    this.statusCode = 500;
    this.cause = cause;
    this.details = {
      errorName: cause?.name || "Error",
      errorCode: cause?.code || cause?.Code || null,
      awsMessage: cause?.message || message,
    };
  }
}

const validateLiveDataPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new LiveDataValidationError("Request body must be an object");
  }

  const {
    device_id,
    values,
    timestamp,
    apartment_id,
    block_id,
    flat_id,
  } = payload;

  if (typeof device_id !== "string" || device_id.trim() === "") {
    throw new LiveDataValidationError("device_id is required");
  }

  if (!Array.isArray(values)) {
    throw new LiveDataValidationError("values must be an array of 24 numbers");
  }

  if (values.length !== 24) {
    throw new LiveDataValidationError("values must contain exactly 24 entries");
  }

  const normalizedValues = values.map((value, index) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      throw new LiveDataValidationError(
        `values[${index}] must be a valid number`
      );
    }

    return numericValue;
  });

  const normalizedTimestamp =
    typeof timestamp === "string" && timestamp.trim() !== ""
      ? timestamp.trim()
      : new Date().toISOString();

  const record = {
    device_id: device_id.trim(),
    timestamp: normalizedTimestamp,
  };

  normalizedValues.forEach((value, index) => {
    record[`value_${index + 1}`] = value;
  });

  if (typeof apartment_id === "string" && apartment_id.trim() !== "") {
    record.apartment_id = apartment_id.trim();
  }

  if (typeof block_id === "string" && block_id.trim() !== "") {
    record.block_id = block_id.trim();
  }

  if (typeof flat_id === "string" && flat_id.trim() !== "") {
    record.flat_id = flat_id.trim();
  }

  return record;
};

export const ingestLiveData = async (payload) => {
  const normalizedPayload = validateLiveDataPayload(payload);
  const record = normalizedPayload;

  if (!appConfig.demoMode) {
    const client = getDocumentClient();
    try {
      await client.send(
        new PutCommand({
          TableName: appConfig.tables.flow,
          Item: record,
        })
      );
    } catch (error) {
      throw new LiveDataPersistenceError(
        `DynamoDB PutItem failed for table ${appConfig.tables.flow}: ${error.message}`,
        error
      );
    }
  }

  liveDataStore.set(record.device_id, record);

  return record;
};

export const getLiveDataByDeviceId = (deviceId) => {
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    return null;
  }

  return liveDataStore.get(deviceId.trim()) || null;
};

export const resetLiveDataStore = () => {
  liveDataStore.clear();
};
