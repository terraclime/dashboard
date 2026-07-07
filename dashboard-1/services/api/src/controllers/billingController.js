import { getBillingSummary } from "../services/billingService.js";

export const billingController = async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const summary = getBillingSummary(apartment_id);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: "Failed to load billing data" });
  }
};
