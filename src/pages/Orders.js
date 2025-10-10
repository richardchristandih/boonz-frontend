// src/pages/Orders.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Orders.css";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

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
  const { show } = useToast();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [timeRangeLabel, setTimeRangeLabel] = useState("today"); // DEFAULT: today
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // --- Detect role (admin vs user) ---
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      setIsAdmin(u?.role === "admin" || u?.isAdmin === true);
    } catch {
      setIsAdmin(false);
    }
  }, []);

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
      const msg = "Failed to load orders. Please try again.";
      setFetchErr(msg);
      show(msg, { type: "error" });
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  const handleTimeRangeChange = (e) => setTimeRangeLabel(e.target.value);

  const filteredOrders = useMemo(() => {
    if (!orders.length) return [];

    // If both custom dates are set, use them instead of the dropdown
    if (customFrom && customTo) {
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      // include full "to" day by setting time to end of day
      toDate.setHours(23, 59, 59, 999);
      return orders.filter((o) => {
        const created = new Date(o.createdAt);
        return created >= fromDate && created <= toDate;
      });
    }

    // otherwise use predefined time range logic
    if (!timeRangeLabel) return orders;

    const now = new Date();
    if (timeRangeLabel === "today") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return orders.filter((o) => new Date(o.createdAt) >= startOfToday);
    }

    const days = timeRangeMapping[timeRangeLabel];
    if (!Number.isFinite(days)) return orders;

    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return orders.filter((o) => new Date(o.createdAt) >= from);
  }, [orders, timeRangeLabel, customFrom, customTo]);

  // ✅ Summary stats for filtered list
  const totalTransactions = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce(
    (acc, order) => acc + (Number(order.totalAmount) || 0),
    0
  );

  const handleCancelOrder = async (orderId) => {
    const ok =
      (await confirm({
        title: "Cancel order?",
        message:
          "This will set the order status to Cancelled. You can’t undo this.",
        confirmText: "Cancel order",
        cancelText: "Keep",
        danger: true,
      })) ?? false;
    if (!ok) return;

    try {
      await api.patch(`/orders/${orderId}`, { status: "cancelled" });
      show("Order cancelled.", { type: "success" });
      fetchOrders();
    } catch (error) {
      show("There was an error cancelling the order.", { type: "error" });
    }
  };

  const handleMarkDoneOrder = async (orderId) => {
    const ok =
      (await confirm({
        title: "Mark as done?",
        message: "This will mark the order as completed.",
        confirmText: "Mark done",
        cancelText: "Back",
      })) ?? false;
    if (!ok) return;

    try {
      await api.patch(`/orders/${orderId}`, { status: "done" });
      show("Order marked as done.", { type: "success" });
      fetchOrders();
    } catch (error) {
      show("There was an error marking the order as done.", {
        type: "error",
      });
    }
  };

  const handleRefundOrder = async (orderId) => {
    const ok =
      (await confirm({
        title: "Issue refund?",
        message:
          "This will set the order status to Refunded. Continue with refund?",
        confirmText: "Refund",
        cancelText: "Cancel",
        danger: true,
      })) ?? false;
    if (!ok) return;

    try {
      await api.patch(`/orders/${orderId}`, { status: "refunded" });
      show("Refund processed.", { type: "success" });
      fetchOrders();
    } catch (error) {
      show("There was an error processing the refund.", { type: "error" });
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

          {/* Custom range picker */}
          <div className="custom-range">
            <label>Or pick range:</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span>to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
            {(customFrom || customTo) && (
              <button
                className="btn small"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="orders-summary">
          <div className="summary-item">
            <strong>Transactions:</strong> {loading ? "…" : totalTransactions}
          </div>
          {/* 👇 Hide Revenue for non-admin users */}
          {isAdmin && (
            <div className="summary-item">
              <strong>Revenue:</strong> {loading ? "…" : fmtRp(totalRevenue)}
            </div>
          )}
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
            const status = String(order.status || "pending").toLowerCase();

            return (
              <div key={order._id} className="order-card">
                <div className="order-head">
                  <div className="order-title">
                    <span className="order-number">
                      Order #{order.orderNumber}
                    </span>
                    <span className={`badge status-${status}`}>
                      {status.toUpperCase()}
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
                  {/* PENDING actions */}
                  {status === "pending" && (
                    <>
                      {/* Admin: Cancel + Mark as Done */}
                      {isAdmin ? (
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
                      ) : (
                        // User: only Mark as Done
                        <button
                          className="btn success"
                          onClick={() => handleMarkDoneOrder(order._id)}
                        >
                          Mark as Done
                        </button>
                      )}
                    </>
                  )}

                  {/* DONE actions */}
                  {status === "done" && isAdmin && (
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
