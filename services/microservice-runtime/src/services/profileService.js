import { getLiveUserProfile } from "./analyticsStore.service.js";
import { appConfig } from "../config/env.js";
import { getItemByKey, scanItemsByAttribute } from "./dynamoUtils.service.js";

const SENSITIVE_USER_FIELDS = new Set([
  "hash_password",
  "password",
  "user_password",
  "accessToken",
  "token",
]);

const ROLE_LABELS = {
  102: "Admin",
};

const normalizeRole = (role) => ROLE_LABELS[String(role)] || role || "";

const splitName = (userRecord = {}) => {
  const firstName = userRecord.first_name || "";
  const lastName = userRecord.last_name || "";
  const fullName = userRecord.user_name || [firstName, lastName].filter(Boolean).join(" ");

  if (firstName || lastName || !fullName) {
    return {
      firstName,
      lastName,
      fullName: fullName.trim(),
    };
  }

  const [first, ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName: first || "",
    lastName: rest.join(" "),
    fullName: fullName.trim(),
  };
};

const sanitizeUserCredentials = (userRecord = {}) =>
  Object.entries(userRecord).reduce((safeRecord, [key, value]) => {
    if (!SENSITIVE_USER_FIELDS.has(key)) {
      safeRecord[key] = value;
    }

    return safeRecord;
  }, {});

const buildSettingsProfile = (userRecord) => {
  const { firstName, lastName, fullName } = splitName(userRecord);

  return {
    user: {
      mail: userRecord.user_mail,
      user_name: userRecord.user_name || fullName,
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      role: normalizeRole(userRecord.role),
      role_code: userRecord.role || "",
      account_type: userRecord.account_type || "standard",
      status: userRecord.user_status || userRecord.status || "",
      flat_id: userRecord.flat_id || userRecord.flatId || "",
    },
    apartment: {
      id: userRecord.apartment_id || "",
      name:
        userRecord.apartment_name ||
        userRecord.apartmentName ||
        userRecord.apartment ||
        "",
    },
    credentials: sanitizeUserCredentials(userRecord),
  };
};

const readUserCredentials = async (userMail) => {
  return (
    (await getItemByKey(appConfig.tables.users, {
      user_mail: userMail,
    })) ||
    (await scanItemsByAttribute(appConfig.tables.users, "user_mail", userMail))[0] ||
    null
  );
};

export const getProfile = async (userMail) => {
  const profile = await getLiveUserProfile(userMail);

  if (!profile) {
    return null;
  }

  const { userRecord: user, apartment } = profile;

  return {
    user: {
      mail: user.user_mail,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
    apartment: {
      id: apartment.apartment_id,
      name: apartment.apartment_name,
      address: apartment.address,
      billing_cycle: apartment.billing_cycle,
    },
  };
};

export const getSettingsProfile = async (userMail) => {
  const userRecord = await readUserCredentials(userMail);

  if (!userRecord) {
    return null;
  }

  return buildSettingsProfile(userRecord);
};
