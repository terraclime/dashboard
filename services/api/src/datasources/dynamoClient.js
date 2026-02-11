import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "../config/env.js";

let memoisedDocumentClient = null;

export const getDocumentClient = () => {
  if (appConfig.demoMode) {
    throw new Error(
      "DynamoDB client requested while demo mode is enabled. Disable USE_DEMO_DATA to connect to AWS."
    );
  }

  if (!memoisedDocumentClient) {
    const nativeClient = new DynamoDBClient({
      region: appConfig.awsRegion,
    });
    memoisedDocumentClient = DynamoDBDocumentClient.from(nativeClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return memoisedDocumentClient;
};
