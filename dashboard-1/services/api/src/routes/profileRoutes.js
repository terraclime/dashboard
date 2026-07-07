import { Router } from "express";
import { profileController } from "../controllers/profileController.js";

const router = Router();

router.get("/", profileController);

export default router;
