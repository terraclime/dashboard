import { getDocumentClient } from "../datasources/dynamoClient.js";

let dynamoModulePromise = null;

const getDynamoModule = async () => {
  if (!dynamoModulePromise) {
    dynamoModulePromise = import("@aws-sdk/lib-dynamodb");
  }

  return dynamoModulePromise;
};

export const getItemByKey = async (tableName, key) => {
  const client = await getDocumentClient();
  const { GetCommand } = await getDynamoModule();
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
    })
  );

  return result.Item || null;
};

export const scanAllItems = async (tableName, input = {}) => {
  const client = await getDocumentClient();
  const { ScanCommand } = await getDynamoModule();
  const items = [];
  let lastEvaluatedKey;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ...input,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

export const scanItemsByAttribute = async (tableName, attributeName, value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  return scanAllItems(tableName, {
    FilterExpression: "#attr = :value",
    ExpressionAttributeNames: {
      "#attr": attributeName,
    },
    ExpressionAttributeValues: {
      ":value": value,
    },
  });
};

export const updateItem = async (tableName, key, update) => {
  const client = await getDocumentClient();
  const { UpdateCommand } = await getDynamoModule();
  const result = await client.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      ReturnValues: "ALL_NEW",
      ...update,
    })
  );

  return result.Attributes || null;
};

export const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const sumHourlyValues = (record) =>
  Object.entries(record || {}).reduce((sum, [key, value]) => {
    if (!/^value_\d+$/.test(key)) {
      return sum;
    }

    return sum + toFiniteNumber(value, 0);
  }, 0);

export const normalizeIsoDate = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

export const sortByIsoDate = (left, right) =>
  new Date(left).getTime() - new Date(right).getTime();

export const buildDateRange = (startDate, endDate) => {
  const normalizedStart = normalizeIsoDate(startDate);
  const normalizedEnd = normalizeIsoDate(endDate);

  if (!normalizedStart || !normalizedEnd) {
    return [];
  }

  const values = [];
  const cursor = new Date(`${normalizedStart}T00:00:00Z`);
  const end = new Date(`${normalizedEnd}T00:00:00Z`);

  while (cursor <= end) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return values;
};
