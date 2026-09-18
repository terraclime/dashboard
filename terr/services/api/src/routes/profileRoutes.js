import { Router } from "express";
import { profileController } from "../controllers/profileController.js";

const router = Router();

router.get("/settings", profileController);
router.get("/", profileController);

export default router;
