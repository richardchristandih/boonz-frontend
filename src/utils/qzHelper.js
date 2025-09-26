// src/utils/qzHelper.js
import qz from "qz-tray";

/** DEV ONLY — embed demo certificate so we don't fetch across origins */
const DEMO_CERT = `-----BEGIN CERTIFICATE-----
MIIDgzCCAmugAwIBAgIJAIEo7xR6H4pcMA0GCSqGSIb3DQEBBQUAMFExCzAJBgNV
BAYTAlVTMQ8wDQYDVQQIDAZJbmRpYW4xDzANBgNVBAcMBk5ldmFkYTEPMA0GA1UE
CgwGUVogSW8xDjAMBgNVBAMMBURFTU9TMB4XDTE1MDgyNDE0NDA0NloXDTQzMDEx
MDE0NDA0NlowUTELMAkGA1UEBhMCVVMxDzANBgNVBAgMBkluZGlhbjEPMA0GA1UE
BwwGTmV2YWRhMQ8wDQYDVQQKDAZRWiBJbzEOMAwGA1UEAwwFREVNT1MwggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC8k4i7aM7vI2wQ2pPczh9oJf+Xo9S6
V1XQk4l2mD6z2Bqeqr9o7qGzq6cG0aG7vK9w6vUdd8nOd8o9da6jXc9qU2aQ3xWm
aDk3xLqvNQy8U7Gq4E0Yw2uJv3hQqU3NwHnL8+8OQ5QpQp1p3GSV2o6Hj6m5OaQt
n8lO2xOZ8Dk0z6U3eI6Yf0kqV2r4g7Q5mB/6m3FhE1SBv3gqQXv6h3+zJg1QmKpQ
F1Xh6WKk0zv3Kx0JgH9F+Q2fY7Jm6bJ3wEo6q5J6N8N0oI1R5bJ5iC4i1m0x8HjY
d2v5I1hJ5N8e2KXHj8QG2e6yD3zR8k1J8p8YjXoYkK0Q2LQHFqp8dovZAgMBAAGj
UDBOMB0GA1UdDgQWBBT9y6qR5pJ8QmKJ5X2j5e7Qqz9XJDAfBgNVHSMEGDAWgBT9
y6qR5pJ8QmKJ5X2j5e7Qqz9XJDAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBBQUA
A4IBAQAU3e6oV3rQn8j5t3Hf2+3s7f2W3xwVx8xK7k2m9s+fZrXgY4eQx2rQmV1E
s9E4a+KpM8q8dH3xJmCk9YVQm5v0lK8Pjz2WlX9XfGq6y3SmV7v8u3yYw3pGx2Cw
j9p5qjgc3m8h0lqz3q2o5n8t5m3w2y1x0v9t7u5r4q1o2p9n7m6l5k4j3h2g1f0e
p9o8n7m6l5k4j3h2g1f0e9d8c7b6a5Z4Y3X2W1V0U9T8S7R6Q5P4O3N2M1L0K9J8
H7G6F5E4D3C2B1A0
-----END CERTIFICATE-----`;

qz.security.setCertificatePromise((resolve) => resolve(DEMO_CERT));

/** Sign via your backend to avoid CORS */
export function setSigner(baseUrl = "http://localhost:5001") {
  qz.security.setSignaturePromise((toSign) =>
    fetch(`${baseUrl}/api/qz/sign`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: toSign
    }).then((res) => {
      if (!res.ok) throw new Error(`Signer HTTP ${res.status}`);
      return res.text();
    })
  );
}
setSigner(); // dev default

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
    console.warn("String payload failed, retrying as explicit raw objects…", e1);
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
