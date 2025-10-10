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
    postDelay = 800, // delay between copies to let printer finish
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

    // 💤 Optional: give printer breathing time between copies
    if (c < copies - 1 && postDelay > 0) {
      await new Promise((r) => setTimeout(r, postDelay));
    }
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
 * Try to print LOGO + TEXT.
 *
 * Strategy:
 * 1) If native exposes single-call combos, use them but **assume only logo is guaranteed**.
 * 2) Otherwise, try two-step: image first, then text via androidPrintFormatted.
 * 3) If no image method exists, return {logo:false, text:false}.
 *
 * @param {string} logoDataUrl - data: URL (recommended) or http(s) URL
 * @param {string} text - ESC/POS formatted text (add a couple of \n at end for paper feed)
 * @param {{address?: string, nameLike?: string}} target
 * @returns {{logo: boolean, text: boolean}}
 *
 * Notes:
 * - If your native bridge exposes `printLogoAndTextByAddress(dataUrl, text, address)` it will be used
 *   but we still return {logo:true, text:false} conservatively (caller should send text if needed).
 * - Likewise for `printLogoAndText(dataUrl, text, nameLike)`.
 * - For two-step paths using `printLogoBase64` / `printImageBase64`, we explicitly send the text and
 *   return {logo:true, text:true} if both calls succeed.
 */
export async function androidPrintLogoAndText(
  logoDataUrl,
  text,
  { address = "", nameLike = "" } = {}
) {
  const b = AP();
  const logo = String(logoDataUrl || "");
  const payload = String(text || "");

  if (!logo) return { logo: false, text: false };

  try {
    // 1) Ideal: single-call by ADDRESS (if native supports it)
    if (address && typeof b.printLogoAndTextByAddress === "function") {
      b.printLogoAndTextByAddress(logo, payload, String(address));
      // Some bridges ignore the text param; we can't know. Be conservative:
      return { logo: true, text: false };
    }

    // 2) Single-call by NAME LIKE
    if (typeof b.printLogoAndText === "function") {
      b.printLogoAndText(logo, payload, String(nameLike || ""));
      // Same uncertainty—assume only logo is guaranteed.
      return { logo: true, text: false };
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
        return { logo: false, text: false };
      }

      // Follow with the text via best-effort target
      try {
        androidPrintFormatted(payload, { address, nameLike });
        return { logo: true, text: true };
      } catch {
        // Image was sent, but text failed → let caller decide how to recover
        return { logo: true, text: false };
      }
    }
  } catch {
    // fall through
  }

  // No logo-capable method available
  return { logo: false, text: false };
}
