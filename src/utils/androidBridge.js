// src/utils/androidBridge.js
export function isAndroidBridge() {
  return typeof window !== 'undefined'
      && window.AndroidPrinter
      && typeof window.AndroidPrinter.printTo === 'function'
      && typeof window.AndroidPrinter.printText === 'function';
}

// raw DantSu markup -> print on first paired printer
export function androidPrintRaw(text) {
  if (!isAndroidBridge()) throw new Error('Android bridge not available');
  window.AndroidPrinter.printText(String(text));
}

// pick printer by (partial) name and print formatted text
export function androidPrintFormatted(text, nameLike = '') {
  if (!isAndroidBridge()) throw new Error('Android bridge not available');
  const payload = JSON.stringify({ nameLike, text: String(text) });
  window.AndroidPrinter.printTo(payload);
}

// (optional) for debugging in the UI
export function androidListPrinters() {
  if (!isAndroidBridge()) return [];
  try { return JSON.parse(window.AndroidPrinter.listPrinters() || '[]'); }
  catch { return []; }
}
