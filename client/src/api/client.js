import axios from "axios";

const baseURL =
  process.env.REACT_APP_API_BASE_URL || "https://api.terraclime.com/api";

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { apiClient, baseURL };