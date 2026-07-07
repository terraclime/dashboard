import { Router } from "express";
import {
  profileController,
  settingsProfileController,
} from "../controllers/profileController.js";

const router = Router();

router.get("/settings", settingsProfileController);
router.get("/", profileController);

export default router;
