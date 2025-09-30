import React from "react";
import "./Skeleton.css";

const ArrowBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function DashboardSkeleton() {
  return (
    <div className="page-container">
      <button className="back-btn skeleton-btn" type="button" disabled>
        <ArrowBack /> <span>Back</span>
      </button>

      <div className="skeleton-title shimmer" style={{ width: 220 }} />

      <section className="cards-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="card" key={i}>
            <div className="skeleton-subtitle shimmer" />
            <div className="skeleton-metric shimmer" />
          </div>
        ))}
      </section>

      <section className="section">
        <div className="skeleton-title shimmer" style={{ width: 280 }} />
        <div className="chart-wrap">
          <div className="skeleton-chart shimmer" />
        </div>
      </section>

      <section className="section">
        <div className="skeleton-title shimmer" style={{ width: 260 }} />
        <div className="table-wrap">
          <div className="skeleton-table">
            <div className="skeleton-table-head">
              <div className="shimmer" />
              <div className="shimmer" />
              <div className="shimmer" />
            </div>
            <div className="skeleton-table-body">
              {Array.from({ length: 6 }).map((_, r) => (
                <div className="row" key={r}>
                  <div className="cell shimmer" />
                  <div className="cell shimmer" />
                  <div className="cell shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
