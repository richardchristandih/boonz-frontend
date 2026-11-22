import React from "react";
import { Link, useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";

export default function WorkspacePage({ title, description, actions, children, className = "" }) {
  const navigate = useNavigate();

  return (
    <div className="boonz-register boonz-workspace">
      <a className="workspace-skip" href="#workspace-main">Skip to content</a>
      <Sidebar
        onAddProduct={() => navigate("/product-page?view=add")}
        onAddCategory={() => navigate("/admin/categories?view=add")}
      />
      <main className={`workspace-main ${className}`} id="workspace-main">
        <header className="workspace-header">
          <div>
            <Link className="workspace-home" to="/" aria-label="Back to point of sale">Boonz POS <span aria-hidden="true">/</span></Link>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="workspace-header-actions">{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}

export function WorkspaceMetrics({ items, label }) {
  return (
    <dl className="workspace-metrics" aria-label={label}>
      {items.map(([name, value]) => (
        <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}
