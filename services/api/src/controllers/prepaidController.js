import {
  getZoneOverview,
  rechargeHouse,
  setValve,
  getHouseInfo,
} from "../services/prepaidService.js";

// ─── GET /api/prepaid/house/:houseId?zone_id= ────────────────────────────────
// Public — no auth required. Used by the resident payment page.

export async function getHouseForPayment(req, res) {
  const { houseId } = req.params;
  const { zone_id } = req.query;

  if (!zone_id) {
    return res.status(400).json({ success: false, message: "zone_id is required" });
  }

  try {
    const data = await getHouseInfo(zone_id, houseId);
    return res.json({ success: true, house: data.enriched, zone: data.zone });
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }
}

export async function getPrepaidOverview(req, res) {
  const { zone_id } = req.query;
  if (!zone_id) {
    return res.status(400).json({ success: false, message: "zone_id is required" });
  }
  try {
    const data = await getZoneOverview(zone_id);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/prepaid/recharge ──────────────────────────────────────────────
// Body: { zone_id, house_id, amount }

export async function rechargeHouseCredit(req, res) {
  const { zone_id, house_id, amount } = req.body;

  if (!zone_id || !house_id || amount == null) {
    return res
      .status(400)
      .json({ success: false, message: "zone_id, house_id, and amount are required" });
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "amount must be a positive number" });
  }

  try {
    const house = await rechargeHouse(zone_id, house_id, parsed);
    return res.json({
      success: true,
      house,
      message: `Recharged \u20B9${parsed} to ${house_id}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /api/prepaid/valve ─────────────────────────────────────────────────
// Body: { zone_id, house_id, action: "open" | "shutoff" }

export async function updateValveStatus(req, res) {
  const { zone_id, house_id, action } = req.body;

  if (!zone_id || !house_id || !action) {
    return res
      .status(400)
      .json({ success: false, message: "zone_id, house_id, and action are required" });
  }

  try {
    const house = await setValve(zone_id, house_id, action);
    return res.json({
      success: true,
      house,
      message: `Valve set to '${action}' for ${house_id}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
