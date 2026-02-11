import { Router } from "express";
import { leakController } from "../controllers/leakController.js";

const router = Router();

router.get("/summary", leakController);

export default router;
