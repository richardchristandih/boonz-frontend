// src/kitchenReceipt.js

/**
 * Normalize a free-text note to be safe for receipts.
 */
function normalizeNote(raw, max = 140) {
  const s = (raw || "")
    .replace(/[\r\n\t]+/g, " ") // strip control chars
    .replace(/\s{2,}/g, " ") // collapse spaces
    .trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function buildKitchenTicket({
  orderNumber,
  dateStr,
  orderType,
  items = [],
  customer, // { name?: string }
  headerTitle = "KITCHEN ORDER", // customize header
  dividerChar = "-", // character used for separators
  dividerWidth = 30, // approximate chars per line
  showCustomer = true, // include "Cust : ..."
  includeNotes = true, // print item notes if present
} = {}) {
  const divider = dividerChar.repeat(dividerWidth);

  const header =
    `[C]<b><font size='big'>${headerTitle}</font></b>\n` +
    `[C]${divider}\n` +
    `[L]Order #${orderNumber ?? "N/A"}\n` +
    (orderType ? `[L]Type : ${orderType}\n` : "") +
    (dateStr ? `[L]Time : ${dateStr}\n` : "") +
    (showCustomer && customer?.name ? `[L]Cust : ${customer.name}\n` : "") +
    `[C]${divider}\n`;

  // Ensure items array is valid
  const validItems = Array.isArray(items) ? items.filter(it => it && (Number(it?.quantity) || 0) > 0) : [];
  
  const lines = validItems.length > 0
    ? validItems
        .map((it) => {
          const qty = Number(it?.quantity || 0);
          const name = String(it?.name || "Item").trim();

          // Skip if invalid
          if (qty <= 0 || !name) return "";

          // Bold product line - ensure it's always printed
          let block = `[L]<b>${qty} x ${name}</b>\n`;

          if (includeNotes) {
            // Standard free-text note (already on your cart items)
            const baseNote = normalizeNote(it?.note);

            // Optional structured options (sugar/ice/toppings) if you stored them
            const opt = it?.options || {};
            const sugar = opt?.sugar ? `Sugar: ${opt.sugar}` : "";
            const ice = opt?.ice ? `Ice: ${opt.ice}` : "";
            const temperature = opt?.temperature ? `Temp: ${opt.temperature}` : "";
            const flavor = opt?.flavor ? `Flavor: ${opt.flavor}` : "";
            const cut = opt?.cut ? `Cut: ${opt.cut}` : "";
            const toppingsArr = Array.isArray(opt?.toppings) ? opt.toppings : [];
            const toppings =
              toppingsArr.length > 0 ? `Toppings: ${toppingsArr.join(", ")}` : "";

            // Combine nicely if present
            const optionNote = [temperature, sugar, ice, flavor, cut, toppings]
              .filter(Boolean)
              .join(" | ");

            const finalNote = [baseNote, optionNote]
              .filter(Boolean)
              .map((x) => normalizeNote(x))
              .join(" | ");

            if (finalNote) block += `[L]   - ${finalNote}\n`;
          }

          return block;
        })
        .filter(Boolean) // Remove empty strings
        .join("")
    : `[L]No items in order\n`; // Fallback message if no items

  const tail = `\n[C]${divider}\n[C]\n\n\n`;

  return header + lines + tail;
}

export default buildKitchenTicket;
