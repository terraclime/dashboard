import { appConfig } from "../config/env.js";

let memoisedDocumentClient = null;

export const getDocumentClient = async () => {
  if (appConfig.demoMode) {
    throw new Error(
      "DynamoDB client requested while demo mode is enabled. Disable USE_DEMO_DATA to connect to AWS."
    );
  }

  if (!memoisedDocumentClient) {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
      import("@aws-sdk/client-dynamodb"),
      import("@aws-sdk/lib-dynamodb"),
    ]);

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
