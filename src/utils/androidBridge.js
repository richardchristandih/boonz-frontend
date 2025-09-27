// src/utils/androidBridge.js
export function isAndroidBridge() {
  return typeof window !== "undefined" && !!window.AndroidPrinter;
}
const AP = () =>
  typeof window !== "undefined" ? window.AndroidPrinter || {} : {};

// Detailed list: [{ name, address }]
export function androidListPrintersDetailed() {
  const b = AP();
  try {
    const raw =
      typeof b.listPrintersDetailed === "function"
        ? b.listPrintersDetailed()
        : b.listPrinters?.();
    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (Array.isArray(arr)) {
      return arr.map((x) =>
        typeof x === "string" ? { name: x, address: "" } : x
      );
    }
  } catch {}
  return [];
}

// Best-effort print: prefer address → nameLike → first paired
export function androidPrintFormatted(
  text,
  { address = "", nameLike = "" } = {}
) {
  const b = AP();
  const payload = String(text);
  if (address && typeof b.printToAddress === "function") {
    b.printToAddress(String(address), payload);
    return;
  }
  if (typeof b.printTo === "function") {
    b.printTo(
      JSON.stringify({ nameLike: String(nameLike || ""), text: payload })
    );
    return;
  }
  if (typeof b.printText === "function") {
    b.printText(payload);
    return;
  }
  throw new Error("Android bridge missing print methods");
}

// Simple retry wrapper (sync bridge calls, backoff)
export async function androidPrintWithRetry(text, opts = {}) {
  const {
    address = "",
    nameLike = "",
    copies = 1,
    tries = 3,
    baseDelay = 400,
  } = opts;
  let lastErr = "";
  for (let c = 0; c < copies; c++) {
    let ok = false;
    for (let t = 0; t < tries && !ok; t++) {
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

// Optional helpers
export function androidGetLastError() {
  const b = AP();
  try {
    return typeof b.getLastError === "function" ? b.getLastError() : "";
  } catch {
    return "";
  }
}
export function androidIsBtOn() {
  const b = AP();
  try {
    return typeof b.isBluetoothEnabled === "function"
      ? !!b.isBluetoothEnabled()
      : true;
  } catch {
    return true;
  }
}
