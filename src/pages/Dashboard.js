import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiRefreshCw } from "react-icons/fi";
import WorkspacePage, { WorkspaceMetrics } from "../components/WorkspacePage";
import api from "../services/api";
import { formatIDR } from "../utils/money";
import "./Dashboard.css";

function inPeriod(value, period, now) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  if (period === "all") return true;
  if (date.getFullYear() !== now.getFullYear()) return false;
  if (period === "year") return true;
  if (date.getMonth() !== now.getMonth()) return false;
  return period === "month" || date.getDate() === now.getDate();
}

function summarizeOrders(orders, period) {
  const now = new Date();
  const products = new Map();
  const tenders = new Map();
  let revenue = 0;
  let orderCount = 0;
  for (const order of orders) {
    if (!inPeriod(order.createdAt, period, now)) continue;
    if (["cancelled", "refunded"].includes(order.status) || order.paymentMethod === "Open Bill") continue;
    const amount = Number(order.totalAmount) || 0;
    revenue += amount;
    orderCount += 1;
    const method = order.paymentMethod || "Unspecified";
    tenders.set(method, (tenders.get(method) || 0) + amount);
    for (const line of order.products || []) {
      const key = line.productId?._id || line.productId || line.name;
      const item = products.get(key) || { key, name: line.name || "Unnamed product", quantity: 0, total: 0 };
      const quantity = Number(line.quantity) || 0;
      item.quantity += quantity;
      item.total += quantity * (Number(line.price) || 0);
      products.set(key, item);
    }
  }
  return { revenue, orderCount, products: [...products.values()], tenders: [...tenders].sort((a, b) => b[1] - a[1]) };
}

const periods = [["today", "Today"], ["month", "This month"], ["year", "This year"], ["all", "All time"]];

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("month");
  const [sort, setSort] = useState("total");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/orders");
      if (!Array.isArray(data)) throw new Error("Unexpected orders response");
      setOrders(data);
    } catch {
      setError("Couldn’t load sales. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const summary = useMemo(() => summarizeOrders(orders, period), [orders, period]);
  const ranked = [...summary.products].sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name));
  const max = Math.max(1, ranked[0]?.[sort] || 0);
  const formatRank = (value) => sort === "total" ? formatIDR(value) : String(value);

  return (
    <WorkspacePage title="Sales dashboard" description="Track recorded sales, payment methods, and your best-selling products."
      actions={<><Link className="workspace-button" to="/orders">View orders</Link>
        <button className="workspace-button" type="button" onClick={refresh} disabled={loading}><FiRefreshCw aria-hidden="true" /> Refresh</button></>}>
      <div className="workspace-switcher" role="group" aria-label="Sales period">
        {periods.map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
      {loading ? <section className="workspace-section" role="status">Loading sales…</section> : error ? (
        <section className="workspace-section" role="alert"><p>{error}</p><button className="workspace-button" type="button" onClick={refresh}>Try again</button></section>
      ) : <>
        <WorkspaceMetrics label="Sales summary" items={[
          ["Recorded sales", formatIDR(summary.revenue)],
          ["Orders", summary.orderCount],
          ["Average order", formatIDR(summary.orderCount ? summary.revenue / summary.orderCount : 0)],
          ["Products sold", summary.products.reduce((sum, item) => sum + item.quantity, 0)],
        ]} />
        <div className="sales-insight-grid">
          <section className="workspace-section">
            <h2>Top products</h2>
            <div className="workspace-tools"><label>Rank by<select aria-label="Rank by" value={sort} onChange={(event) => setSort(event.target.value)}><option value="total">Item sales</option><option value="quantity">Quantity sold</option></select></label></div>
            {ranked.length ? <ol className="sales-ranking">
              {ranked.slice(0, 6).map((item) => <li key={item.key}>
                <span>{item.name}</span><strong>{formatRank(item[sort])}</strong>
                <span className="sales-rank-track" aria-hidden="true"><span style={{ width: `${item[sort] / max * 100}%` }} /></span>
              </li>)}
            </ol> : <p className="workspace-muted">No sales in this period.</p>}
          </section>
          <section className="workspace-section">
            <h2>Payment methods</h2>
            {summary.tenders.length ? <dl className="sales-tenders">
              {summary.tenders.map(([method, amount]) => <div key={method}><dt>{method}</dt><dd>{formatIDR(amount)}</dd></div>)}
            </dl> : <p className="workspace-muted">No recorded payments.</p>}
          </section>
        </div>
        <section className="workspace-section">
          <h2>Product performance</h2>
          <p className="workspace-muted">Item sales are before order-level discounts, tax, and service charges.</p>
          {ranked.length ? <div className="sales-table-wrap"><table className="sales-table">
            <thead><tr><th scope="col">Product</th><th scope="col">Quantity sold</th><th scope="col">Item sales</th></tr></thead>
            <tbody>{ranked.map((item) => <tr key={item.key}><th scope="row">{item.name}</th><td>{item.quantity}</td><td>{formatIDR(item.total)}</td></tr>)}</tbody>
          </table></div> : <p className="workspace-muted">No products sold in this period.</p>}
        </section>
      </>}
    </WorkspacePage>
  );
}
