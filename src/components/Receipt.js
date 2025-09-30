// src/components/Receipt.js
import React from "react";
import "./Receipt.css";
import { formatIDR } from "../utils/money"; // <-- use the shared formatter

export default function Receipt({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];

  const safeNum = (v) => Number(v ?? 0);

  const subtotal = safeNum(order?.subtotal);
  const discount = safeNum(order?.discount);
  const total = safeNum(order?.total);

  return (
    <div className="receipt-container">
      <h2>Boonz Receipt</h2>
      <p>Order #: {order?.id ?? "N/A"}</p>
      <hr />
      <ul>
        {items.map((item, idx) => {
          const qty = safeNum(item?.quantity);
          const price = safeNum(item?.price);
          const lineTotal = qty * price;
          return (
            <li key={item?.id ?? `${item?.name ?? "item"}-${idx}`}>
              {item?.name ?? "Item"} × {qty} ={" "}
              {formatIDR(lineTotal, { withDecimals: true })}
            </li>
          );
        })}
      </ul>
      <hr />
      <p>Subtotal: {formatIDR(subtotal, { withDecimals: true })}</p>
      {discount > 0 && (
        <p>Discount: -{formatIDR(discount, { withDecimals: true })}</p>
      )}
      <h3>Total: {formatIDR(total, { withDecimals: true })}</h3>
    </div>
  );
}
