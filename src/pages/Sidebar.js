// src/components/Sidebar.jsx
import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({ onAddProduct = () => {} }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  return (
    <aside className={`layout-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-top">
        <h2 className="sidebar-logo">{collapsed ? 'Bz' : 'Boonz'}</h2>
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="sidebar-toggle"
          onClick={toggle}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <i className={`fas ${collapsed ? 'fa-angle-double-right' : 'fa-angle-double-left'}`} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <i className="fas fa-tachometer-alt" />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>

        <NavLink
          to="/orders"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <i className="fas fa-shopping-bag" />
          {!collapsed && <span>Orders</span>}
        </NavLink>

        <NavLink
          to="/settings"            // ✅ lowercase path
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <i className="fas fa-cog" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </nav>

      <button className="add-product-btn" onClick={onAddProduct}>
        <i className="fas fa-plus-circle" />
        {!collapsed && <span>Add Product</span>}
      </button>
    </aside>
  );
}
