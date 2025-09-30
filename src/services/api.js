// src/services/api.js
import axios from "axios";

const ACCESS_KEY = "token";
const REFRESH_KEY = "refreshToken";

function pickBaseURL() {
  const envUrl =
    process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE;
  if (envUrl) return envUrl;

  const host = window.location.hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  if (isLocal) {
    const usingProxy =
      String(process.env.REACT_APP_USE_PROXY || "").toLowerCase() === "true";
    return usingProxy ? "/api" : "http://localhost:5001/api";
  }

  return "/api";
}

const API_BASE = pickBaseURL();

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
  timeout: 15000,
  headers: {
    Accept: "application/json",
  },
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

// ---------------- Response Interceptor (401 refresh) ----------------
let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    if (!response) return Promise.reject(error);

    // Not 401 or already retried once -> just bubble up
    if (response.status !== 401 || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;

    // One refresh request in flight at a time
    if (!refreshPromise) {
      const refreshToken = localStorage.getItem(REFRESH_KEY);

      if (!refreshToken) {
        localLogout();
        return Promise.reject(error);
      }

      // Use a bare axios (not the instance) to avoid interceptor recursion
      refreshPromise = axios
        .post(
          `${API_BASE.replace(/\/$/, "")}/auth/refresh`,
          { refreshToken },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
          }
        )
        .then((res) => {
          const newAccess = res.data?.accessToken;
          const newRefresh = res.data?.refreshToken ?? refreshToken;

          if (newAccess) localStorage.setItem(ACCESS_KEY, newAccess);
          if (newRefresh) localStorage.setItem(REFRESH_KEY, newRefresh);

          return newAccess;
        })
        .catch((err) => {
          localLogout();
          throw err;
        })
        .finally(() => {
          setTimeout(() => (refreshPromise = null), 0);
        });
    }

    try {
      await refreshPromise; // wait for token refresh
      const newToken = localStorage.getItem(ACCESS_KEY);
      if (newToken) config.headers.Authorization = `Bearer ${newToken}`;
      return api(config); // retry original request with new token
    } catch (err) {
      return Promise.reject(err);
    }
  }
);

function localLogout() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem("user");
  // Hard redirect so app state resets
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export default api;
