// Re-export mail utilities from the central mail service so that
// billingNotificationController can import from this path.
export { sendBillMail, generateBillHTML } from "../services/mailService.js";
