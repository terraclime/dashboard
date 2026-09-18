import {
  getDashboardOverview,
  getDashboardTariff,
  saveDashboardTariff,
} from "../services/dashboardService.js";

export const dashboardController = async (req, res) => {
  const { apartment_id } = req.query;
  try {
    const overview = await getDashboardOverview(apartment_id);
    res.status(200).json(overview);
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard data" });
  }
};

export const dashboardTariffController = async (req, res) => {
  const { apartment_id, cycle_id } = req.query;

  try {
    const tariff = await getDashboardTariff(apartment_id, cycle_id);
    res.status(200).json(
      tariff || {
        apartment_id,
        cycle_id,
        sources: [],
        blended_rate: null,
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard tariff" });
  }
};

export const saveDashboardTariffController = async (req, res) => {
  const { apartment_id, cycle_id, sources, blended_rate } = req.body || {};

  try {
    const tariff = await saveDashboardTariff({
      apartmentId: apartment_id,
      cycleId: cycle_id,
      sources,
      blendedRate: blended_rate,
    });
    res.status(200).json(tariff);
  } catch (error) {
    res.status(500).json({ message: "Failed to save dashboard tariff" });
  }
};
