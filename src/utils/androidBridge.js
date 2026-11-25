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
  const raw = typeof b.listPrintersDetailed === "function" ? b.listPrintersDetailed()
    : typeof b.listPrinters === "function" ? b.listPrinters()
    : typeof b.listBluetoothPrinters === "function" ? b.listBluetoothPrinters()
    : null;
  if (raw === null) throw new Error("Printer discovery is unavailable. Open the updated Boonz Android app.");
  const error = androidGetLastError();
  if (error) throw new Error(error);
  const data = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  const items = Array.isArray(data) ? data : data?.printers;
  if (!Array.isArray(items)) return [];

  const seen = new Set();
  return items.flatMap((item) => {
    const name = String(typeof item === "string" ? item : item?.name || "").trim();
    const address = String(item?.address || "").trim();
    const key = address.toUpperCase() || name;
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ name, address }];
  });
}

// Resolve saved addresses, old name-only values, and labels from older installs.
export function androidPrinterTarget(preference, role) {
  const printers = androidListPrintersDetailed();
  if (!printers.length) {
    throw new Error("Pair your printer in Android Bluetooth settings first.");
  }
  const saved = String(preference || "").trim();
  const target = (saved.match(/\(([^)]+)\)\s*$/)?.[1] || saved).toLowerCase();
  const matches = target
    ? printers.filter(({ address, name }) => [address, name].some((value) => value.toLowerCase() === target))
    : printers;
  if (matches.length !== 1) {
    throw new Error(`Select and save your ${role} printer in Boonz Settings.`);
  }
  const { address, name } = matches[0];
  return { address, nameLike: name };
}

// --- Core text print (best-effort target: address → nameLike → default) ---
export function androidPrintFormatted(
  text,
  { address = "", nameLike = "" } = {}
) {
  const b = AP();
  const payload = String(text || "");

  let sent;
  if (address && typeof b.printToAddress === "function") {
    sent = b.printToAddress(String(address), payload);
  } else if (typeof b.printTo === "function") {
    sent = b.printTo(JSON.stringify({ nameLike: String(nameLike || address || ""), text: payload }));
  } else if (!address && !nameLike && typeof b.printText === "function") {
    sent = b.printText(payload);
  } else if (!address && !nameLike && typeof b.printFormatted === "function") {
    sent = b.printFormatted(payload);
  } else {
    throw new Error("Printer routing is unavailable. Open the updated Boonz Android app.");
  }
  if (sent === false) throw new Error(androidGetLastError() || "The Android printer could not print this ticket.");
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
      return { logo: true, text: true };
    }

    // 2) Single-call by NAME LIKE
    if (typeof b.printLogoAndText === "function") {
      b.printLogoAndText(logo, payload, String(nameLike || ""));
      // Same uncertainty—assume only logo is guaranteed.
      return { logo: true, text: true };
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
