// src/pages/Orders.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Orders.css";

/* ========= Helpers ========= */
const timeRangeMapping = {
  today: 0, // special case handled below (start of today)
  day1: 1,
  day2: 2,
  day3: 3,
  day4: 4,
  day5: 5,
  day6: 6,
  week: 7,
  month: 30,
  year: 365,
};

function fmtRp(n) {
  const v = Number(n || 0);
  return `Rp.${v.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ========= Skeletons ========= */
function SkeletonOrderCard() {
  return (
    <div className="order-card skeleton">
      <div className="skeleton-line shimmer" style={{ width: "30%" }} />
      <div className="skeleton-line shimmer" style={{ width: "50%" }} />
      <div className="skeleton-badges">
        <div className="skeleton-pill shimmer" />
        <div className="skeleton-pill shimmer" />
        <div className="skeleton-pill shimmer" />
      </div>
      <div className="skeleton-products">
        <div className="skeleton-line shimmer" style={{ width: "60%" }} />
        <div className="skeleton-line shimmer" style={{ width: "40%" }} />
        <div className="skeleton-line shimmer" style={{ width: "50%" }} />
      </div>
      <div className="skeleton-actions">
        <div className="skeleton-btn shimmer" />
        <div className="skeleton-btn shimmer" />
      </div>
    </div>
  );
}

function SkeletonOrdersList({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonOrderCard key={i} />
      ))}
    </>
  );
}

/* ========= Component ========= */
export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [timeRangeLabel, setTimeRangeLabel] = useState("today"); // DEFAULT: today
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      setLoading(true);
      setFetchErr("");
      const response = await api.get("/orders");
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setFetchErr("Failed to load orders. Please try again.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  const handleTimeRangeChange = (e) => setTimeRangeLabel(e.target.value);

  const filteredOrders = useMemo(() => {
    if (!timeRangeLabel) return orders; // All time

    const now = new Date();

    // 'today' => start of today's date (local timezone) to now
    if (timeRangeLabel === "today") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return orders.filter((o) => new Date(o.createdAt) >= startOfToday);
    }

    // other labeled windows => now minus N days (same time of day)
    const days = timeRangeMapping[timeRangeLabel];
    if (!Number.isFinite(days)) return orders;

    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return orders.filter((o) => new Date(o.createdAt) >= from);
  }, [orders, timeRangeLabel]);

  const totalTransactions = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce(
    (acc, order) => acc + (Number(order.totalAmount) || 0),
    0
  );

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: "cancelled" });
      alert("Order cancelled successfully!");
      fetchOrders();
    } catch (error) {
      alert("There was an error cancelling your order.");
    }
  };

  const handleMarkDoneOrder = async (orderId) => {
    if (!window.confirm("Mark this order as done?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: "done" });
      alert("Order marked as done!");
      fetchOrders();
    } catch (error) {
      alert("There was an error marking your order as done.");
    }
  };

  const handleRefundOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to refund this order?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: "refunded" });
      alert("Refund processed successfully!");
      fetchOrders();
    } catch (error) {
      alert("There was an error processing the refund.");
    }
  };

  return (
    <div className="orders-page">
      {/* Back button (consistent with other pages) */}
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="orders-heading">Orders</h1>

      {/* Filter + Summary Row */}
      <div className="orders-toolbar">
        <div className="orders-filter">
          <label htmlFor="time-range">Filter by Time Range:</label>
          <select
            id="time-range"
            value={timeRangeLabel}
            onChange={handleTimeRangeChange}
          >
            <option value="today">Today</option>
            <option value="">All time</option>
            <option value="day1">Last 1 day</option>
            <option value="day2">Last 2 days</option>
            <option value="day3">Last 3 days</option>
            <option value="day4">Last 4 days</option>
            <option value="day5">Last 5 days</option>
            <option value="day6">Last 6 days</option>
            <option value="week">Last 7 days (1 week)</option>
            <option value="month">Last 30 days (1 month)</option>
            <option value="year">Last 365 days (1 year)</option>
          </select>
        </div>

        <div className="orders-summary">
          <div className="summary-item">
            <strong>Transactions:</strong> {loading ? "…" : totalTransactions}
          </div>
          <div className="summary-item">
            <strong>Revenue:</strong> {loading ? "…" : fmtRp(totalRevenue)}
          </div>
        </div>
      </div>

      {/* Error */}
      {fetchErr && <div className="orders-error">{fetchErr}</div>}

      {/* List */}
      <div className="orders-list">
        {loading ? (
          <SkeletonOrdersList count={6} />
        ) : filteredOrders.length === 0 ? (
          <div className="orders-empty">
            <div className="empty-art">📦</div>
            <h3>No orders for this range</h3>
            <p>Try expanding the time range or check back later.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const hasDiscount = Number(order.discount) > 0;
            return (
              <div key={order._id} className="order-card">
                <div className="order-head">
                  <div className="order-title">
                    <span className="order-number">
                      Order #{order.orderNumber}
                    </span>
                    <span
                      className={`badge status-${order.status || "pending"}`}
                    >
                      {String(order.status || "pending").toUpperCase()}
                    </span>
                  </div>
                  <div className="order-meta">
                    <span>ID: {order._id}</span>
                    <span>Total: {fmtRp(order.totalAmount)}</span>
                    <span>
                      Created: {new Date(order.createdAt).toLocaleString()}
                    </span>
                    {order.orderType && <span>Type: {order.orderType}</span>}
                    {order.paymentMethod && (
                      <span>Payment: {order.paymentMethod}</span>
                    )}
                    {hasDiscount && (
                      <span className="discount-chip">
                        {order.discountType === "percentage"
                          ? `Discount (${parseFloat(
                              order.discountValue
                            ).toFixed(0)}%)`
                          : "Discount"}
                        : -{fmtRp(order.discount)}
                        {order.discountNote ? ` (${order.discountNote})` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="products-wrap">
                  <h4 className="products-heading">Products</h4>
                  {order.products?.length ? (
                    <div className="products-list">
                      {order.products.map((product, index) => (
                        <div key={index} className="product-item">
                          <div className="pi-left">
                            <div className="product-name">{product.name}</div>
                            <div className="product-sub">
                              Qty: {product.quantity}
                            </div>
                          </div>
                          <div className="pi-right">{fmtRp(product.price)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No products found in this order.</p>
                  )}
                </div>

                <div className="order-actions">
                  {order.status === "pending" && (
                    <>
                      <button
                        className="btn danger"
                        onClick={() => handleCancelOrder(order._id)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn success"
                        onClick={() => handleMarkDoneOrder(order._id)}
                      >
                        Mark as Done
                      </button>
                    </>
                  )}
                  {order.status === "done" && (
                    <button
                      className="btn warn"
                      onClick={() => handleRefundOrder(order._id)}
                    >
                      Refund
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
