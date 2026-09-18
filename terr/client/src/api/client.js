import axios from "axios";

const defaultBaseURL =
  process.env.NODE_ENV === "production"
    ? "https://api.terraclime.com/api"
    : "http://localhost:8080/api";

// All services use the consolidated API by default. Deployments can still set
// a global or service-specific URL at build time when needed.
const baseURL = process.env.REACT_APP_API_BASE_URL || defaultBaseURL;
const reportsBaseURL =
  process.env.REACT_APP_REPORTS_API_BASE_URL || baseURL;
const dashboardBaseURL =
  process.env.REACT_APP_DASHBOARD_API_BASE_URL || baseURL;
const billingBaseURL =
  process.env.REACT_APP_BILLING_API_BASE_URL || baseURL;
const billsBaseURL =
  process.env.REACT_APP_BILLS_API_BASE_URL || baseURL;
const authBaseURL =
  process.env.REACT_APP_AUTH_API_BASE_URL || baseURL;
const profileBaseURL =
  process.env.REACT_APP_PROFILE_API_BASE_URL || baseURL;

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

const authClient = axios.create({
  baseURL: authBaseURL,
  timeout: 10000,
});

const reportsClient = axios.create({
  baseURL: reportsBaseURL,
  timeout: 10000,
});

const dashboardClient = axios.create({
  baseURL: dashboardBaseURL,
  timeout: 10000,
});

const billingClient = axios.create({
  baseURL: billingBaseURL,
  timeout: 10000,
});

const billsClient = axios.create({
  baseURL: billsBaseURL,
  timeout: 10000,
});

const profileClient = axios.create({
  baseURL: profileBaseURL,
  timeout: 10000,
});

// QR payment pages can be opened from another device using the frontend's LAN
// URL. Same-origin requests let the dev server proxy /api to the local backend.
const paymentApiClient = axios.create({
  baseURL:
    process.env.REACT_APP_PAYMENT_API_BASE_URL ||
    (process.env.NODE_ENV === "production" ? baseURL : "/api"),
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

reportsClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

dashboardClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

billingClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

billsClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

profileClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export {
  apiClient,
  authClient,
  billingClient,
  billsClient,
  dashboardClient,
  paymentApiClient,
  reportsClient,
  profileClient,
  baseURL,
  authBaseURL,
  billingBaseURL,
  billsBaseURL,
  dashboardBaseURL,
  reportsBaseURL,
  profileBaseURL,
};
