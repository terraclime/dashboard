import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { appConfig } from "../config/env.js";
import { demoUsers } from "../data/demoData.js";

const TOKEN_TTL = "2h";

const getUserFromDemo = (userMail) =>
  demoUsers.find(
    (candidate) => candidate.user_mail.toLowerCase() === userMail.toLowerCase()
  );

export const login = async (userMail, password) => {
  const userRecord = getUserFromDemo(userMail);

  if (!userRecord) {
    throw new Error("Invalid credentials");
  }

  const passwordOk = await bcrypt.compare(password, userRecord.hash_password);
  if (!passwordOk) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      user_mail: userRecord.user_mail,
      role: userRecord.role,
      apartment_id: userRecord.apartment_id,
    },
    appConfig.jwtSecret,
    { expiresIn: TOKEN_TTL }
  );

  return {
    token,
    role: userRecord.role,
    apartment: {
      id: userRecord.apartment_id,
      name: userRecord.apartment_name,
    },
    user: {
      mail: userRecord.user_mail,
      first_name: userRecord.first_name,
      last_name: userRecord.last_name,
    },
  };
};
