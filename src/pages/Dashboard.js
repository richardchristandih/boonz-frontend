// src/pages/Dashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chart as ChartJS, registerables } from "chart.js";
import ProductSalesChart from "../components/ProductSalesChart";
import DashboardSkeleton from "../components/DashboardSkeleton";
import ErrorState from "../components/ErrorState";
import api from "../services/api";
import "./Dashboard.css";
import { formatIDR } from "../utils/money"; // <-- shared Rupiah formatter

ChartJS.register(...registerables);

export default function Dashboard() {
  const navigate = useNavigate();
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : { role: "admin" };

  if (user.role !== "admin") {
    return <div className="page-container">Access Denied. Admins only.</div>;
  }

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Error fetching dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          fetchData();
        }}
      />
    );
  }

  const { totalSales, orderCount, averageOrder, productSales } = dashboardData;

  return (
    <div className="page-container">
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="page-title">Sales Dashboard</h1>

      <section className="cards-grid">
        <div className="card">
          <h3>Today&apos;s Sales</h3>
          <p className="metric">
            {formatIDR(totalSales.day, { withDecimals: true })}
          </p>
        </div>
        <div className="card">
          <h3>This Month&apos;s Sales</h3>
          <p className="metric">
            {formatIDR(totalSales.month, { withDecimals: true })}
          </p>
        </div>
        <div className="card">
          <h3>This Year&apos;s Sales</h3>
          <p className="metric">
            {formatIDR(totalSales.year, { withDecimals: true })}
          </p>
        </div>
        <div className="card">
          <h3>Total Orders</h3>
          <p className="metric">{orderCount}</p>
        </div>
        <div className="card">
          <h3>Average Order</h3>
          <p className="metric">
            {formatIDR(averageOrder, { withDecimals: true })}
          </p>
        </div>
      </section>

      <section className="card scroll-card">
        <div className="card__head">
          <h2 className="card__title">Product Sales (Chart)</h2>
        </div>
        <div className="card__body scroll-body">
          <div className="chart-wrap">
            <ProductSalesChart productSales={productSales} />
          </div>
        </div>
      </section>

      <section className="card scroll-card">
        <div className="card__head">
          <h2 className="card__title">Product Sales (Table)</h2>
        </div>
        <div className="card__body scroll-body">
          <div className="table-wrap">
            <table className="product-sales-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity Sold</th>
                  <th>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {productSales.map((item) => (
                  <tr key={item.productId || item.name}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatIDR(item.total, { withDecimals: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
