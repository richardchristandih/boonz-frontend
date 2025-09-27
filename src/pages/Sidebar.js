// src/pages/Sidebar.js (or Sidebar.jsx)
import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const MOBILE_BP = 900; // px

export default function Sidebar({ onAddProduct = () => {} }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false
  );

  // Restore collapsed state (desktop only)
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  // Track viewport size (with addEventListener/addListener fallback)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const handler = (e) => setIsMobile(e.matches);

    // init once
    handler(mq);

    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // Safari < 14
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
  }, []);

  // Auto-expand on mobile/tablet (no collapsed sidebar on small screens)
  useEffect(() => {
    if (isMobile && collapsed) setCollapsed(false);
  }, [isMobile, collapsed]);

  const toggle = () => {
    if (isMobile) return; // disabled on mobile
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const isCollapsed = !isMobile && collapsed;

  return (
    <aside className={`layout-sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        <h2 className="sidebar-logo">{isCollapsed ? "Bz" : "Boonz"}</h2>

        {/* Hide toggle on mobile; keep it inside the header row */}
        {!isMobile && (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle"
            onClick={toggle}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <i
              className={`fas ${
                collapsed ? "fa-angle-double-right" : "fa-angle-double-left"
              }`}
            />
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <NavLink
          to="/dashboard"
          title="Dashboard"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-tachometer-alt" />
          {!isCollapsed && <span>Dashboard</span>}
        </NavLink>

        <NavLink
          to="/orders"
          title="Orders"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-shopping-bag" />
          {!isCollapsed && <span>Orders</span>}
        </NavLink>

        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-cog" />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>
      </nav>

      <button
        className="add-product-btn"
        onClick={onAddProduct}
        title="Add Product"
        type="button"
      >
        <i className="fas fa-plus-circle" />
        {!isCollapsed && <span>Add Product</span>}
      </button>
    </aside>
  );
}
