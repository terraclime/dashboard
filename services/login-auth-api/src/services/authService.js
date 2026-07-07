import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "../config/env.js";
import { getDocumentClient } from "../datasources/dynamoClient.js";

export class AuthValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthValidationError";
    this.statusCode = 400;
  }
}

export class AuthUnauthorizedError extends Error {
  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "AuthUnauthorizedError";
    this.statusCode = 401;
  }
}

export class AuthPersistenceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AuthPersistenceError";
    this.statusCode = 500;
    this.cause = cause;
    this.details = {
      errorName: cause?.name || "Error",
      errorCode: cause?.code || cause?.Code || null,
      awsMessage: cause?.message || message,
    };
  }
}

const readUserRecord = async (userMail, client) => {
  try {
    const result = await client.send(
      new GetCommand({
        TableName: appConfig.tables.users,
        Key: {
          user_mail: userMail,
        },
      })
    );

    return result.Item || null;
  } catch (error) {
    throw new AuthPersistenceError(
      `Failed to read user from table ${appConfig.tables.users}: ${error.message}`,
      error
    );
  }
};

export const validateLoginPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AuthValidationError("Request body must be an object");
  }

  const rawUserMail = payload.user_mail ?? payload.userMail ?? payload.email;
  const rawPassword = payload.user_password ?? payload.password;

  if (typeof rawUserMail !== "string" || rawUserMail.trim() === "") {
    throw new AuthValidationError("user_mail is required");
  }

  if (typeof rawPassword !== "string" || rawPassword.trim() === "") {
    throw new AuthValidationError("user_password is required");
  }

  return {
    userMail: rawUserMail.trim(),
    password: rawPassword,
  };
};

const buildTokenPayload = (userRecord) => ({
  user_mail: userRecord.user_mail,
  role: userRecord.role || "user",
  apartment_id: userRecord.apartment_id || null,
});

const buildLoginResponse = (userRecord, accessToken) => ({
  accessToken,
  role: userRecord.role || "user",
  account_type: userRecord.account_type || "standard",
  apartment: {
    id: userRecord.apartment_id || "",
    name:
      userRecord.apartmentName ||
      userRecord.apartment_name ||
      userRecord.apartment ||
      "",
  },
  user: {
    mail: userRecord.user_mail,
    first_name: userRecord.first_name || "",
    last_name: userRecord.last_name || "",
  },
});

const isInactiveUser = (userRecord) => {
  const status = userRecord.user_status || userRecord.status;
  return typeof status === "string" && status.toLowerCase() === "inactive";
};

export const login = async (credentials, dependencies = {}) => {
  const client = dependencies.client || getDocumentClient();
  const signToken = dependencies.signToken || jwt.sign;
  const userRecord = await readUserRecord(credentials.userMail, client);

  if (!userRecord) {
    throw new AuthUnauthorizedError();
  }

  if (isInactiveUser(userRecord)) {
    throw new AuthUnauthorizedError();
  }

  if (
    typeof userRecord.hash_password !== "string" ||
    userRecord.hash_password.trim() === ""
  ) {
    throw new AuthUnauthorizedError();
  }

  let passwordMatches = false;

  try {
    passwordMatches = await bcrypt.compare(
      credentials.password,
      userRecord.hash_password
    );
  } catch (error) {
    throw new AuthPersistenceError(
      `Password hash verification failed for ${credentials.userMail}: ${error.message}`,
      error
    );
  }

  if (!passwordMatches) {
    throw new AuthUnauthorizedError();
  }

  const accessToken = signToken(buildTokenPayload(userRecord), appConfig.jwtSecret, {
    expiresIn: appConfig.jwtTtl,
    issuer: appConfig.jwtIssuer,
  });

  return buildLoginResponse(userRecord, accessToken);
};
