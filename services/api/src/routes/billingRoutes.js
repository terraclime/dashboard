import { Router } from "express";
import { billingController } from "../controllers/billingController.js";

const router = Router();

router.get("/summary", billingController);

export default router;
