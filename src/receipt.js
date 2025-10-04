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
function cut() {
  return GS + "V" + "\x41" + "\x10";
} // partial cut

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

  out += line("\nTerima kasih!");
  out += cut();

  return out;
}
