import { Router } from "express";
import { dashboardController } from "../controllers/dashboardController.js";

const router = Router();

router.get("/overview", dashboardController);

export default router;
