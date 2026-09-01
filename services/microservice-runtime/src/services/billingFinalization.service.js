import { createHash } from "node:crypto";

import { getDocumentClient } from "../datasources/dynamoClient.js";
import { appConfig } from "../config/env.js";

const demoFinalizations = new Map();
let dynamoModulePromise;

const getDynamoModule = () => {
  dynamoModulePromise ||= import("@aws-sdk/lib-dynamodb");
  return dynamoModulePromise;
};

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const apartmentCycleKey = (apartmentId, cycleId) => `${apartmentId}#${cycleId}`;

export const buildFinalizationId = ({ apartmentId, flatId, cycleId, residentEmail }) => {
  const identity = [apartmentId, flatId, cycleId, normalize(residentEmail)].join("|");
  return `fin_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
};

export async function listFinalizations(apartmentId, cycleId) {
  if (!apartmentId || !cycleId) return [];
  const key = apartmentCycleKey(apartmentId, cycleId);

  if (appConfig.demoMode) {
    return Array.from(demoFinalizations.values()).filter(
      (item) => item.apartment_cycle === key
    );
  }

  const client = await getDocumentClient();
  const { QueryCommand } = await getDynamoModule();
  try {
    const result = await client.send(
      new QueryCommand({
        TableName: appConfig.tables.finalizations,
        IndexName: "apartment-cycle-index",
        KeyConditionExpression: "apartment_cycle = :apartmentCycle",
        ExpressionAttributeValues: { ":apartmentCycle": key },
      })
    );
    return result.Items || [];
  } catch (error) {
    if (error?.name === "ResourceNotFoundException") return [];
    throw error;
  }
}

export async function getFinalization(finalizationId) {
  if (appConfig.demoMode) return demoFinalizations.get(finalizationId) || null;

  const client = await getDocumentClient();
  const { GetCommand } = await getDynamoModule();
  const result = await client.send(
    new GetCommand({
      TableName: appConfig.tables.finalizations,
      Key: { finalization_id: finalizationId },
    })
  );
  return result.Item || null;
}

export async function createFinalization(snapshot) {
  const finalizationId = buildFinalizationId(snapshot);
  const now = new Date().toISOString();
  const item = {
    ...snapshot,
    finalization_id: finalizationId,
    apartment_cycle: apartmentCycleKey(snapshot.apartmentId, snapshot.cycleKey || snapshot.cycleId),
    billing_status: "finalized",
    email_status: "pending",
    created_at: now,
    updated_at: now,
  };

  if (appConfig.demoMode) {
    const existing = demoFinalizations.get(finalizationId);
    if (existing) return { item: existing, created: false };
    demoFinalizations.set(finalizationId, item);
    return { item, created: true };
  }

  const client = await getDocumentClient();
  const { PutCommand } = await getDynamoModule();
  try {
    await client.send(
      new PutCommand({
        TableName: appConfig.tables.finalizations,
        Item: item,
        ConditionExpression: "attribute_not_exists(finalization_id)",
      })
    );
    return { item, created: true };
  } catch (error) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    return { item: await getFinalization(finalizationId), created: false };
  }
}

export async function updateFinalizationEmail(finalizationId, emailStatus, details = {}) {
  const updatedAt = new Date().toISOString();
  const values = {
    ":emailStatus": emailStatus,
    ":updatedAt": updatedAt,
    ":messageId": details.messageId || null,
    ":emailError": details.emailError || null,
  };

  if (appConfig.demoMode) {
    const existing = demoFinalizations.get(finalizationId);
    if (!existing) return null;
    const updated = {
      ...existing,
      email_status: emailStatus,
      message_id: values[":messageId"],
      email_error: values[":emailError"],
      updated_at: updatedAt,
    };
    demoFinalizations.set(finalizationId, updated);
    return updated;
  }

  const client = await getDocumentClient();
  const { UpdateCommand } = await getDynamoModule();
  const result = await client.send(
    new UpdateCommand({
      TableName: appConfig.tables.finalizations,
      Key: { finalization_id: finalizationId },
      UpdateExpression:
        "SET email_status = :emailStatus, updated_at = :updatedAt, message_id = :messageId, email_error = :emailError",
      ExpressionAttributeValues: values,
      ConditionExpression: "attribute_exists(finalization_id)",
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes || null;
}

export function resetDemoFinalizations() {
  demoFinalizations.clear();
}
