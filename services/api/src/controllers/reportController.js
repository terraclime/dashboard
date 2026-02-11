import { getFlatReport, getReportsOverview } from "../services/reportService.js";

export const reportsOverviewController = async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const data = getReportsOverview(apartment_id);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to load reports data" });
  }
};

export const flatReportController = async (req, res) => {
  const { apartment_id } = req.query;
  const { flatId } = req.params;

  try {
    const detail = getFlatReport(flatId, apartment_id);
    if (!detail) {
      return res.status(404).json({ message: "Flat not found" });
    }
    res.status(200).json(detail);
  } catch (error) {
    res.status(500).json({ message: "Failed to load flat report" });
  }
};
