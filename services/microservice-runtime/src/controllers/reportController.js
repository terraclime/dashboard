import { getFlatReport, getReportsOverview } from "../services/reportService.js";

export const reportsOverviewController = async (req, res) => {
  const { apartment_id } = req.query;

  if (!apartment_id) {
    return res.status(400).json({ message: "apartment_id is required" });
  }

  try {
    const data = await getReportsOverview(apartment_id);
    res.status(200).json(data);
  } catch (error) {
    console.error("Failed to load reports data", error);
    res.status(500).json({ message: "Failed to load reports data" });
  }
};

export const flatReportController = async (req, res) => {
  const { apartment_id } = req.query;
  const { flatId } = req.params;

  if (!apartment_id) {
    return res.status(400).json({ message: "apartment_id is required" });
  }

  try {
    const detail = await getFlatReport(flatId, apartment_id);
    if (!detail) {
      return res.status(404).json({ message: "Flat not found" });
    }
    res.status(200).json(detail);
  } catch (error) {
    console.error("Failed to load flat report", error);
    res.status(500).json({ message: "Failed to load flat report" });
  }
};
