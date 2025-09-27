// src/utils/androidBridge.js
export function isAndroidBridge() {
  return typeof window !== "undefined" && !!window.AndroidPrinter;
}

function ap() {
  return (typeof window !== "undefined" && window.AndroidPrinter) || {};
}

/** Print raw DantSu markup on the first paired printer (Android). */
export function androidPrintRaw(text) {
  const bridge = ap();
  if (typeof bridge.printText === "function") {
    bridge.printText(String(text));
    return true;
  }
  // fallback: if only printTo exists, send with empty nameLike
  if (typeof bridge.printTo === "function") {
    bridge.printTo(JSON.stringify({ nameLike: "", text: String(text) }));
    return true;
  }
  throw new Error("Android bridge not available: printText/printTo missing");
}

/** Prefer targeting by (partial) printer name; fall back to first paired. */
export function androidPrintFormatted(text, nameLike = "") {
  const bridge = ap();
  if (typeof bridge.printTo === "function") {
    bridge.printTo(
      JSON.stringify({ nameLike: String(nameLike || ""), text: String(text) })
    );
    return true;
  }
  if (typeof bridge.printText === "function") {
    bridge.printText(String(text));
    return true;
  }
  throw new Error("Android bridge not available: printTo/printText missing");
}

/** Return array of paired Bluetooth printer names ([] if none). */
export function androidListPrinters() {
  const bridge = ap();
  if (typeof bridge.listPrinters !== "function") return [];
  try {
    const res = bridge.listPrinters();
    if (Array.isArray(res)) return res;
    if (typeof res === "string") return JSON.parse(res || "[]");
    return [];
  } catch {
    return [];
  }
}

/** Optional: set darkness/density if your native bridge implements it. */
export function androidSetDensity(level) {
  const bridge = ap();
  if (typeof bridge.setDensity === "function") {
    try {
      bridge.setDensity(Number(level) || 1);
    } catch {}
  }
}
