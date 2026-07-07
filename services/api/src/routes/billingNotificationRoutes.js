import { Router } from "express";
import {
  sendBulkBills,
  sendFlatBill,
  getBillStatus,
  previewBill,
} from "../controllers/billingNotificationController.js";

const router = Router();

// POST /api/bills/send-bulk          — send to all flats in a billing cycle
router.post("/send-bulk", sendBulkBills);

// POST /api/bills/send/:flatId       — send to a single flat
router.post("/send/:flatId", sendFlatBill);

// GET  /api/bills/status/:jobId      — poll async bulk-send job
router.get("/status/:jobId", getBillStatus);

// GET  /api/bills/preview/:flatId    — HTML preview (no email sent)
router.get("/preview/:flatId", previewBill);

export default router;