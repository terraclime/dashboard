import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "../config/env.js";
import { getDocumentClient } from "../datasources/dynamoClient.js";
import { demoApartment, demoUsers } from "./demoData.js";

const seed = async () => {
  if (appConfig.demoMode) {
    console.log(
      "USE_DEMO_DATA is enabled. Disable it to push demo data into DynamoDB."
    );
    return;
  }

  const client = getDocumentClient();

  const userWrites = demoUsers.map(
    (user) =>
      new PutCommand({
        TableName: appConfig.tables.users,
        Item: user,
      })
  );

  const apartmentWrites = [
    new PutCommand({
      TableName: appConfig.tables.apartments,
      Item: {
        apartment_id: demoApartment.apartment_id,
        apartment_name: demoApartment.apartment_name,
        address: demoApartment.address,
        billing_cycle: demoApartment.billing_cycle,
        flats: demoApartment.flats.map((flat) => ({
          flat_id: flat.flat_id,
          resident_name: flat.resident_name,
          block_id: flat.block_id,
          resident_whatsapp: flat.resident_whatsapp,
        })),
      },
    }),
  ];

  const commands = [...userWrites, ...apartmentWrites];

  console.log(
    `Seeding ${commands.length} records into DynamoDB (region: ${appConfig.awsRegion})`
  );

  for (const command of commands) {
    await client.send(command);
  }

  console.log("Seed data pushed successfully.");
};

seed().catch((err) => {
  console.error("Failed to seed demo data", err);
  process.exit(1);
});
