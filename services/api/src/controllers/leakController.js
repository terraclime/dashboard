import { getLeakOverview } from "../services/leakService.js";

export const leakController = async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const overview = getLeakOverview(apartment_id);
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: "Failed to load leak data" });
  }
};
