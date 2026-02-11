import { Router } from "express";
import {
  flatReportController,
  reportsOverviewController,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overview", reportsOverviewController);
router.get("/flats/:flatId", flatReportController);

export default router;
