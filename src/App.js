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

// NEW: admin-only Categories page
import CategoriesPage from "./pages/Categories";

/** Tiny guard to protect admin routes */
function RequireAdmin({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Public/App routes */}
        <Route path="/" element={<MainMenu />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/product-page" element={<ProductPage />} />
        <Route path="/printer-test" element={<PrinterTest />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/menu" element={<PublicMenu />} />

        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Admin-only routes */}
        <Route
          path="/dashboard"
          element={
            <RequireAdmin>
              <Dashboard />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <RequireAdmin>
              <CategoriesPage />
            </RequireAdmin>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
