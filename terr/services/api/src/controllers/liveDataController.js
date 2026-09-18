import {
  ingestLiveData,
  LiveDataPersistenceError,
  LiveDataValidationError,
} from "../services/liveDataService.js";

export const ingestLiveDataController = async (req, res) => {
  try {
    const record = await ingestLiveData(req.body);

    return res.status(202).json({
      success: true,
      message: "Live data accepted",
      data: record,
    });
  } catch (error) {
    if (error instanceof LiveDataValidationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error instanceof LiveDataPersistenceError) {
      console.error("Live data DynamoDB write failed", {
        message: error.message,
        details: error.details,
        cause: error.cause,
      });

      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.details,
      });
    }

    console.error("Unexpected live data ingestion failure", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to ingest live data",
    });
  }
};
