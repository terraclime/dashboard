import { getDashboardOverview } from "../services/dashboardService.js";

export const dashboardController = async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const overview = getDashboardOverview(apartment_id);
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
};
