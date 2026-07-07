import { Router } from "express";
import {
  getPrepaidOverview,
  rechargeHouseCredit,
  updateValveStatus,
  getHouseForPayment,
} from "../controllers/prepaidController.js";

const router = Router();

// GET  /api/prepaid/overview?zone_id=       — full zone + per-house status (admin)
router.get("/overview", getPrepaidOverview);

// GET  /api/prepaid/house/:houseId?zone_id= — single house info (public, payment page)
router.get("/house/:houseId", getHouseForPayment);

// POST /api/prepaid/recharge                — add credit to a house
router.post("/recharge", rechargeHouseCredit);

// POST /api/prepaid/valve                   — manually open or shut off a valve
router.post("/valve", updateValveStatus);

export default router;
