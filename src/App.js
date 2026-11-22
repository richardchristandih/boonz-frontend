// src/App.js
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import PublicMenu from "./pages/PublicMenu";
import MainMenu from "./pages/MainMenu";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Orders from "./pages/Orders";
import Dashboard from "./pages/Dashboard";
import ProductPage from "./pages/ProductPage";
import PrinterTest from "./components/PrinterTest";

import Settings from "./pages/Settings";
import Inventory from "./pages/Inventory";

// NEW: admin-only Categories page
import CategoriesPage from "./pages/Categories";

// ✅ add providers
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";

function RequireSession({ admin = false, children }) {
  let user;
  try {
    user = JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    user = null;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin" && user.isAdmin !== true) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public/App routes */}
            <Route path="/" element={<MainMenu />} />
            <Route path="/orders" element={<RequireSession><Orders /></RequireSession>} />
            <Route path="/product-page" element={<RequireSession admin><ProductPage /></RequireSession>} />
            <Route path="/printer-test" element={<RequireSession><PrinterTest /></RequireSession>} />
            <Route path="/settings" element={<RequireSession><Settings /></RequireSession>} />
            <Route path="/inventory" element={<RequireSession><Inventory /></RequireSession>} />
            <Route path="/menu" element={<PublicMenu />} />

            {/* Auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Admin-only routes */}
            <Route
              path="/dashboard"
              element={
                <RequireSession admin>
                  <Dashboard />
                </RequireSession>
              }
            />
            <Route
              path="/admin/categories"
              element={
                <RequireSession admin>
                  <CategoriesPage />
                </RequireSession>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
