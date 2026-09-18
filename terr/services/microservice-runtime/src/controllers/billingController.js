import { getBillingSummary } from "../services/billingService.js";

export const billingController = async (req, res) => {
  const { apartment_id, period_start, period_end } = req.query;
  try {
    const summary = await getBillingSummary(apartment_id, {
      periodStart: period_start,
      periodEnd: period_end,
    });
    res.status(200).json(summary);
  } catch (error) {
    console.error("[billingController] Failed to load billing data:", error);
    res.status(500).json({ message: "Failed to load billing data" });
  }
};
