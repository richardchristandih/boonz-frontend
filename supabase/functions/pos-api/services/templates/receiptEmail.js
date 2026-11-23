// services/templates/receiptEmail.js

const IDR_DECIMALS = true; // set to false if you prefer Rp29.000 (no decimals)

// Locale-aware Rupiah formatter: "Rp29.000,00" (removes the thin space some clients insert)
function formatRp(n, { withDecimals = IDR_DECIMALS } = {}) {
  const num = Number(n ?? 0);
  const s = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(num);
  // Many engines insert a non-breaking space after "Rp". Compact to your preferred "Rp29.000,00"
  return s.replace(/\s+/g, "");
}

// very small HTML escape for user-entered content like notes
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const renderReceiptEmail = function renderReceiptEmail(order, opts = {}) {
  const {
    logoUrl = "",
    address = "Jl. Mekar Utama No. 61, Bandung",
    title = `Receipt for Order #${order?.orderNumber || order?._id}`,
  } = opts;

  const products = Array.isArray(order?.products) ? order.products : [];
  const createdAt = order?.createdAt ? new Date(order.createdAt) : new Date();

  const rows = products
    .map((it) => {
      const qty = Number(it?.quantity ?? 0);
      const unit = Number(it?.price ?? 0);
      const lineTotal = qty * unit;
      const note = it?.note
        ? `<div class="note">Note: ${esc(it.note)}</div>`
        : "";
      return `
        <tr>
          <td>
            ${qty}× ${esc(it?.name || "")}
            <div class="muted">(${formatRp(unit, {
              withDecimals: IDR_DECIMALS,
            })} per item)</div>
            ${note}
          </td>
          <td class="tar amount">${formatRp(lineTotal, {
            withDecimals: IDR_DECIMALS,
          })}</td>
        </tr>`;
    })
    .join("");

  const discountNum = Number(order?.discount || 0);
  const discountLine =
    discountNum > 0
      ? `<tr>
           <td>Discount ${
             order?.discountNote ? `(${esc(order.discountNote)})` : ""
           }</td>
           <td class="tar amount">-${formatRp(discountNum, {
             withDecimals: IDR_DECIMALS,
           })}</td>
         </tr>`
      : "";

  const subtotal = Number(order?.subtotal || 0);
  const tax = Number(order?.tax || 0);
  const serviceCharge = Number(order?.serviceCharge || 0);
  const totalAmount = Number(order?.totalAmount || 0);

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7f9; margin:0; padding:24px; }
    .card { max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
    .head { padding:20px; text-align:center; border-bottom:1px solid #eee; }
    .head img { max-height:56px; object-fit:contain; display:block; margin:0 auto 10px; }
    .body { padding:20px; }
    table { width:100%; border-collapse:collapse; }
    td { padding:6px 0; vertical-align:top; }
    .line { border-top:1px dashed #ddd; margin:12px 0; }
    .totals td { padding:4px 0; }
    .muted { color:#6b7280; font-size:13px; }
    .bold { font-weight:700; }
    .tar { text-align:right; }
    .amount { white-space:nowrap; } /* prevent wrap like Rp29.000,00 splitting */
    .note { font-size:12px; color:#374151; font-style:italic; margin-top:2px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" />` : ""}
      <div class="muted">${esc(address)}</div>
    </div>
    <div class="body">
      <div><strong>Order #</strong> ${esc(
        order?.orderNumber || order?._id || "-"
      )}</div>
      <div><strong>Type:</strong> ${esc(order?.orderType || "-")}</div>
      <div><strong>Time:</strong> ${createdAt.toLocaleString("id-ID")}</div>
      ${
        order?.customerName
          ? `<div><strong>Customer:</strong> ${esc(order.customerName)}</div>`
          : ""
      }
      <div class="line"></div>
      <table>${rows}</table>
      <div class="line"></div>
      <table class="totals">
        <tr><td>Subtotal</td><td class="tar amount">${formatRp(subtotal, {
          withDecimals: IDR_DECIMALS,
        })}</td></tr>
        <tr><td>Tax</td><td class="tar amount">${formatRp(tax, {
          withDecimals: IDR_DECIMALS,
        })}</td></tr>
        <tr><td>Service</td><td class="tar amount">${formatRp(serviceCharge, {
          withDecimals: IDR_DECIMALS,
        })}</td></tr>
        ${discountLine}
        <tr class="bold"><td>Total</td><td class="tar amount">${formatRp(
          totalAmount,
          { withDecimals: IDR_DECIMALS }
        )}</td></tr>
        <tr><td>Payment</td><td class="tar">${esc(
          order?.paymentMethod || "-"
        )}</td></tr>
      </table>
      <div class="line"></div>
      <div class="muted">Thank you for your order!</div>
    </div>
  </div>
</body>
</html>`;
};
