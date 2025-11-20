// src/utils/settlement.js
// Settlement report builder for ESC/POS printers

const ESC = "\x1B";
const GS = "\x1D";

function alignLeft() {
  return ESC + "a" + "\x00";
}
function alignCenter() {
  return ESC + "a" + "\x01";
}
function alignRight() {
  return ESC + "a" + "\x02";
}
function boldOn() {
  return ESC + "E" + "\x01";
}
function boldOff() {
  return ESC + "E" + "\x00";
}
function dblOn() {
  return GS + "!" + "\x11";
}
function dblOff() {
  return GS + "!" + "\x00";
}
function init() {
  return ESC + "@";
}
function feed(n = 0) {
  return ESC + "d" + String.fromCharCode(Math.max(0, Math.min(255, n)));
}
function cut(n = 0, mode = "partial") {
  const m = mode === "full" ? "\x42" : "\x41";
  const lines = String.fromCharCode(Math.max(0, Math.min(255, n)));
  return GS + "V" + m + lines;
}
function line(text = "") {
  return text + "\n";
}
function lr(left, right, width = 32) {
  const l = (left ?? "").toString();
  const r = (right ?? "").toString();
  const space = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(space) + r;
}

export function buildSettlementReport({
  shopName = "Boonz",
  address = "Jl. Mekar Utama No. 61, Bandung",
  dateFrom,
  dateTo,
  orders = [],
  summary = {},
}) {
  const w = 32;
  let out = "";

  out += init();
  out += alignCenter() + boldOn() + dblOn();
  out += line("SETTLEMENT REPORT");
  out += dblOff() + boldOff();
  out += alignCenter() + line(shopName);
  if (address) out += alignCenter() + line(address);
  out += alignCenter() + line("=================================");

  // Date range
  out += alignLeft() + line(`Period: ${dateFrom} to ${dateTo}`);
  out += alignLeft() + line(`Generated: ${new Date().toLocaleString()}`);
  out += alignCenter() + line("=================================");
  out += feed(1);

  // Summary section
  out += alignLeft() + boldOn() + line("SUMMARY") + boldOff();
  out += alignLeft() + line(lr("Total Orders", String(summary.totalOrders || 0), w));
  out += alignLeft() + line(lr("Valid Orders", String(summary.validOrders || 0), w));
  if (summary.cancelledOrders > 0) {
    out += alignLeft() + line(lr("Cancelled", String(summary.cancelledOrders), w));
  }
  if (summary.refundedOrders > 0) {
    out += alignLeft() + line(lr("Refunded", String(summary.refundedOrders), w));
  }
  out += feed(1);

  // Financial summary
  out += alignLeft() + boldOn() + line("FINANCIAL SUMMARY") + boldOff();
  out += alignLeft() + line(lr("Subtotal", `Rp.${(summary.subtotal || 0).toFixed(2)}`, w));
  if (summary.tax > 0) {
    out += alignLeft() + line(lr("Tax", `Rp.${(summary.tax || 0).toFixed(2)}`, w));
  }
  if (summary.service > 0) {
    out += alignLeft() + line(lr("Service Charge", `Rp.${(summary.service || 0).toFixed(2)}`, w));
  }
  if (summary.discount > 0) {
    out += alignLeft() + line(lr("Total Discount", `-Rp.${(summary.discount || 0).toFixed(2)}`, w));
  }
  out += alignLeft() + boldOn() + line(lr("NET REVENUE", `Rp.${(summary.netRevenue || 0).toFixed(2)}`, w)) + boldOff();
  out += feed(1);

  // Payment methods breakdown
  if (summary.paymentMethods && Object.keys(summary.paymentMethods).length > 0) {
    out += alignLeft() + boldOn() + line("PAYMENT METHODS") + boldOff();
    Object.entries(summary.paymentMethods).forEach(([method, amount]) => {
      out += alignLeft() + line(lr(method, `Rp.${Number(amount).toFixed(2)}`, w));
    });
    out += feed(1);
  }

  // Order types breakdown
  if (summary.orderTypes && Object.keys(summary.orderTypes).length > 0) {
    out += alignLeft() + boldOn() + line("ORDER TYPES") + boldOff();
    Object.entries(summary.orderTypes).forEach(([type, count]) => {
      out += alignLeft() + line(lr(type, String(count), w));
    });
    out += feed(1);
  }

  // Detailed orders list
  if (orders.length > 0) {
    out += alignLeft() + boldOn() + line("DETAILED ORDERS") + boldOff();
    out += alignCenter() + line("---------------------------------");

    orders.forEach((order, index) => {
      out += alignLeft() + line(`${index + 1}. Order #${order.orderNumber || "N/A"}`);
      out += alignLeft() + line(`   Date: ${new Date(order.createdAt).toLocaleString()}`);
      if (order.customerName) {
        out += alignLeft() + line(`   Customer: ${order.customerName}`);
      }
      if (order.orderType) {
        out += alignLeft() + line(`   Type: ${order.orderType}`);
      }
      if (order.paymentMethod) {
        out += alignLeft() + line(`   Payment: ${order.paymentMethod}`);
      }

      // Products
      if (order.products && order.products.length > 0) {
        order.products.forEach((product) => {
          const qty = Number(product.quantity) || 0;
          const price = Number(product.price) || 0;
          const lineTotal = qty * price;
          out += alignLeft() + line(`   ${qty}x ${product.name || "Item"}`);
          out += alignLeft() + line(`     ${lr("", `Rp.${lineTotal.toFixed(2)}`, w - 3)}`);
        });
      }

      // Order totals
      out += alignLeft() + line(`   Subtotal: Rp.${(order.subtotal || 0).toFixed(2)}`);
      if (Number(order.tax) > 0) {
        out += alignLeft() + line(`   Tax: Rp.${(order.tax || 0).toFixed(2)}`);
      }
      if (Number(order.serviceCharge) > 0) {
        out += alignLeft() + line(`   Service: Rp.${(order.serviceCharge || 0).toFixed(2)}`);
      }
      if (Number(order.discount) > 0) {
        out += alignLeft() + line(`   Discount: -Rp.${(order.discount || 0).toFixed(2)}`);
      }
      out += alignLeft() + boldOn() + line(`   TOTAL: Rp.${(order.totalAmount || 0).toFixed(2)}`) + boldOff();
      out += alignLeft() + line(`   Status: ${(order.status || "pending").toUpperCase()}`);
      out += alignCenter() + line("---------------------------------");
    });
  }

  out += feed(1);
  out += alignCenter() + boldOn() + line("END OF REPORT") + boldOff();
  out += feed(2);
  out += cut(0, "partial");

  return out;
}

