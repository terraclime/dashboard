import { createHash, randomUUID } from "node:crypto";

import { appConfig } from "../config/env.js";
import { getDocumentClient } from "../datasources/dynamoClient.js";
import {
  buildFinalizationItem,
  createFinalization,
  getFinalization,
} from "./billingFinalization.service.js";

const demoOccupancies = new Map();
let dynamoModulePromise;

const getDynamoModule = () => {
  dynamoModulePromise ||= import("@aws-sdk/lib-dynamodb");
  return dynamoModulePromise;
};

const text = (value) => String(value ?? "").trim();
const normalizeEmail = (value) => text(value).toLowerCase();

export const deriveLegacyOccupancyId = ({ apartmentId, flatId, email }) => {
  const identity = [apartmentId, flatId, normalizeEmail(email), "legacy"].join("|");
  return `occ_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
};

export const normalizeOccupancy = (source = {}, apartmentId = "") => {
  const residentName = text(source.res_name || source.resident_name || source.residentName);
  const residentEmail = text(source.res_email || source.resident_email || source.residentEmail);
  const explicitStatus = text(source.resident_status || source.residentStatus).toLowerCase();
  const status = explicitStatus || (residentName || residentEmail ? "occupied" : "vacant");
  const flatId = text(source.flat_id || source.flatId || source.flat_number || source.flatNumber);
  const resolvedApartmentId = text(source.apartment_id || source.apartmentId || apartmentId);

  return {
    apartmentId: resolvedApartmentId,
    flatId,
    status,
    occupancyId:
      text(source.occupancy_id || source.occupancyId) ||
      (status === "occupied" && residentEmail
        ? deriveLegacyOccupancyId({ apartmentId: resolvedApartmentId, flatId, email: residentEmail })
        : ""),
    occupancyStartDate: text(source.occupancy_start_date || source.occupancyStartDate),
    vacatedAt: text(source.vacated_at || source.vacatedAt),
    residentName: status === "vacant" ? "" : residentName,
    residentEmail: status === "vacant" ? "" : residentEmail,
    residentContact: status === "vacant"
      ? ""
      : text(source.res_contact || source.resident_contact || source.residentContact),
    explicit: Boolean(explicitStatus),
  };
};

export const getDemoOccupancy = (flatId) => demoOccupancies.get(text(flatId).toLowerCase()) || null;

const toPublicOccupancy = (item = {}) => {
  const occupancy = normalizeOccupancy(item);
  return {
    apartment_id: occupancy.apartmentId,
    flat_id: occupancy.flatId,
    resident_status: occupancy.status,
    occupancy_id: occupancy.occupancyId,
    occupancy_start_date: occupancy.occupancyStartDate || null,
    vacated_at: occupancy.vacatedAt || null,
    resident_name: occupancy.residentName,
    resident_email: occupancy.residentEmail,
    resident_contact: occupancy.residentContact,
  };
};

export async function finalizeOccupancy(snapshot) {
  const item = buildFinalizationItem(snapshot);

  if (appConfig.demoMode) {
    const result = await createFinalization(snapshot);
    if (result.created) {
      demoOccupancies.set(text(snapshot.flatId).toLowerCase(), {
        apartment_id: snapshot.apartmentId,
        flat_id: snapshot.flatId,
        resident_status: "vacant",
        vacated_at: snapshot.periodEnd,
        previous_occupancy_id: snapshot.occupancyId,
      });
    }
    return result;
  }

  const client = await getDocumentClient();
  const { TransactWriteCommand } = await getDynamoModule();
  const expectedEmail = text(snapshot.residentEmail);
  const expectedOccupancyId = text(snapshot.persistedOccupancyId);
  const condition = expectedOccupancyId
    ? "apartment_id = :apartmentId AND occupancy_id = :occupancyId AND resident_status <> :vacant"
    : "apartment_id = :apartmentId AND attribute_not_exists(occupancy_id) AND (attribute_not_exists(resident_status) OR resident_status <> :vacant) AND (res_email = :email OR resident_email = :email)";
  const conditionValues = expectedOccupancyId
    ? { ":occupancyId": expectedOccupancyId }
    : { ":email": expectedEmail };

  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: appConfig.tables.finalizations,
              Item: item,
              ConditionExpression: "attribute_not_exists(finalization_id)",
            },
          },
          {
            Update: {
              TableName: appConfig.tables.apartments,
              Key: { flat_id: snapshot.flatId },
              ConditionExpression: condition,
              UpdateExpression:
                "SET resident_status = :vacant, vacated_at = :vacatedAt, previous_occupancy_id = :previousOccupancyId, updated_at = :updatedAt REMOVE occupancy_id, occupancy_start_date, res_name, res_email, res_contact, resident_name, resident_email, resident_contact",
              ExpressionAttributeValues: {
                ":apartmentId": snapshot.apartmentId,
                ...conditionValues,
                ":vacant": "vacant",
                ":vacatedAt": snapshot.periodEnd,
                ":previousOccupancyId": snapshot.occupancyId,
                ":updatedAt": new Date().toISOString(),
              },
            },
          },
        ],
      })
    );
    return { item, created: true };
  } catch (error) {
    if (error?.name !== "TransactionCanceledException") throw error;
    const existing = await getFinalization(item.finalization_id);
    if (existing) return { item: existing, created: false };
    throw Object.assign(
      new Error("The flat occupant changed before finalization. Refresh and try again."),
      { statusCode: 409 }
    );
  }
}

export async function assignOccupancy({ apartmentId, flatId, residentName, residentEmail, residentContact, startDate, expectedVacatedAt }) {
  const occupancyId = `occ_${randomUUID()}`;
  const values = {
    ":apartmentId": apartmentId,
    ":vacant": "vacant",
    ":occupied": "occupied",
    ":occupancyId": occupancyId,
    ":startDate": startDate,
    ":residentName": residentName,
    ":residentEmail": normalizeEmail(residentEmail),
    ":residentContact": text(residentContact),
    ":expectedVacatedAt": expectedVacatedAt,
    ":updatedAt": new Date().toISOString(),
  };

  if (appConfig.demoMode) {
    const current = getDemoOccupancy(flatId);
    if (!current || current.resident_status !== "vacant") {
      throw Object.assign(new Error("Flat must be vacant before assigning a tenant."), { statusCode: 409 });
    }
    const updated = {
      apartment_id: apartmentId,
      flat_id: flatId,
      resident_status: "occupied",
      occupancy_id: occupancyId,
      occupancy_start_date: startDate,
      res_name: residentName,
      res_email: normalizeEmail(residentEmail),
      res_contact: text(residentContact),
    };
    demoOccupancies.set(text(flatId).toLowerCase(), updated);
    return toPublicOccupancy(updated);
  }

  const client = await getDocumentClient();
  const { UpdateCommand } = await getDynamoModule();
  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: appConfig.tables.apartments,
        Key: { flat_id: flatId },
        ConditionExpression:
          "apartment_id = :apartmentId AND resident_status = :vacant AND vacated_at = :expectedVacatedAt",
        UpdateExpression:
          "SET resident_status = :occupied, occupancy_id = :occupancyId, occupancy_start_date = :startDate, res_name = :residentName, res_email = :residentEmail, res_contact = :residentContact, updated_at = :updatedAt REMOVE vacated_at",
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );
    return toPublicOccupancy(result.Attributes);
  } catch (error) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    throw Object.assign(new Error("Flat is no longer vacant. Refresh and try again."), { statusCode: 409 });
  }
}

export async function updateCurrentOccupancy({
  apartmentId,
  flatId,
  occupancyId,
  persistedOccupancyId,
  expectedEmail,
  residentName,
  residentEmail,
  residentContact,
}) {
  if (appConfig.demoMode) {
    const current = getDemoOccupancy(flatId) || {
      apartment_id: apartmentId,
      flat_id: flatId,
      resident_status: "occupied",
      occupancy_id: occupancyId,
    };
    if (current?.resident_status !== "occupied" || current?.occupancy_id !== occupancyId) {
      throw Object.assign(new Error("The current tenant changed. Refresh and try again."), { statusCode: 409 });
    }
    const updated = {
      ...current,
      res_name: residentName,
      res_email: normalizeEmail(residentEmail),
      res_contact: text(residentContact),
    };
    demoOccupancies.set(text(flatId).toLowerCase(), updated);
    return toPublicOccupancy(updated);
  }

  const client = await getDocumentClient();
  const { UpdateCommand } = await getDynamoModule();
  const hasPersistedId = Boolean(text(persistedOccupancyId));
  const condition = hasPersistedId
    ? "apartment_id = :apartmentId AND resident_status = :occupied AND occupancy_id = :occupancyId"
    : "apartment_id = :apartmentId AND attribute_not_exists(occupancy_id) AND (res_email = :expectedEmail OR resident_email = :expectedEmail)";
  const legacyConditionValues = hasPersistedId
    ? {}
    : { ":expectedEmail": text(expectedEmail) };
  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: appConfig.tables.apartments,
        Key: { flat_id: flatId },
        ConditionExpression: condition,
        UpdateExpression:
          "SET resident_status = :occupied, occupancy_id = :occupancyId, res_name = :residentName, res_email = :residentEmail, res_contact = :residentContact, updated_at = :updatedAt",
        ExpressionAttributeValues: {
          ":apartmentId": apartmentId,
          ":occupied": "occupied",
          ":occupancyId": occupancyId,
          ...legacyConditionValues,
          ":residentName": residentName,
          ":residentEmail": normalizeEmail(residentEmail),
          ":residentContact": text(residentContact),
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return toPublicOccupancy(result.Attributes);
  } catch (error) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    throw Object.assign(new Error("The current tenant changed. Refresh and try again."), { statusCode: 409 });
  }
}

export function resetDemoOccupancies() {
  demoOccupancies.clear();
}
