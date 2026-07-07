import dotenv from "dotenv";

dotenv.config();

export const appConfig = {
  awsRegion: process.env.AWS_REGION || "ap-south-1",
  jwtSecret: process.env.JWT_SECRET || "terraclime-change-me",
  jwtTtl: process.env.JWT_TTL || "2h",
  jwtIssuer: process.env.JWT_ISSUER || "terraclime-login-auth-api",
  tables: {
    users: process.env.USERS_TABLE || "UserCredentials",
  },
};
