// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Chart as ChartJS,
  registerables
} from 'chart.js';
import ProductSalesChart from '../components/ProductSalesChart';
import './Dashboard.css';

ChartJS.register(...registerables);

export default function Dashboard() {
  const navigate = useNavigate();

  // Optional role-gate (keep or remove)
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : { role: 'admin' };
  if (user.role !== 'admin') return <div className="page-container">Access Denied. Admins only.</div>;

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('http://localhost:5001/api/dashboard');
        setDashboardData(data);
      } catch (err) {
        setError('Error fetching dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="page-container">Loading dashboard...</div>;
  if (error)   return <div className="page-container">{error}</div>;

  const { totalSales, orderCount, averageOrder, productSales } = dashboardData;

  return (
    <div className="page-container">
      {/* Back */}
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="page-title">Sales Dashboard</h1>

      <section className="cards-grid">
        <div className="card">
          <h3>Today&apos;s Sales</h3>
          <p className="metric">${totalSales.day.toFixed(2)}</p>
        </div>
        <div className="card">
          <h3>This Month&apos;s Sales</h3>
          <p className="metric">${totalSales.month.toFixed(2)}</p>
        </div>
        <div className="card">
          <h3>This Year&apos;s Sales</h3>
          <p className="metric">${totalSales.year.toFixed(2)}</p>
        </div>
        <div className="card">
          <h3>Total Orders</h3>
          <p className="metric">{orderCount}</p>
        </div>
        <div className="card">
          <h3>Average Order</h3>
          <p className="metric">${averageOrder.toFixed(2)}</p>
        </div>
      </section>

      <section className="section">
        <h1 className="page-title">Product Sales (Chart)</h1>
        <div className="chart-wrap">
          <ProductSalesChart productSales={productSales} />
        </div>
      </section>

      <section className="section">
        <h1 className="page-title">Product Sales (Table)</h1>
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
                  <td>${Number(item.total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
