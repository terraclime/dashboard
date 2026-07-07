import { Router } from "express";
import { ingestLiveDataController } from "../controllers/liveDataController.js";

const router = Router();

router.post("/data-live", ingestLiveDataController);

export default router;
