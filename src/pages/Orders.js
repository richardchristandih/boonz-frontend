// src/pages/Orders.js
import React, { useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiFileText } from "react-icons/fi";
import WorkspacePage, { WorkspaceMetrics } from "../components/WorkspacePage";
import api from "../services/api";
import "./Orders.css";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";
import { buildKitchenTicket } from "../kitchenReceipt";
import { buildReceipt } from "../receipt";
import { printRaw, listPrinters, connectQZ } from "../utils/qzHelper";
import {
  isAndroidBridge,
  androidListPrintersDetailed,
  androidPrintWithRetry,
  androidIsBtOn,
  androidPrintLogoAndText,
} from "../utils/androidBridge";
import appLogo from "../images/logo.jpg";

/* ========= Helpers ========= */
const PAGE_SIZE = 24;
const orderStatuses = [["pending", "Active"], ["done", "Completed"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]];

function localDayKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

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
  const { show } = useToast();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [timeRangeLabel, setTimeRangeLabel] = useState("today");
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [printBusy, setPrintBusy] = useState(""); // "", "kitchen", "receipt"
  const [showSettlement, setShowSettlement] = useState(false);
  const [settlementDateRange, setSettlementDateRange] = useState({
    from: localDayKey(new Date()),
    to: localDayKey(new Date()),
  });

  const [isAdmin] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      return user?.role === "admin" || user?.isAdmin === true;
    } catch {
      return false;
    }
  });

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

  const payments = useMemo(() => [...new Set(orders.map((order) => order.paymentMethod).filter(Boolean))].sort(), [orders]);
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const today = localDayKey(now);
    const from = new Date(now);
    from.setDate(from.getDate() - (Number(timeRangeLabel) - 1));
    const fromDay = localDayKey(from);
    const term = query.trim().toLowerCase().replace(/^#/, "");
    return orders.filter((order) => {
      const status = order.status || "pending";
      if (!isAdmin && status !== "pending") return false;
      if (isAdmin && statusFilter && status !== statusFilter) return false;
      if (isAdmin && paymentFilter && order.paymentMethod !== paymentFilter) return false;
      if (isAdmin) {
        const day = localDayKey(new Date(order.createdAt));
        if (customFrom || customTo) {
          if ((customFrom && day < customFrom) || (customTo && day > customTo)) return false;
        } else if (timeRangeLabel === "today" && day !== today) return false;
        else if (timeRangeLabel && timeRangeLabel !== "today" && (day < fromDay || day > today)) return false;
      }
      return !term || [order.orderNumber, order.customerName, ...(order.products || []).map((item) => item.name)]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, isAdmin, timeRangeLabel, customFrom, customTo, query, statusFilter, paymentFilter]);

  const validOrders = filteredOrders.filter((order) => !["cancelled", "refunded"].includes(order.status) && order.paymentMethod !== "Open Bill");
  const sum = (key) => validOrders.reduce((total, order) => total + (Number(order[key]) || 0), 0);
  const totalRevenue = sum("totalAmount");
  const totalTransactions = validOrders.length;

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
    setPaymentFilter("");
    setTimeRangeLabel("today");
    setCustomFrom("");
    setCustomTo("");
    setLimit(PAGE_SIZE);
  }

  // Settlement calculations
  const settlementOrders = useMemo(() => {
    if (!showSettlement) return [];
    const from = new Date(`${settlementDateRange.from}T00:00:00`);
    from.setHours(0, 0, 0, 0);
    const to = new Date(`${settlementDateRange.to}T00:00:00`);
    to.setHours(23, 59, 59, 999);
    
    return orders.filter((order) => {
      const created = new Date(order.createdAt);
      return created >= from && created <= to;
    });
  }, [orders, settlementDateRange, showSettlement]);

  const settlementValidOrders = settlementOrders.filter(
    (order) => order.status !== "cancelled" && order.status !== "refunded"
  );

  const settlementSummary = useMemo(() => {
    const valid = settlementValidOrders;
    const subtotal = valid.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
    const tax = valid.reduce((sum, o) => sum + (Number(o.tax) || 0), 0);
    const service = valid.reduce((sum, o) => sum + (Number(o.serviceCharge) || 0), 0);
    const discount = valid.reduce((sum, o) => sum + (Number(o.discount) || 0), 0);
    const netRevenue = valid.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    // Payment methods breakdown
    const paymentMethods = {};
    valid.forEach((order) => {
      const method = order.paymentMethod || "Unknown";
      paymentMethods[method] = (paymentMethods[method] || 0) + (Number(order.totalAmount) || 0);
    });

    // Order types breakdown
    const orderTypes = {};
    valid.forEach((order) => {
      const type = order.orderType || "Unknown";
      orderTypes[type] = (orderTypes[type] || 0) + 1;
    });

    // Product sales breakdown - count quantities and totals per product
    const productSales = {};
    valid.forEach((order) => {
      if (order.products && Array.isArray(order.products)) {
        order.products.forEach((product) => {
          const productName = product.name || "Unknown Item";
          const quantity = Number(product.quantity) || 0;
          const price = Number(product.price) || 0;
          const lineTotal = quantity * price;

          if (!productSales[productName]) {
            productSales[productName] = {
              name: productName,
              quantity: 0,
              total: 0,
              orders: 0, // how many orders included this product
            };
          }
          productSales[productName].quantity += quantity;
          productSales[productName].total += lineTotal;
          productSales[productName].orders += 1;
        });
      }
    });

    // Convert to array and sort by quantity (descending)
    const productSalesArray = Object.values(productSales).sort(
      (a, b) => b.quantity - a.quantity
    );

    return {
      totalOrders: settlementOrders.length,
      validOrders: valid.length,
      cancelledOrders: settlementOrders.filter((o) => o.status === "cancelled").length,
      refundedOrders: settlementOrders.filter((o) => o.status === "refunded").length,
      subtotal,
      tax,
      service,
      discount,
      netRevenue,
      paymentMethods,
      orderTypes,
      productSales: productSalesArray,
    };
  }, [settlementOrders, settlementValidOrders]);

  async function handlePrintSettlement() {
    try {
      setPrintBusy("settlement");
      const shopName = localStorage.getItem("biz.name") || "Boonz";
      const address = localStorage.getItem("biz.addr") || "Jl. Mekar Utama No. 61, Bandung";

      const settlementText = buildSettlementReport({
        shopName,
        address,
        dateFrom: settlementDateRange.from,
        dateTo: settlementDateRange.to,
        orders: settlementValidOrders,
        summary: settlementSummary,
      });

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) {
          show("Bluetooth is OFF.", { type: "error" });
          return;
        }
        const printers = androidListPrintersDetailed() || [];
        if (printers.length === 0) {
          show("No paired Bluetooth printers.", { type: "error" });
          return;
        }
        const printerAddr = printers[0].address || "";
        await androidPrintWithRetry(settlementText, {
          address: printerAddr,
          copies: 1,
          tries: 3,
          baseDelay: 500,
        });
        show("Settlement report printed.", { type: "success" });
      } else {
        await connectQZ();
        const printers = await listPrinters();
        if (!Array.isArray(printers) || printers.length === 0) {
          throw new Error("No printers found.");
        }
        await printRaw(printers[0], settlementText);
        show("Settlement report printed.", { type: "success" });
      }
    } catch (error) {
      console.error("Error printing settlement:", error);
      show("Failed to print settlement: " + (error?.message || "Unknown"), {
        type: "error",
      });
    } finally {
      setPrintBusy("");
    }
  }

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

      // Calculate total properly: subtotal + tax + service - discount
      const subtotal = Number(order.subtotal) || 0;
      const tax = Number(order.tax) || 0;
      const service = Number(order.serviceCharge) || 0;
      const discount = Number(order.discount) || 0;
      const calculatedTotal = Math.max(0, subtotal + tax + service - discount);
      
      const receiptText = buildReceipt({
        address: "Jl. Mekar Utama No. 61, Bandung",
        orderNumber: order.orderNumber || "N/A",
        dateStr,
        items: itemsForReceipt,
        subtotal: subtotal,
        tax: tax,
        service: service,
        showTax: taxEnabled && tax > 0,
        showService: serviceEnabled && service > 0,
        discount: discount,
        discountNote: order.discountNote || "",
        total: calculatedTotal, // Use calculated total to ensure discount is included
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
    <WorkspacePage title={isAdmin ? "Orders" : "Active orders"}
      description={isAdmin ? "Find transactions and review payment, preparation, or settlement details." : "Review orders waiting for preparation."}
      className="orders-page workspace-orders"
      actions={<><button type="button" className="workspace-button" onClick={fetchOrders} disabled={loading}><FiRefreshCw aria-hidden="true" /> Refresh</button>
        {isAdmin && <button type="button" className="workspace-button primary" onClick={() => setShowSettlement(true)} disabled={loading || Boolean(fetchErr)}><FiFileText aria-hidden="true" /> Settlement report</button>}</>}>
      <section className="workspace-section orders-controls" aria-label="Order filters">
        <div className="workspace-tools">
          <label>Find an order<input type="search" placeholder="Order #, customer, or item" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} /></label>
          {isAdmin && <>
            <label>Period<select aria-label="Period" value={timeRangeLabel} onChange={(event) => { setTimeRangeLabel(event.target.value); setCustomFrom(""); setCustomTo(""); setLimit(PAGE_SIZE); }}>
              <option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last 365 days</option><option value="">All time</option>
            </select></label>
            <label>Status<select aria-label="Status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setLimit(PAGE_SIZE); }}>
              <option value="">Any status</option>{orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Payment method<select aria-label="Payment method" value={paymentFilter} onChange={(event) => { setPaymentFilter(event.target.value); setLimit(PAGE_SIZE); }}>
              <option value="">Any payment method</option>{payments.map((method) => <option key={method}>{method}</option>)}
            </select></label>
          </>}
          <button type="button" className="workspace-button" onClick={clearFilters}>Reset filters</button>
        </div>
        {isAdmin && <details className="orders-detail-panel">
          <summary>Custom date range{(customFrom || customTo) && " · applied"}</summary>
          <div className="workspace-tools">
            <label>From<input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => { setCustomFrom(event.target.value); setLimit(PAGE_SIZE); }} /></label>
            <label>To<input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setLimit(PAGE_SIZE); }} /></label>
          </div>
        </details>}
      </section>
      {isAdmin && !loading && !fetchErr && <>
        <WorkspaceMetrics label="Filtered order totals" items={[
          ["Recorded sales", fmtRp(totalRevenue)], ["Valid orders", totalTransactions],
          ["Average order", fmtRp(totalTransactions ? totalRevenue / totalTransactions : 0)],
          ["Cancelled or refunded", filteredOrders.filter((order) => ["cancelled", "refunded"].includes(order.status)).length],
        ]} />
        <details className="workspace-section orders-detail-panel">
          <summary>Sales breakdown</summary>
          <dl className="order-financial-details">
            {[["Subtotal", "subtotal"], ["Tax", "tax"], ["Service charge", "serviceCharge"], ["Discounts", "discount"]].map(([label, key]) =>
              <div key={key}><dt>{label}</dt><dd>{fmtRp(sum(key))}</dd></div>)}
          </dl>
        </details>
      </>}
      {!loading && !fetchErr && <p className="workspace-muted" role="status">{filteredOrders.length} {filteredOrders.length === 1 ? "matching order" : "matching orders"}</p>}

      {/* Error */}
      {fetchErr && <div className="orders-error" role="alert">
        <p>{fetchErr}</p><button type="button" className="btn" onClick={fetchOrders}>Try again</button>
      </div>}

      {/* List */}
      <div className="orders-list">
        {loading ? (
          <SkeletonOrdersList count={6} />
        ) : fetchErr ? null : filteredOrders.length === 0 ? (
          <div className="orders-empty">
            <div className="empty-art">📦</div>
            <h3>{isAdmin ? "No orders for this range" : "No active orders"}</h3>
            {isAdmin && <p>Try expanding the time range.</p>}
          </div>
        ) : (
          filteredOrders.slice(0, limit).map((order) => {
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
                      {orderStatuses.find(([value]) => value === status)?.[1] || status}
                    </span>
                  </div>
                  <div className="order-meta">
                    {isAdmin && <>
                    {order.customerName && <span>{order.customerName}</span>}
                    <span>
                      Subtotal: {fmtRp(order.subtotal || 0)}
                    </span>
                    {Number(order.tax) > 0 && (
                      <span>Tax: {fmtRp(order.tax || 0)}</span>
                    )}
                    {Number(order.serviceCharge) > 0 && (
                      <span>Service: {fmtRp(order.serviceCharge || 0)}</span>
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
                    <span style={{ fontWeight: 700, color: "#059669" }}>
                      Total: {fmtRp(order.totalAmount || 0)}
                    </span>
                    </>}
                    <span>
                      Created: {new Date(order.createdAt).toLocaleString()}
                    </span>
                    {order.orderType && <span>Type: {order.orderType}</span>}
                    {isAdmin && order.paymentMethod && (
                      <span>Payment: {order.paymentMethod}</span>
                    )}
                  </div>
                </div>

                <details className="products-wrap" open={!isAdmin || status === "pending"}>
                  <summary className="products-heading">{order.products?.length || 0} order lines</summary>
                  {order.products?.length ? (
                    <div className="products-list">
                      {order.products.map((product, index) => (
                        <div key={index} className="product-item">
                          <div className="pi-left">
                            <div className="product-name">{product.name}</div>
                            <div className="product-sub">
                              Qty: {product.quantity}
                            </div>
                            {product.note && <div className="product-sub">{product.note}</div>}
                          </div>
                          {isAdmin && <div className="pi-right">{fmtRp(product.price)}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No products found in this order.</p>
                  )}
                </details>

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

                  {status === "pending" && (
                    <button className="btn primary" onClick={() => handleReprintKitchen(order)} disabled={!!printBusy}>
                      {printBusy === "kitchen" ? "Printing…" : "Print kitchen ticket"}
                    </button>
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

      {filteredOrders.length > limit && <button type="button" className="workspace-button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Show more orders</button>}

      {/* Settlement Modal */}
      {showSettlement && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettlement(false)}
        >
          <div
            className="paymodal__dialog"
            style={{ maxWidth: "900px", width: "95%" }}
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3>Settlement Report</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={() => setShowSettlement(false)}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                  Date Range
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="date"
                    value={settlementDateRange.from}
                    onChange={(e) =>
                      setSettlementDateRange({
                        ...settlementDateRange,
                        from: e.target.value,
                      })
                    }
                    style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={settlementDateRange.to}
                    onChange={(e) =>
                      setSettlementDateRange({
                        ...settlementDateRange,
                        to: e.target.value,
                      })
                    }
                    style={{ padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                </div>
              </div>

              {/* Summary */}
              <div
                style={{
                  background: "#f9fafb",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 20,
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>Summary</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  <div>
                    <strong>Total Orders:</strong> {settlementSummary.totalOrders}
                  </div>
                  <div>
                    <strong>Valid Orders:</strong> {settlementSummary.validOrders}
                  </div>
                  {settlementSummary.cancelledOrders > 0 && (
                    <div style={{ color: "#b71c1c" }}>
                      <strong>Cancelled:</strong> {settlementSummary.cancelledOrders}
                    </div>
                  )}
                  {settlementSummary.refundedOrders > 0 && (
                    <div style={{ color: "#f57c00" }}>
                      <strong>Refunded:</strong> {settlementSummary.refundedOrders}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              <div
                style={{
                  background: "#f0fdf4",
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 20,
                  border: "2px solid #22c55e",
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>Financial Summary</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal:</span>
                    <strong>{fmtRp(settlementSummary.subtotal)}</strong>
                  </div>
                  {settlementSummary.tax > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Tax:</span>
                      <strong>{fmtRp(settlementSummary.tax)}</strong>
                    </div>
                  )}
                  {settlementSummary.service > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Service Charge:</span>
                      <strong>{fmtRp(settlementSummary.service)}</strong>
                    </div>
                  )}
                  {settlementSummary.discount > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#b71c1c",
                      }}
                    >
                      <span>Total Discount:</span>
                      <strong>-{fmtRp(settlementSummary.discount)}</strong>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "2px solid #22c55e",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    <span>NET REVENUE:</span>
                    <strong style={{ color: "#059669" }}>
                      {fmtRp(settlementSummary.netRevenue)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Payment Methods */}
              {Object.keys(settlementSummary.paymentMethods || {}).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4>Payment Methods Breakdown</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(settlementSummary.paymentMethods).map(([method, amount]) => (
                      <div
                        key={method}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: 8,
                          background: "#fff",
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <span>{method}:</span>
                        <strong>{fmtRp(amount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Types */}
              {Object.keys(settlementSummary.orderTypes || {}).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4>Order Types Breakdown</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(settlementSummary.orderTypes).map(([type, count]) => (
                      <div
                        key={type}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: 8,
                          background: "#fff",
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <span>{type}:</span>
                        <strong>{count} orders</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Sales Breakdown */}
              {settlementSummary.productSales && settlementSummary.productSales.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4>Product Sales Breakdown</h4>
                  <div
                    style={{
                      maxHeight: "400px",
                      overflowY: "auto",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 14,
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                          <th style={{ textAlign: "left", padding: 8, fontWeight: 700 }}>
                            Product
                          </th>
                          <th style={{ textAlign: "center", padding: 8, fontWeight: 700 }}>
                            Qty
                          </th>
                          <th style={{ textAlign: "center", padding: 8, fontWeight: 700 }}>
                            Orders
                          </th>
                          <th style={{ textAlign: "right", padding: 8, fontWeight: 700 }}>
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlementSummary.productSales.map((product, index) => (
                          <tr
                            key={index}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              background: index % 2 === 0 ? "#fff" : "#f9fafb",
                            }}
                          >
                            <td style={{ padding: 8, fontWeight: 600 }}>{product.name}</td>
                            <td style={{ textAlign: "center", padding: 8 }}>
                              {product.quantity}
                            </td>
                            <td style={{ textAlign: "center", padding: 8 }}>
                              {product.orders || 1}
                            </td>
                            <td style={{ textAlign: "right", padding: 8, fontWeight: 600 }}>
                              {fmtRp(product.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                          <td style={{ padding: 8 }}>TOTAL</td>
                          <td style={{ textAlign: "center", padding: 8 }}>
                            {settlementSummary.productSales.reduce(
                              (sum, p) => sum + (p.quantity || 0),
                              0
                            )}
                          </td>
                          <td style={{ textAlign: "center", padding: 8 }}>
                            {settlementSummary.validOrders}
                          </td>
                          <td style={{ textAlign: "right", padding: 8, color: "#059669" }}>
                            {fmtRp(
                              settlementSummary.productSales.reduce(
                                (sum, p) => sum + (p.total || 0),
                                0
                              )
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Orders List */}
              <div>
                <h4>Orders ({settlementValidOrders.length})</h4>
                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  {settlementValidOrders.length === 0 ? (
                    <p style={{ textAlign: "center", color: "#6b7280" }}>No orders in this range</p>
                  ) : (
                    settlementValidOrders.map((order, index) => (
                      <div
                        key={order._id}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          background: "#fff",
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <strong>#{index + 1}. Order #{order.orderNumber}</strong>
                          <strong style={{ color: "#059669" }}>{fmtRp(order.totalAmount)}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          {new Date(order.createdAt).toLocaleString()}
                          {order.customerName && ` • ${order.customerName}`}
                          {order.orderType && ` • ${order.orderType}`}
                          {order.paymentMethod && ` • ${order.paymentMethod}`}
                        </div>
                        {order.products && order.products.length > 0 && (
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            {order.products.length} item(s)
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={handlePrintSettlement}
                disabled={printBusy === "settlement" || settlementValidOrders.length === 0}
              >
                {printBusy === "settlement" ? "Printing…" : "Print Settlement"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowSettlement(false)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
