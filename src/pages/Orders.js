// src/pages/Orders.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Orders.css";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";
import { buildKitchenTicket } from "../kitchenReceipt";
import { buildReceipt } from "../receipt";
import { printRaw, listPrinters } from "../utils/qzHelper";
import {
  isAndroidBridge,
  androidListPrintersDetailed,
  androidPrintWithRetry,
  androidIsBtOn,
  androidPrintLogoAndText,
} from "../utils/androidBridge";
import appLogo from "../images/logo.jpg";

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

// Helper functions for printing
const toStr = (v) => (v == null ? "" : String(v));

function normalizeNote(raw, max = 140) {
  const s = toStr(raw)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function toDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function extractBtAddress(val) {
  const s = String(val || "");
  const m = s.match(/\(([^)]+)\)\s*$/);
  return (m && m[1]) || s;
}

function getPrinterPrefs() {
  return {
    receiptName: localStorage.getItem("printer.receipt") || "",
    kitchenName: localStorage.getItem("printer.kitchen") || "",
    receiptCopies: Math.max(
      1,
      Number(localStorage.getItem("printer.receiptCopies")) || 1
    ),
    kitchenCopies: Math.max(
      1,
      Number(localStorage.getItem("printer.kitchenCopies")) || 1
    ),
  };
}

