// src/utils/androidBridge.js

// --- Bridge presence ---
export function isAndroidBridge() {
  return typeof window !== "undefined" && !!window.AndroidPrinter;
}
const AP = () =>
  typeof window !== "undefined" ? window.AndroidPrinter || {} : {};

// --- Bluetooth status / settings (optional helpers) ---
export function androidIsBtOn() {
  const b = AP();
  try {
    return typeof b.isBluetoothEnabled === "function"
      ? !!b.isBluetoothEnabled()
      : true; // assume on if unknown
  } catch {
    return true;
  }
}
export function androidOpenBtSettings() {
  const b = AP();
  try {
    if (typeof b.openBluetoothSettings === "function")
      b.openBluetoothSettings();
  } catch {}
}

// --- Discovery: returns [{ name, address }] ---
export function androidListPrintersDetailed() {
  const b = AP();
  try {
    const raw =
      typeof b.listPrintersDetailed === "function"
        ? b.listPrintersDetailed()
        : typeof b.listPrinters === "function"
        ? b.listPrinters()
        : [];

    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (!Array.isArray(arr)) return [];

    // Normalize, dedupe by address/name
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      const item = typeof x === "string" ? { name: x, address: "" } : { ...x };
      item.name = String(item.name || "").trim();
      item.address = String(item.address || "").trim();
      const key = item.address || `name:${item.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// --- Core text print (best-effort target: address → nameLike → default) ---
export function androidPrintFormatted(
  text,
  { address = "", nameLike = "" } = {}
) {
  const b = AP();
  const payload = String(text || "");

  // Strict MAC-address target (best if supported by your native bridge)
  if (address && typeof b.printToAddress === "function") {
    b.printToAddress(String(address), payload);
    return;
  }

  // Name-like targeting (bridge resolves internally)
  if (typeof b.printTo === "function") {
    b.printTo(
      JSON.stringify({ nameLike: String(nameLike || ""), text: payload })
    );
    return;
  }

  // Plain broadcast / default printer
  if (typeof b.printText === "function") {
    b.printText(payload);
    return;
  }

  throw new Error("Android bridge missing print methods");
}

// --- Simple retry wrapper around androidPrintFormatted ---
export async function androidPrintWithRetry(text, opts = {}) {
  const {
    address = "",
    nameLike = "",
    copies = 1,
    tries = 3,
    baseDelay = 400,
  } = opts;

  let lastErr = "";
  for (let c = 0; c < Math.max(1, copies); c++) {
    let ok = false;
    for (let t = 0; t < Math.max(1, tries) && !ok; t++) {
      try {
        androidPrintFormatted(text, { address, nameLike });
        ok = true;
      } catch (e) {
        lastErr = e?.message || String(e);
        await new Promise((r) => setTimeout(r, baseDelay * (t + 1)));
      }
    }
    if (!ok) throw new Error(lastErr || "Print failed after retries");
  }
}

// --- Optional: last error string (if your bridge keeps one) ---
export function androidGetLastError() {
  const b = AP();
  try {
    return typeof b.getLastError === "function" ? b.getLastError() : "";
  } catch {
    return "";
  }
}

/**
 * Try to print LOGO + TEXT in one go if the native bridge supports it.
 * Falls back to printing the logo first and then the text.
 *
 * @param {string} logoDataUrl - data: URL (recommended) or http(s) URL
 * @param {string} text - ESC/POS formatted text
 * @param {{address?: string, nameLike?: string}} target
 * @returns {boolean} true if we managed to send a "logo+text" sequence (either single-call or two calls), false if we couldn't send any logo at all.
 *
 * Notes:
 * - If your native bridge exposes `printLogoAndTextByAddress(dataUrl, text, address)` it will be used.
 * - Otherwise it will try `printLogoAndText(dataUrl, text, nameLike)`.
 * - Otherwise it will try `printLogoBase64(dataUrl, target)`/`printImageBase64(dataUrl, target)` and then send text via `androidPrintFormatted`.
 */
export function androidPrintLogoAndText(
  logoDataUrl,
  text,
  { address = "", nameLike = "" } = {}
) {
  const b = AP();
  const logo = String(logoDataUrl || "");
  const payload = String(text || "");

  if (!logo) return false;

  try {
    // 1) Ideal: single-call by ADDRESS (if your native supports it)
    if (address && typeof b.printLogoAndTextByAddress === "function") {
      b.printLogoAndTextByAddress(logo, payload, String(address));
      return true;
    }

    // 2) Single-call by NAME LIKE
    if (typeof b.printLogoAndText === "function") {
      b.printLogoAndText(logo, payload, String(nameLike || ""));
      return true;
    }

    // 3) Two-step: print image, then text
    const imgFn =
      (typeof b.printLogoBase64 === "function" && b.printLogoBase64) ||
      (typeof b.printImageBase64 === "function" && b.printImageBase64) ||
      null;

    if (imgFn) {
      // Some bridges accept (dataUrl, target); others just (dataUrl)
      try {
        if (imgFn.length >= 2) {
          imgFn(logo, String(address || nameLike || ""));
        } else {
          imgFn(logo);
        }
      } catch {
        // If image send fails, treat as no-logo path
        return false;
      }

      // Follow with the text via best-effort target
      try {
        androidPrintFormatted(payload, { address, nameLike });
        return true;
      } catch {
        // Image was sent, but text failed → report false so caller can decide
        return false;
      }
    }
  } catch {
    // fall through to false
  }

  // No logo-capable method available
  return false;
}
