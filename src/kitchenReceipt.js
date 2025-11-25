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
            let baseNote = normalizeNote(it?.note);

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

            // Remove duplicate structured option info from baseNote to prevent duplication
            // If structured options exist, remove matching parts from baseNote
            if (baseNote && Object.keys(opt).length > 0) {
              // Split baseNote by | to check each part
              const noteParts = baseNote.split('|').map(p => p.trim()).filter(Boolean);
              const cleanedParts = [];
              
              // Helper function to check if a note part matches an option value
              const matchesOption = (part, optionKey, optionValue) => {
                if (!optionValue) return false;
                const partLower = part.toLowerCase();
                const valueLower = optionValue.toLowerCase();
                const keyLower = optionKey.toLowerCase();
                
                // Exact matches
                if (partLower === `${keyLower}: ${valueLower}` || partLower === valueLower) return true;
                
                // Contains matches (handles variations like "whole cut" vs "Cut: Whole")
                if (partLower.includes(valueLower) && (partLower.includes(keyLower) || partLower.includes(valueLower + ' cut') || partLower.includes('cut ' + valueLower))) {
                  return true;
                }
                
                // Reverse order matches (e.g., "whole cut" when option is "Whole")
                if (partLower === `${valueLower} ${keyLower}` || partLower === `${valueLower} cut`) {
                  return true;
                }
                
                return false;
              };
              
              // Check each part - exclude if it matches a structured option
              for (const part of noteParts) {
                let isDuplicate = false;
                
                // Check all structured options
                if (opt?.cut && matchesOption(part, 'cut', opt.cut)) isDuplicate = true;
                if (opt?.flavor && matchesOption(part, 'flavor', opt.flavor)) isDuplicate = true;
                if (opt?.sugar && matchesOption(part, 'sugar', opt.sugar)) isDuplicate = true;
                if (opt?.ice && matchesOption(part, 'ice', opt.ice)) isDuplicate = true;
                if (opt?.temperature && matchesOption(part, 'temp', opt.temperature)) isDuplicate = true;
                
                // Check toppings
                if (toppingsArr.length > 0 && part.toLowerCase().includes('topping')) {
                  const partLower = part.toLowerCase();
                  if (toppingsArr.some(t => partLower.includes(t.toLowerCase()))) {
                    isDuplicate = true;
                  }
                }
                
                if (!isDuplicate) {
                  cleanedParts.push(part);
                }
              }
              
              baseNote = cleanedParts.length > 0 ? cleanedParts.join(' | ') : null;
            }

            // Combine nicely if present
            const optionNote = [temperature, sugar, ice, flavor, cut, toppings]
              .filter(Boolean)
              .join(" | ");

            // Combine baseNote and optionNote, but don't normalize again (already normalized)
            const finalNote = [baseNote, optionNote]
              .filter(Boolean)
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