const RECEIPT_PRINTER_HINT = /RPP02N/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const [printBusy, setPrintBusy] = useState(""); // "", "kitchen", "receipt"

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
      // Use local timezone to ensure correct day boundary
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setHours(23, 59, 59, 999);
      
      return orders.filter((o) => {
        const created = new Date(o.createdAt);
        // Ensure we're comparing dates in the same timezone
        return created >= startOfToday && created <= endOfToday;
      });
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

  // Reprint functions
  async function handlePrintKitchen(kotText) {
    if (!kotText) return;
    try {
      setPrintBusy("kitchen");

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) {
          show("⚠️ Bluetooth is OFF. Please enable it and try again.", {
            type: "error",
            ttl: 5000,
          });
          return;
        }
        const paired = androidListPrintersDetailed();
        const fallbackAddr = paired[0]?.address || paired[0]?.name || "";
        const kitchenTarget =
          extractBtAddress(localStorage.getItem("printer.kitchen")) ||
          fallbackAddr;

        const { kitchenCopies } = getPrinterPrefs();
        for (let i = 0; i < kitchenCopies; i++) {
          await androidPrintWithRetry(kotText, {
            address: kitchenTarget,
            nameLike: kitchenTarget,
            copies: 1,
            tries: 3,
            baseDelay: 500,
          });
        }
        if (kitchenCopies > 1) {
          await sleep(1000);
        }
        show("Kitchen ticket sent.", { type: "success" });
        return;
      }

      // Desktop / QZ (fallback)
      const printers = await listPrinters();
      if (!Array.isArray(printers) || printers.length === 0)
        throw new Error("No printers found (QZ).");

      const preferred =
        printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];

      await printRaw(preferred, kotText);
      show("Kitchen ticket printed.", { type: "success" });
    } catch (err) {
      console.error(err);
      show("Failed to print kitchen ticket: " + (err?.message || "Unknown"), {
        type: "error",
      });
    } finally {
      setPrintBusy("");
    }
  }

  async function handlePrintReceipt(receiptText, logoDataUrl) {
    if (!receiptText) return;
    try {
      setPrintBusy("receipt");

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) {
          show("⚠️ Bluetooth is OFF. Please enable it and try again.", {
            type: "error",
            ttl: 5000,
          });
          return;
        }
        const paired = androidListPrintersDetailed();
        const fallbackAddr = paired[0]?.address || paired[0]?.name || "";
        const receiptTarget =
          extractBtAddress(localStorage.getItem("printer.receipt")) ||
          fallbackAddr;

        const { receiptCopies } = getPrinterPrefs();
        for (let i = 0; i < receiptCopies; i++) {
          const res = await androidPrintLogoAndText(logoDataUrl, receiptText, {
            address: receiptTarget,
            nameLike: receiptTarget,
          });
          if (!res?.text) {
            await androidPrintWithRetry(receiptText + "\n\n\n", {
              address: receiptTarget,
              nameLike: receiptTarget,
              copies: 1,
              tries: 3,
              baseDelay: 500,
            });
          } else {
            await sleep(800);
          }
        }
        show("Receipt sent.", { type: "success" });
        return;
      }

      // Desktop / QZ (fallback)
      const printers = await listPrinters();
      if (!Array.isArray(printers) || printers.length === 0)
        throw new Error("No printers found (QZ).");

      const preferred =
        printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];

      await printRaw(preferred, receiptText);
      show("Receipt printed.", { type: "success" });
    } catch (err) {
      console.error(err);
      show("Failed to print receipt: " + (err?.message || "Unknown"), {
        type: "error",
      });
    } finally {
      setPrintBusy("");
    }
  }

  async function handleReprintKitchen(order) {
    try {
      const dateStr = new Date(order.createdAt).toLocaleString();
      const kitchenItems = (order.products || []).map((it) => ({
        name: it.name || "Item",
        quantity: Number(it.quantity) || 0,
        note: normalizeNote(it.note),
        options: it.options || {},
      }));

      const kotText = buildKitchenTicket({
        orderNumber: order.orderNumber || "N/A",
        dateStr,
        orderType: order.orderType,
        items: kitchenItems,
        customer: { name: order.customerName || "" },
      });

      await handlePrintKitchen(kotText);
    } catch (error) {
      console.error("Error reprinting kitchen ticket:", error);
      show("Failed to reprint kitchen ticket.", { type: "error" });
    }
  }

  async function handleReprintReceipt(order) {
    try {
      const dateStr = new Date(order.createdAt).toLocaleString();
      const itemsForReceipt = (order.products || []).map((it) => {
        const n = normalizeNote(it.note);
        return {
          ...it,
          name: n ? `${it.name} [${n}]` : it.name,
        };
      });

      // Get tax/service settings (simplified - you might want to fetch from API)
      const taxEnabled = true; // Default, adjust as needed
      const serviceEnabled = true; // Default, adjust as needed

      const receiptText = buildReceipt({
        address: "Jl. Mekar Utama No. 61, Bandung",
        orderNumber: order.orderNumber || "N/A",
        dateStr,
        items: itemsForReceipt,
        subtotal: order.subtotal || 0,
        tax: order.tax || 0,
        service: order.serviceCharge || 0,
        showTax: taxEnabled && Number(order.tax) > 0,
        showService: serviceEnabled && Number(order.serviceCharge) > 0,
        discount: order.discount || 0,
        total: order.totalAmount || 0,
        payment: order.paymentMethod,
        orderType: order.orderType,
        customer: { name: order.customerName || "" },
        discountNote: order.discountNote || "",
      }).replace(/^[\s\r\n]+/, "");

      const logoPref = localStorage.getItem("print.logo") || appLogo;
      const logoDataUrl =
        typeof logoPref === "string" && logoPref.startsWith("data:")
          ? logoPref
          : await toDataUrl(logoPref);

      await handlePrintReceipt(receiptText, logoDataUrl);
    } catch (error) {
      console.error("Error reprinting receipt:", error);
      show("Failed to reprint receipt.", { type: "error" });
    }
  }

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
                  {status === "done" && (
                    <>
                      <button
                        className="btn primary"
                        onClick={() => handleReprintKitchen(order)}
                        disabled={printBusy === "kitchen"}
                        title="Reprint Kitchen Ticket"
                      >
                        {printBusy === "kitchen" ? "Printing…" : "Print KOT"}
                      </button>
                      <button
                        className="btn primary"
                        onClick={() => handleReprintReceipt(order)}
                        disabled={printBusy === "receipt"}
                        title="Reprint Customer Receipt"
                      >
                        {printBusy === "receipt" ? "Printing…" : "Print Receipt"}
                      </button>
                      {isAdmin && (
                        <button
                          className="btn warn"
                          onClick={() => handleRefundOrder(order._id)}
                        >
                          Refund
                        </button>
                      )}
                    </>
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
