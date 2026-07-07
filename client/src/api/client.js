import axios from "axios";

// In development the CRA dev-server proxies /api/* to localhost:8080/api/*
// (see "proxy" in package.json). This means mobile devices only need port 3000
// because the computer's dev-server forwards the API calls on their behalf.
// In production set REACT_APP_API_BASE_URL to the deployed API origin.
// Set REACT_APP_AUTH_API_BASE_URL when auth is deployed to a different origin.
//const baseURL = process.env.REACT_APP_API_BASE_URL || "https://api.terraclime.com/api";
const baseURL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8080/api";
const reportsBaseURL =
  process.env.REACT_APP_REPORTS_API_BASE_URL || "https://reports.terraclime.com/api";
const dashboardBaseURL =
  process.env.REACT_APP_DASHBOARD_API_BASE_URL || "https://overview.terraclime.com/api";
const billingBaseURL =
  process.env.REACT_APP_BILLING_API_BASE_URL ||
  "https://billing-api.terraclime.com/api";
const billsBaseURL =
  process.env.REACT_APP_BILLS_API_BASE_URL ||
  "https://bills-api.terraclime.com/api";
const authBaseURL =
  process.env.REACT_APP_AUTH_API_BASE_URL || "https://auth.terraclime.com/api";
const profileBaseURL =
  process.env.REACT_APP_PROFILE_API_BASE_URL || "https://profile.terraclime.com/api";

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
