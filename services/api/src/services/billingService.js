import { getAnalyticsSnapshot } from "./analyticsStore.service.js";

export const getBillingSummary = async (apartmentId) => {
  const snapshot = await getAnalyticsSnapshot(apartmentId);
  const totalConsumption = snapshot.flats.reduce((sum, flat) => {
    return (
      sum +
      flat.daily_consumption.reduce(
        (inner, entry) => inner + entry.litres,
        0
      )
    );
  }, 0);

  const perFlat = snapshot.flats.map((flat) => {
    const consumption = flat.daily_consumption.reduce(
      (sum, entry) => sum + entry.litres,
      0
    );
    const charge =
      (consumption / 1000) * snapshot.billing_cycle.tariff_per_kl;

    return {
      flat_id: flat.flat_id,
      block_id: flat.block_id,
      resident_name: flat.resident_name,
      consumption_litres: consumption,
      tariff_per_kl: snapshot.billing_cycle.tariff_per_kl,
      projected_amount: Math.round(charge),
    };
  });

  const projectedAmount = perFlat.reduce(
    (sum, entry) => sum + entry.projected_amount,
    0
  );
  const summary = {
    total_consumption_litres: totalConsumption,
    tariff_per_kl: snapshot.billing_cycle.tariff_per_kl,
    projected_amount: projectedAmount,
    total_flats: perFlat.length,
  };

  return {
    billing_cycle: snapshot.billing_cycle,
    total_consumption_litres: totalConsumption,
    tariff_per_kl: snapshot.billing_cycle.tariff_per_kl,
    maintenance_fee: snapshot.billing_cycle.maintenance_fee,
    per_flat: perFlat,
    summary,
    per_flat_summary: perFlat,
    finance: snapshot.finance,
  };
};
