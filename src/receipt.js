// src/receipt.js
// Minimal ESC/POS helpers (kept but we CONCAT to ONE string)
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
} // double h/w
function dblOff() {
  return GS + "!" + "\x00";
}
function init() {
  return ESC + "@";
}

/**
 * Feed n lines (ESC d n). Many printers honor this precisely.
 * @param {number} n 0-255
 */
function feed(n = 0) {
  return ESC + "d" + String.fromCharCode(Math.max(0, Math.min(255, n)));
}

/**
 * Cut the paper with minimal/controlled feed.
 * m = 0x41 (partial), 0x42 (full). We default to partial cut.
 * n = lines to feed BEFORE cut. Keep this small to avoid long gaps.
 */
function cut(n = 0, mode = "partial") {
  const m = mode === "full" ? "\x42" : "\x41"; // default partial
  const lines = String.fromCharCode(Math.max(0, Math.min(255, n)));
  return GS + "V" + m + lines;
}

function line(text = "") {
  return text + "\n";
}

// Format two columns (left/right)
function lr(left, right, width = 32) {
  const l = (left ?? "").toString();
  const r = (right ?? "").toString();
  const space = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(space) + r;
}

/**
 * Return a SINGLE string so AndroidPrinter.printText() prints cleanly.
 * Works with DantSu printFormattedText (ESC codes and plain text).
 */
export function buildReceipt({
  address,
  orderNumber,
  dateStr,
  items = [],
  subtotal = 0,
  tax = 0,
  service = 0,
  discount = 0,
  total = 0,
  payment,
  orderType,
  customer,
}) {
  const w = 32; // 58mm ~32 chars (80mm ~42)
  let out = "";

  out += init();
  out += alignCenter() + boldOn() + dblOn();
  out += dblOff() + boldOff();
  if (address) out += alignCenter() + line(address);
  out += alignCenter() + line("--------------------------------");

  out += alignLeft() + line(`Order #${orderNumber ?? "N/A"}`);
  out += alignLeft() + line(`${dateStr ?? ""}`);
  if (customer?.name) out += alignLeft() + line(`Customer: ${customer.name}`);
  if (orderType) out += alignLeft() + line(`Type: ${orderType}`);
  out += line("--------------------------------");

  for (const it of items) {
    const qty = Number(it?.quantity) || 0;
    const price = Number(it?.price) || 0;
    const lineTotal = qty * price;
    const name = it?.name || "";
    out += alignLeft() + line(name);
    out +=
      alignLeft() +
      line(
        lr(`  ${qty} x Rp.${price.toFixed(2)}`, `Rp.${lineTotal.toFixed(2)}`, w)
      );
  }

  out += line("--------------------------------");
  out += alignLeft() + line(lr("Subtotal", `Rp.${(+subtotal).toFixed(2)}`, w));
  out += alignLeft() + line(lr("Tax (10%)", `Rp.${(+tax).toFixed(2)}`, w));
  out +=
    alignLeft() + line(lr("Service (5%)", `Rp.${(+service).toFixed(2)}`, w));
  if (+discount > 0)
    out +=
      alignLeft() + line(lr("Discount", `-Rp.${(+discount).toFixed(2)}`, w));

  out += line("--------------------------------");
  out +=
    alignLeft() +
    boldOn() +
    line(lr("TOTAL", `Rp.${(+total).toFixed(2)}`, w)) +
    boldOff();
  if (payment) out += alignLeft() + line(`Payment: ${payment}`);

  // Thank you line WITHOUT an extra blank line before it
  out += line("Terima kasih!");

  // Keep tail short & consistent with kitchen ticket:
  // feed just 2 lines, then do a zero-feed partial cut.
  out += feed(2);
  out += cut(0, "partial");

  return out;
}
