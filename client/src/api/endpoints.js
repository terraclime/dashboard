import { apiClient } from "./client";

export const loginRequest = (payload) =>
  apiClient.post("/auth/login", payload);

export const fetchDashboardOverview = (apartmentId) =>
  apiClient.get("/dashboard/overview", {
    params: { apartment_id: apartmentId },
  });

export const fetchReportsOverview = (apartmentId) =>
  apiClient.get("/reports/overview", {
    params: { apartment_id: apartmentId },
  });

export const fetchFlatReport = (apartmentId, flatId) =>
  apiClient.get(`/reports/flats/${flatId}`, {
    params: { apartment_id: apartmentId },
  });

export const fetchLeakSummary = (apartmentId) =>
  apiClient.get("/leaks/summary", {
    params: { apartment_id: apartmentId },
  });

export const fetchBillingSummary = (apartmentId) =>
  apiClient.get("/billing/summary", {
    params: { apartment_id: apartmentId },
  });

export const fetchProfile = (userMail) =>
  apiClient.get("/profile", {
    params: { user_mail: userMail },
  });
