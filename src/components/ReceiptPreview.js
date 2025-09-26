import React from "react";
import "./ReceiptPreview.css";

/**
 * ReceiptPreview
 * - Accepts either a raw string OR a structured data object.
 * - variant: "receipt" | "kot"
 * - roll: 58 | 80 (optional; else inferred from data.roll)
 */
export default function ReceiptPreview({ data, variant, roll }) {
  const isRawString = typeof data === "string";
  const d = isRawString ? {} : (data || {});
  const v =
    variant ||
    (isRawString ? "receipt" : d.variant || (d.kot ? "kot" : "receipt"));

  const r = Number(roll || d.roll || 58);
  const paper80 = r >= 80;

  return (
    <div className="receipt-preview">
      <div className={`receipt-paper ${paper80 ? "paper-80" : ""}`}>
        {isRawString || d.raw
          ? <RawBlock text={isRawString ? data : (d.text || "")} />
          : v === "kot"
            ? <KOT data={d} />
            : <Receipt data={d} />
        }
      </div>
    </div>
  );
}

/* ---------- RAW BLOCK (for raw PRINTER text) ---------- */
function RawBlock({ text }) {
  return (
    <pre className="receipt-raw">
      {text || "(empty)"}
    </pre>
  );
}

/* ---------- PRETTY RECEIPT (structured) ---------- */
function Center({ children, style }) {
  return <div style={{ textAlign: "center", ...style }}>{children}</div>;
}
function Row({ left, right, bold, mono }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        margin: "3px 0",
        fontWeight: bold ? 700 : 400,
        fontFamily: mono
          ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace"
          : undefined,
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
function Rule() {
  return <div className="hr" />;
}

function Receipt({ data }) {
  const {
    logo,
    shopName = "Shop",
    address,
    orderNumber = "N/A",
    dateStr,
    orderType,
    items = [],
    subtotal = 0,
    tax = 0,
    service = 0,
    discount = 0,
    total = 0,
    payment,
    customer,
  } = data;

  return (
    <>
      {logo && <img className="logo" src={logo} alt="logo" />}
      <div className="head">
        <div className="shop">{shopName}</div>
        {address && <Center className="muted">{address}</Center>}
      </div>

      <Rule />

      <div className="meta">
        <div><b>Order #{orderNumber}</b></div>
        <div>Type : {orderType || "-"}</div>
        <div>Time : {dateStr || "-"}</div>
        {customer?.name && <div>Cust : {customer.name}</div>}
      </div>

      <Rule />

      <div className="lines">
        {items.map((it, i) => {
          const qty = Number(it.quantity || 0);
          const price = Number(it.price || 0);
          const line = qty * price;
          return (
            <div className="line" key={i}>
              <div className="name">{it.name || "Item"}</div>
              <div className="sub">
                <span>{qty} x Rp.{price.toFixed(2)}</span>
                <span className="price">Rp.{line.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Rule />

      <div className="totals">
        <div><span>Subtotal</span><span className="price">Rp.{subtotal.toFixed(2)}</span></div>
        <div><span>Tax</span><span className="price">Rp.{tax.toFixed(2)}</span></div>
        <div><span>Service</span><span className="price">Rp.{service.toFixed(2)}</span></div>
        {Number(discount) > 0 && (
          <div><span>Discount</span><span className="price">- Rp.{discount.toFixed(2)}</span></div>
        )}
        <div className="grand"><span>Total</span><span className="price">Rp.{total.toFixed(2)}</span></div>
        <div className="pay muted">Payment: {payment || "-"}</div>
      </div>

      <div className="footer muted">Terima kasih!</div>
    </>
  );
}

/* ---------- KITCHEN ORDER TICKET (structured) ---------- */
function KOT({ data }) {
  const {
    shopName = "Shop",
    orderNumber = "N/A",
    dateStr,
    orderType,
    items = [],
    customer,
  } = data;

  return (
    <div className="kot">
      <div className="title">KITCHEN ORDER</div>
      <Center style={{ fontWeight: 600, marginTop: 2 }}>{shopName}</Center>

      <div className="hr" />

      <div className="meta">
        <div><b>Order #{orderNumber}</b></div>
        <div>Type : {orderType || "-"}</div>
        <div>Time : {dateStr || "-"}</div>
        {customer?.name && <div>Cust : {customer.name}</div>}
      </div>

      <div className="hr" />

      <div>
        {items.map((it, idx) => {
          const qty = Number(it.quantity || 0);
          return (
            <div key={idx} className="item">
              {qty} × {it.name || "Item"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
