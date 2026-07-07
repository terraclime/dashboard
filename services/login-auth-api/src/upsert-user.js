import bcrypt from "bcryptjs";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "./config/env.js";
import { getDocumentClient } from "./datasources/dynamoClient.js";

const allowedStatuses = new Set(["active", "inactive"]);

const parseArgs = (argv) =>
  argv.reduce((acc, arg) => {
    if (!arg.startsWith("--")) {
      return acc;
    }

    const [rawKey, ...rawValue] = arg.slice(2).split("=");
    acc[rawKey] = rawValue.join("=");
    return acc;
  }, {});

const requireValue = (args, key, envKey) => {
  const value = args[key] || process.env[envKey];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing --${key}=... or ${envKey}`);
  }

  return value.trim();
};

const args = parseArgs(process.argv.slice(2));

try {
  const userMail = requireValue(args, "user-mail", "USER_MAIL").toLowerCase();
  const password = args.password || process.env.USER_PASSWORD;
  const userName = requireValue(args, "user-name", "USER_NAME");
  const apartmentName = requireValue(args, "apartment-name", "APARTMENT_NAME");
  const apartmentId = requireValue(args, "apartment-id", "APARTMENT_ID");
  const role = args.role || process.env.USER_ROLE || "102";
  const accountType = args["account-type"] || process.env.ACCOUNT_TYPE || "standard";
  const status = (
    args.status ||
    process.env.USER_STATUS ||
    "Active"
  ).toLowerCase();

  if (typeof password !== "string" || password.trim() === "") {
    throw new Error("Missing --password=... or USER_PASSWORD");
  }

  if (!allowedStatuses.has(status)) {
    throw new Error("status must be Active or Inactive");
  }

  const hashPassword = await bcrypt.hash(password, Number(args.rounds || 10));
  const item = {
    user_mail: userMail,
    user_name: userName,
    apartment_name: apartmentName,
    apartment_id: apartmentId,
    hash_password: hashPassword,
    user_status: status === "active" ? "Active" : "Inactive",
    role,
    account_type: accountType,
  };

  await getDocumentClient().send(
    new PutCommand({
      TableName: appConfig.tables.users,
      Item: item,
    })
  );

  console.log(
    JSON.stringify(
      {
        table: appConfig.tables.users,
        user_mail: item.user_mail,
        user_name: item.user_name,
        apartment_id: item.apartment_id,
        apartment_name: item.apartment_name,
        user_status: item.user_status,
        role: item.role,
        account_type: item.account_type,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
