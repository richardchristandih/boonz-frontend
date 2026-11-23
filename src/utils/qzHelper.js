// src/utils/qzHelper.js
import qz from "qz-tray";

import api from "../services/api";

const certificateURL = process.env.REACT_APP_QZ_CERTIFICATE_URL;
if (certificateURL) {
  qz.security.setCertificatePromise(async () => {
    const response = await fetch(certificateURL);
    if (!response.ok) throw new Error(`QZ certificate HTTP ${response.status}`);
    return response.text();
  });
  qz.security.setSignaturePromise(async (toSign) => {
    const { data } = await api.post("/qz/sign", toSign, {
      headers: { "Content-Type": "text/plain" },
      responseType: "text",
    });
    return data;
  });
}

// ---------- connection (singleton, pinned host/port) ----------
let connectPromise = null;

function friendly(err) {
  const m = String(err?.message || err || "");
  if (/ECONNREFUSED|failed to connect|close 1006|Unable to establish/i.test(m)) {
    return "QZ Tray is not reachable. Make sure the QZ Tray app is running and allow this site when prompted.";
  }
  return m || "Unknown error";
}

/** Try secure 8182 once; if it fails, try non-secure 8181 once. */
async function doConnectOnce() {
  if (qz.websocket.isActive()) return;

  try {
    await qz.websocket.connect({
      host: "localhost",
      port: 8182,
      secure: true,   // pin to wss
      retries: 0,
      delay: 0
    });
    return;
  } catch (e) {
    // fallback to ws://8181 for setups that don't use WSS
    await qz.websocket.connect({
      host: "localhost",
      port: 8181,
      secure: false,
      retries: 0,
      delay: 0
    });
  }
}

export async function printImageAndRaw(printerName, logoDataUrl, rawText) {
  const qz = window.qz;
  if (!qz || !qz.print) throw new Error("QZ not available");

  const cfg = qz.configs.create(printerName, {
    // You can add ESC/POS options here if needed
  });

  const data = [];
  if (logoDataUrl) {
    data.push({
      type: "image",
      data: logoDataUrl,            // "data:image/png;base64,...."
      options: { scale: 0.6 }       // scale down for 58/80mm receipts
    });
  }
  if (rawText) {
    data.push({ type: "raw", format: "plain", data: rawText });
  }

  return qz.print(cfg, data);
}

export async function connectQZ() {
  if (qz.websocket.isActive()) return;
  if (!connectPromise) {
    connectPromise = doConnectOnce().catch((e) => {
      connectPromise = null;
      throw new Error(friendly(e));
    });
  }
  return connectPromise;
}

export async function listPrinters() {
  await connectQZ();
  return qz.printers.find();
}

export function createConfig(printerName, opts = {}) {
  return qz.configs.create(printerName, {
    copies: opts.copies || 1,
    encoding: "UTF-8"
  });
}

// Replace your existing printRaw with this dual-format version
export async function printRaw(printerName, data) {
  await connectQZ();

  if (!printerName) throw new Error("No printer selected.");

  // --- Build the most compatible payload: array of strings ---
  const strings = Array.isArray(data)
    ? data.flat().map((x) => (x ?? "").toString())
    : [(data ?? "").toString()];

  if (strings.length === 0 || strings.every((s) => s.length === 0)) {
    throw new Error("No data to print.");
  }

  const cfg = createConfig(printerName);

  // Try plain strings first (works across QZ 2.0–2.2)
  try {
    return await qz.print(cfg, strings);
  } catch (e1) {
    // Fallback: explicit raw objects (older/newer variants sometimes need this)
    console.warn("String payload failed, retrying as explicit raw objects", e1);
    const objects = strings.map((s) => ({ type: "raw", format: "plain", data: s }));
    return await qz.print(cfg, objects);
  }
}

// Simple test print (uses printRaw above)
export async function testPrint(printerName) {
  const cmds = [
    "\x1B@",          // init
    "\x1Ba\x01",      // center
    "=== TEST PRINT ===\n",
    "Hello from QZ Tray!\n",
    "\n\n",
    "\x1DV\x41\x10"   // partial cut
  ];
  return printRaw(printerName, cmds);
}
