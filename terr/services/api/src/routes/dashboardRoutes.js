import { Router } from "express";
import {
  dashboardController,
  dashboardTariffController,
  saveDashboardTariffController,
} from "../controllers/dashboardController.js";

const router = Router();

router.get("/overview", dashboardController);
router.get("/tariff", dashboardTariffController);
router.put("/tariff", saveDashboardTariffController);

export default router;
