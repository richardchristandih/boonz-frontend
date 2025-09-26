import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const MOBILE_BP = 900; // px

export default function Sidebar({ onAddProduct = () => {} }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false
  );

  // Load saved state (desktop only)
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  // Track viewport size
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const handler = (e) => setIsMobile(e.matches);
    handler(mq); // initialize
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto expand on mobile/tablet
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

  const collapsedClass = !isMobile && collapsed ? "collapsed" : "";

  return (
    <aside className={`layout-sidebar ${collapsedClass}`}>
      <div className="sidebar-top">
        <h2 className="sidebar-logo">{collapsedClass ? "Bz" : "Boonz"}</h2>

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

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          title="Dashboard"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-tachometer-alt" />
          {!collapsedClass && <span>Dashboard</span>}
        </NavLink>

        <NavLink
          to="/orders"
          title="Orders"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-shopping-bag" />
          {!collapsedClass && <span>Orders</span>}
        </NavLink>

        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <i className="fas fa-cog" />
          {!collapsedClass && <span>Settings</span>}
        </NavLink>
      </nav>

      <button
        className="add-product-btn"
        onClick={onAddProduct}
        title="Add Product"
      >
        <i className="fas fa-plus-circle" />
        {!collapsedClass && <span>Add Product</span>}
      </button>
    </aside>
  );
}
