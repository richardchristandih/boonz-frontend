// src/pages/Sidebar.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";
import appLogo from "../images/login-logo.png"; // mobile / top-bar logo
import appLogoSideBar from "../images/boonz-logo.png"; // desktop / sidebar logo

const MOBILE_BP = 900;

/* ---------- Tiny inline icons (no external fonts) ---------- */
const ChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M15 18l-6-6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const ChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M9 6l6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const Tachometer = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 3a9 9 0 100 18 9 9 0 000-18z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M12 7v5l4 2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const Bag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 7h12l-1 12H7L6 7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M9 7a3 3 0 016 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);
const Cog = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 15a3 3 0 100-6 3 3 0 000 6z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M19.4 15a7.97 7.97 0 000-6l2.1-1.2-2-3.4-2.4 1a8.02 8.02 0 00-5-2l-.3-2.6H10l-.3 2.6a8.02 8.02 0 00-5 2l-2.4-1-2 3.4L2.4 9a7.97 7.97 0 000 6l-2.1 1.2 2 3.4 2.4-1a8.02 8.02 0 005 2l.3 2.6h4l.3-2.6a8.02 8.02 0 005-2l2.4 1 2-3.4L19.4 15z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);
const Cube = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2l9 5-9 5-9-5 9-5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M21 7v10l-9 5-9-5V7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);
const LayoutGrid = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

/* ---------- Component ---------- */
export default function Sidebar({
  onAddProduct = () => {},
  onAddCategory = () => {},
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false
  );

  // shimmer control for the logo
  const [logoLoaded, setLogoLoaded] = useState(false);

  // read once
  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      return u?.role === "admin";
    } catch {
      return false;
    }
  }, []);

  const handleAddProduct = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onAddProduct();
    },
    [onAddProduct]
  );

  const handleAddCategory = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onAddCategory();
    },
    [onAddCategory]
  );

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const handle = (e) => setIsMobile(e.matches);
    handle(mq);
    if (mq.addEventListener) {
      mq.addEventListener("change", handle);
      return () => mq.removeEventListener("change", handle);
    } else {
      mq.addListener(handle);
      return () => mq.removeListener(handle);
    }
  }, []);

  useEffect(() => {
    if (isMobile && collapsed) setCollapsed(false);
  }, [isMobile, collapsed]);

  const isCollapsed = !isMobile && collapsed;

  // choose logo per layout
  const logoSrc = isMobile ? appLogo : appLogoSideBar;
  const logoAlt = isMobile ? "Boonz logo" : "Boonz sidebar logo";

  // reset skeleton when the image source changes (mobile <-> desktop)
  useEffect(() => {
    setLogoLoaded(false);
  }, [logoSrc]);

  return (
    <aside
      className={`layout-sidebar ${isCollapsed ? "collapsed" : ""} ${
        isMobile ? "as-topbar" : ""
      }`}
    >
      {/* Header */}
      <div className="sidebar-top">
        {!isCollapsed && (
          <NavLink
            to="/dashboard"
            className={`sidebar-logo ${logoLoaded ? "is-loaded" : ""}`}
            aria-label="Boonz Home"
          >
            {/* skeleton shimmer layer (hidden when .is-loaded is present) */}
            <span className="sidebar-logo__skeleton" aria-hidden="true" />

            <img
              key={logoSrc /* forces image re-load when switching */}
              src={logoSrc}
              alt={logoAlt}
              width={56}
              height={56}
              decoding="async"
              loading="lazy"
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoLoaded(true) /* fail safe: hide skeleton */}
            />
          </NavLink>
        )}

        {!isMobile && (
          <button
            type="button"
            className="sb-icon-btn sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              localStorage.setItem("sidebarCollapsed", String(next));
            }}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Primary">
        {/* Dashboard is ADMIN ONLY */}
        {isAdmin && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Tachometer />
            <span>Dashboard</span>
          </NavLink>
        )}

        <NavLink
          to="/orders"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Bag />
          <span>Orders</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Cog />
          <span>Settings</span>
        </NavLink>

        {/* Mobile quick actions */}
        {isMobile && (
          <>
            <button
              type="button"
              className="nav-link add-pill"
              onClick={handleAddProduct}
              title="Add Product"
            >
              <Cube />
              <span>Add Product</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                className="nav-link add-pill"
                onClick={handleAddCategory}
                title="Add Category"
              >
                <LayoutGrid />
                <span>Add Category</span>
              </button>
            )}
          </>
        )}
      </nav>

      {/* Desktop primary actions */}
      {!isMobile && (
        <div className="sidebar-actions-stack">
          <button
            className="sb-btn sb-btn-primary add-product-btn"
            onClick={handleAddProduct}
            type="button"
            title="Add Product"
          >
            <Cube />
            <span>Add Product</span>
          </button>

          {isAdmin && (
            <button
              className="sb-btn add-category-btn"
              onClick={handleAddCategory}
              type="button"
              title="Add Category"
            >
              <LayoutGrid />
              <span>Add Category</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
