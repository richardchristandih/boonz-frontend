// src/services/api.js
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001/api";
const ACCESS_KEY = "token";
const REFRESH_KEY = "refreshToken";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false, // keep cookies if your backend sets them
});

// ---------------- Request Interceptor ----------------
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------- Response Interceptor ----------------
let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    if (!response) return Promise.reject(error);

    // If not 401 or already retried → just reject
    if (response.status !== 401 || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true; // avoid infinite loops

    // One refresh request at a time
    if (!refreshPromise) {
      const refreshToken = localStorage.getItem(REFRESH_KEY);

      if (!refreshToken) {
        // No refresh token → force logout
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem("user");
        window.location.assign("/login");
        return Promise.reject(error);
      }

      refreshPromise = axios
        .post(`${API_BASE}/auth/refresh`, { refreshToken })
        .then((res) => {
          const newAccess = res.data?.accessToken;
          const newRefresh = res.data?.refreshToken ?? refreshToken;

          if (newAccess) localStorage.setItem(ACCESS_KEY, newAccess);
          if (newRefresh) localStorage.setItem(REFRESH_KEY, newRefresh);

          return newAccess;
        })
        .catch((err) => {
          // Refresh failed → logout
          localStorage.removeItem(ACCESS_KEY);
          localStorage.removeItem(REFRESH_KEY);
          localStorage.removeItem("user");
          window.location.assign("/login");
          throw err;
        })
        .finally(() => {
          // allow new refresh next time
          setTimeout(() => (refreshPromise = null), 0);
        });
    }

    try {
      await refreshPromise; // wait for token refresh
      const newToken = localStorage.getItem(ACCESS_KEY);
      if (newToken) config.headers.Authorization = `Bearer ${newToken}`;
      return api(config); // retry original request
    } catch (err) {
      return Promise.reject(err);
    }
  }
);

export default api;
