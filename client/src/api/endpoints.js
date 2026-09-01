import {
  apiClient,
  authClient,
  billingClient,
  billsClient,
  dashboardClient,
  profileClient,
  reportsClient,
} from "./client";

export const loginRequest = (payload) =>
  authClient.post("/auth/login", payload);

export const fetchDashboardOverview = (apartmentId) =>
  dashboardClient.get("/dashboard/overview", {
    params: { apartment_id: apartmentId },
  });

export const fetchDashboardTariff = (apartmentId, cycleId) =>
  dashboardClient.get("/dashboard/tariff", {
    params: { apartment_id: apartmentId, cycle_id: cycleId },
  });

export const saveDashboardTariff = (payload) =>
  dashboardClient.put("/dashboard/tariff", payload);

export const fetchReportsOverview = (apartmentId) =>
  reportsClient.get("/reports/overview", {
    params: { apartment_id: apartmentId },
  });

export const fetchFlatReport = (apartmentId, flatId) =>
  reportsClient.get(`/reports/flats/${flatId}`, {
    params: { apartment_id: apartmentId },
  });

export const fetchLeakSummary = (apartmentId) =>
  apiClient.get("/leaks/summary", {
    params: { apartment_id: apartmentId },
  });

export const fetchBillingSummary = (apartmentId, cycle = {}) =>
  billingClient.get("/billing/summary", {
    params: {
      apartment_id: apartmentId,
      period_start: cycle.period_start,
      period_end: cycle.period_end,
    },
  });

export const fetchProfile = (userMail) =>
  profileClient.get("/profile/settings", {
    params: { user_mail: userMail },
  });

export const sendFlatBill = (flatId, cycleId, apartmentId) =>
  billsClient.post(`/bills/send/${flatId}`, {
    cycleId,
    apartment_id: apartmentId,
  });

export const sendBillByEmail = (email, apartmentId, cycleId) =>
  billsClient.post("/bills/send-email", {
    email,
    apartment_id: apartmentId,
    cycleId,
  });

export const sendBulkBills = (cycleId, concurrency = 5, flatIds = [], apartmentId) =>
  billsClient.post("/bills/send-bulk", {
    cycleId,
    concurrency,
    flatIds,
    apartment_id: apartmentId,
  });

export const getBillJobStatus = (jobId) =>
  billsClient.get(`/bills/status/${jobId}`);

export const previewTenantFinalization = (flatId, apartmentId, cycleId, cutoffDate) =>
  billsClient.get(`/bills/finalization-preview/${flatId}`, {
    params: {
      apartment_id: apartmentId,
      cycleId,
      cutoff_date: cutoffDate,
    },
  });

export const finalizeTenantBilling = (flatId, apartmentId, cycleId, cutoffDate) =>
  billsClient.post(`/bills/finalize/${flatId}`, {
    apartment_id: apartmentId,
    cycleId,
    cutoff_date: cutoffDate,
  });

export const retryFinalBillEmail = (finalizationId) =>
  billsClient.post(`/bills/finalizations/${finalizationId}/retry-email`);

export const assignFlatOccupancy = (flatId, payload) =>
  billsClient.post(`/bills/flats/${flatId}/occupancies`, payload);

export const updateFlatOccupancy = (flatId, payload) =>
  billsClient.patch(`/bills/flats/${flatId}/current-occupancy`, payload);

export const fetchPrepaidOverview = (zoneId) =>
  apiClient.get("/prepaid/overview", { params: { zone_id: zoneId } });

export const fetchPrepaidHouse = (zoneId, houseId) =>
  apiClient.get(`/prepaid/house/${houseId}`, { params: { zone_id: zoneId } });

export const prepaidRechargeHouse = (zoneId, houseId, amount) =>
  apiClient.post("/prepaid/recharge", { zone_id: zoneId, house_id: houseId, amount });

export const prepaidSetValve = (zoneId, houseId, action) =>
  apiClient.post("/prepaid/valve", { zone_id: zoneId, house_id: houseId, action });
