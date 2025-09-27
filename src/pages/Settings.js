// src/pages/Settings.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Settings.css";

import {
  isAndroidBridge,
  androidListPrintersDetailed, // [{ name, address }]
  androidPrintWithRetry, // retry wrapper (text)
  androidIsBtOn,
  androidGetLastError,
} from "../utils/androidBridge";

import { buildReceipt } from "../receipt";
import { connectQZ, listPrinters } from "../utils/qzHelper";

import ReceiptPreview from "../components/ReceiptPreview";
import appLogo from "../images/logo.jpg"; // fallback logo
import api from "../services/api";

export default function Settings() {
  const navigate = useNavigate();

  // ----- Android BT list -----
  const [androidPrinters, setAndroidPrinters] = useState([]); // [{name,address}]

  // ----- user / auth -----
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const isAdmin =
    (user?.role && String(user.role).toLowerCase() === "admin") ||
    user?.isAdmin === true;

  // ----- UI status -----
  const [bridgeMsg, setBridgeMsg] = useState("");
  const [btMsg, setBtMsg] = useState("");
  const [testMsg, setTestMsg] = useState("");

  // ----- preview modal -----
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewVariant, setPreviewVariant] = useState("receipt"); // 'receipt' | 'kot'

  // prevent body scroll + Esc to close (modal)
  useEffect(() => {
    if (!showPreview) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowPreview(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showPreview]);

  // ----- printer discovery list (desktop names) -----
  const [printerList, setPrinterList] = useState([]);

  // ----- routing prefs -----
  // On Android we store MAC address in `printer.receipt` / `printer.kitchen`.
  // On desktop we store the printer display name.
  const [receiptPrinter, setReceiptPrinter] = useState(
    localStorage.getItem("printer.receipt") || ""
  );
  const [kitchenPrinter, setKitchenPrinter] = useState(
    localStorage.getItem("printer.kitchen") || ""
  );
  const [receiptCopies, setReceiptCopies] = useState(
    Number(localStorage.getItem("printer.receiptCopies")) || 1
  );
  const [kitchenCopies, setKitchenCopies] = useState(
    Number(localStorage.getItem("printer.kitchenCopies")) || 1
  );

  function savePrinters() {
    localStorage.setItem("printer.receipt", receiptPrinter);
    localStorage.setItem("printer.kitchen", kitchenPrinter);
    localStorage.setItem("printer.receiptCopies", String(receiptCopies || 1));
    localStorage.setItem("printer.kitchenCopies", String(kitchenCopies || 1));
    alert("Printer preferences saved.");
  }

  // ----- ticket appearance -----
  const [rollWidth, setRollWidth] = useState(
    localStorage.getItem("print.roll") || "58"
  ); // "58" | "80"
  const [density, setDensity] = useState(
    Number(localStorage.getItem("print.density")) || 1
  ); // 1..5
  const [logoDataUrl, setLogoDataUrl] = useState(
    localStorage.getItem("print.logo") || ""
  );

  function savePrintPrefs() {
    localStorage.setItem("print.roll", rollWidth);
    localStorage.setItem("print.density", String(density));
    if (logoDataUrl) localStorage.setItem("print.logo", logoDataUrl);
    alert("Print appearance saved.");
  }

  async function onLogoFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => setLogoDataUrl(String(fr.result));
    fr.readAsDataURL(f);
  }

  // ----- business profile (for receipts) -----
  const [shopName, setShopName] = useState(
    localStorage.getItem("biz.name") || "Boonz"
  );
  const [shopAddr, setShopAddr] = useState(
    localStorage.getItem("biz.addr") || "Jl. Mekar Utama No. 61, Bandung"
  );
  const [footerMsg, setFooterMsg] = useState(
    localStorage.getItem("biz.footer") || "Terima kasih!"
  );

  function saveBiz() {
    localStorage.setItem("biz.name", shopName);
    localStorage.setItem("biz.addr", shopAddr);
    localStorage.setItem("biz.footer", footerMsg);
    alert("Business profile saved.");
  }

  // ----- promotions (API integrated) -----
  const [promos, setPromos] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");

  const [pName, setPName] = useState("");
  const [pType, setPType] = useState("percentage"); // "percentage" | "flat"
  const [pValue, setPValue] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pActive, setPActive] = useState(true);

  async function fetchPromos() {
    try {
      setPLoading(true);
      setPError("");
      const { data } = await api.get("/promotions");
      setPromos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load promotions."
      );
    } finally {
      setPLoading(false);
    }
  }
  useEffect(() => {
    if (isAdmin) fetchPromos();
  }, [isAdmin]);

  async function addPromo() {
    const valueNum = Number(pValue);
    if (!pName.trim()) return alert("Please enter promo name.");
    if (!(valueNum > 0)) return alert("Please enter a value greater than 0.");

    try {
      const { data } = await api.post("/promotions", {
        name: pName.trim(),
        type: pType, // "percentage" | "flat"
        value: valueNum,
        description: pDesc.trim(),
        active: !!pActive,
      });
      setPromos((prev) => [data, ...prev]);
      setPName("");
      setPValue("");
      setPDesc("");
      setPType("percentage");
      setPActive(true);
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to add promotion."
      );
    }
  }

  async function togglePromo(id, currentActive) {
    try {
      const { data } = await api.patch(`/promotions/${id}`, {
        active: !currentActive,
      });
      setPromos((prev) => prev.map((p) => (p._id === id ? data : p)));
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to toggle promotion."
      );
    }
  }

  async function deletePromo(id) {
    if (!window.confirm("Delete this promotion?")) return;
    try {
      await api.delete(`/promotions/${id}`);
      setPromos((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to delete promotion."
      );
    }
  }

  // ----- diagnostics -----
  const [bridgeCaps, setBridgeCaps] = useState(null);
  const [rawCmd, setRawCmd] = useState("[C]<b>Hello</b>\n");

  function probeBridge() {
    const ap = window.AndroidPrinter || {};
    setBridgeCaps({
      printText: !!(
        ap.printText ||
        ap.printLogoAndText ||
        ap.printImageBase64 ||
        ap.printLogoBase64
      ),
      printLogoAndText: typeof ap.printLogoAndText === "function",
      printImageBase64:
        typeof ap.printImageBase64 === "function" ||
        typeof ap.printLogoBase64 === "function",
      listPrinters:
        typeof ap.listPrinters === "function" ||
        typeof ap.listPrintersDetailed === "function",
      setDensity: typeof ap.setDensity === "function",
    });
  }

  async function sendRawTest() {
    try {
      await connectQZ();
      const printers = await listPrinters();
      const target = receiptPrinter || printers?.[0];
      if (!target) throw new Error("No printers");
      await window.qz.print(window.qz.configs.create(target), [
        { type: "raw", format: "plain", data: rawCmd },
      ]);
      alert("Raw sent!");
    } catch (e) {
      alert("Raw send failed: " + (e?.message || String(e)));
    }
  }

  // ----- helpers for previews -----
  function makeReceiptSample() {
    return {
      // shopName,
      address: shopAddr,
      orderNumber: "TEST",
      dateStr: new Date().toLocaleString(),
      items: [
        { name: "Americano", quantity: 1, price: 20000 },
        { name: "Iced Latte", quantity: 1, price: 25000 },
      ],
      subtotal: 45000,
      tax: 4500,
      service: 2250,
      discount: 0,
      total: 51750,
      payment: "N/A",
      orderType: "Test",
      customer: { name: "Test" },
      roll: Number(rollWidth) || 58,
      logo: logoDataUrl || appLogo,
      footer: footerMsg,
    };
  }

  function makeKotSample() {
    return {
      shopName,
      orderNumber: "K-TEST",
      dateStr: new Date().toLocaleString(),
      orderType: "Dine in",
      customer: { name: "Andi" },
      items: [
        { name: "Americano", quantity: 1 },
        { name: "Burger Classic", quantity: 2 },
        { name: "French Fries", quantity: 1 },
      ],
      roll: Number(rollWidth) || 58,
      kot: true,
      variant: "kot",
    };
  }

  function openReceiptPreview() {
    setPreviewData(makeReceiptSample());
    setPreviewVariant("receipt");
    setShowPreview(true);
    setTestMsg("");
  }

  function openKotPreview() {
    setPreviewData(makeKotSample());
    setPreviewVariant("kot");
    setShowPreview(true);
  }

  async function toDataUrl(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // QZ: print logo image + raw text in one job
  async function printLogoAndRawViaQZ(printerName, logoUrl, rawText) {
    const qz = window.qz;
    if (!qz?.print) throw new Error("QZ not available");
    const cfg = qz.configs.create(printerName);

    const job = [];
    const chosenLogo = logoDataUrl || logoUrl;
    if (chosenLogo) {
      const dataUrl = chosenLogo.startsWith("data:")
        ? chosenLogo
        : await toDataUrl(chosenLogo);
      job.push({ type: "image", data: dataUrl, options: { scale: 0.6 } });
    }
    job.push({ type: "raw", format: "plain", data: rawText });

    return qz.print(cfg, job);
  }

  // ----- actions -----
  async function handleCheckBridge() {
    try {
      const ok = isAndroidBridge();
      setBridgeMsg(
        ok ? "Android bridge FOUND ✅" : "Android bridge NOT found ❌"
      );
    } catch (e) {
      setBridgeMsg(`Check failed: ${e?.message || String(e)}`);
    }
  }

  async function handleListPrinters() {
    try {
      setBtMsg("Working...");
      if (isAndroidBridge()) {
        const list = androidListPrintersDetailed();
        setAndroidPrinters(list);
        setPrinterList(list.map((p) => `${p.name} (${p.address || "no-mac"})`));
        setBtMsg(
          list.length
            ? `Paired BT printers:\n• ${list
                .map((p) => `${p.name} — ${p.address}`)
                .join("\n• ")}`
            : "No paired Bluetooth printers found."
        );
        return;
      }
      // Desktop (QZ)
      await connectQZ();
      const printers = await listPrinters();
      setBtMsg(
        printers?.length
          ? `Installed printers:\n• ${printers.join("\n• ")}`
          : "No printers found."
      );
      setPrinterList(printers || []);
    } catch (e) {
      setBtMsg(`List failed: ${e?.message || String(e)}`);
    }
  }

  async function handleTestPrint() {
    try {
      setTestMsg("Sending sample receipt…");

      const sampleRaw = buildReceipt({
        shopName,
        address: shopAddr,
        orderNumber: "TEST",
        dateStr: new Date().toLocaleString(),
        items: [
          { name: "Americano", quantity: 1, price: 20000 },
          { name: "Iced Latte", quantity: 1, price: 25000 },
        ],
        subtotal: 45000,
        tax: 4500,
        service: 2250,
        discount: 0,
        total: 51750,
        payment: "N/A",
        orderType: "Test",
        customer: { name: "Test" },
        footer: footerMsg,
      });

      const copies = Math.max(1, Number(receiptCopies) || 1);

      // ---------- ANDROID PATH ----------
      if (isAndroidBridge()) {
        // density (if supported)
        if (typeof window.AndroidPrinter?.setDensity === "function") {
          try {
            window.AndroidPrinter.setDensity(Number(density) || 1);
          } catch {}
        }

        if (!androidIsBtOn()) {
          setTestMsg(
            "Bluetooth is OFF. Please enable Bluetooth and try again."
          );
          return;
        }

        const paired = androidListPrintersDetailed();
        if (!paired.length) {
          setTestMsg(
            "No paired Bluetooth printers. Pair your printer in Android Settings > Bluetooth."
          );
          return;
        }

        // Prefer saved address; otherwise first paired
        const targetAddress =
          receiptPrinter || (paired.length ? paired[0].address || "" : "");

        // Try to include logo if the bridge supports it (name-based only).
        // NOTE: printLogoAndText currently targets by nameLike; when we only have MAC address,
        // we’ll just send the text via address. (Logo support by address would require a native update.)
        const logoUrl = logoDataUrl || appLogo;
        const dataUrl = logoUrl ? await toDataUrl(logoUrl) : null;

        for (let i = 0; i < copies; i++) {
          if (
            dataUrl &&
            typeof window.AndroidPrinter?.printLogoAndText === "function"
          ) {
            // Best-effort: pass empty nameLike -> native falls back to first paired.
            // If you want strict targeting for logo, add a printLogoAndTextByAddress method natively.
            try {
              window.AndroidPrinter.printLogoAndText(dataUrl, sampleRaw, "");
              continue; // already printed both logo + text
            } catch {}
          }

          // Reliable text print via MAC address with retry
          await androidPrintWithRetry(sampleRaw, {
            address: targetAddress,
            nameLike: "", // not needed when address is provided
            copies: 1,
            tries: 3,
            baseDelay: 500,
          });
        }

        const lastErr = androidGetLastError();
        setTestMsg(
          lastErr
            ? `Android print finished with error: ${lastErr}`
            : "Android print sent ✅"
        );
        return;
      }

      // ---------- DESKTOP (QZ) PATH ----------
      await connectQZ();
      const printers = await listPrinters();
      if (!Array.isArray(printers) || printers.length === 0) {
        setTestMsg("No printers found (QZ).");
        return;
      }

      const target =
        (receiptPrinter && printers.find((p) => p === receiptPrinter)) ||
        printers.find((p) => /RPP02N/i.test(p)) ||
        printers[0];

      for (let i = 0; i < copies; i++) {
        await printLogoAndRawViaQZ(target, appLogo, sampleRaw);
      }
      setTestMsg(`QZ print (logo + text) sent to "${target}" ✅`);
    } catch (e) {
      setTestMsg(`Test print failed: ${e?.message || String(e)}`);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // ----- render -----
  return (
    <div className="page-container">
      {/* Back */}
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="page-title">Settings</h1>
      <p className="settings-subtitle">Printer &amp; App Diagnostics</p>

      <div className="settings-grid">
        {/* Card: Android Bridge */}
        <section className="card">
          <h2>Android Bridge</h2>
          <p className="muted">
            Check if the Android WebView bridge (
            <code>window.AndroidPrinter</code>) is available (only on the
            Android app).
          </p>
          {bridgeMsg && <p className="note">{bridgeMsg}</p>}
          <div className="actions">
            <button className="btn outline" onClick={handleCheckBridge}>
              Check Bridge
            </button>
          </div>
        </section>

        {/* Card: Printers */}
        <section className="card">
          <h2>Bluetooth / Installed Printers</h2>
          <p className="muted">
            List paired Bluetooth printers (Android) or installed printers
            (desktop via QZ).
          </p>
          {btMsg && <pre className="note pre">{btMsg}</pre>}
          <div className="actions">
            <button className="btn" onClick={handleListPrinters}>
              List Printers
            </button>
          </div>
        </section>

        {/* Card: Test Print + Previews */}
        <section className="card">
          <h2>Test & Preview</h2>
          <p className="muted">
            Preview the sample tickets or send a sample receipt to your printer.
          </p>
          {testMsg && <p className="note">{testMsg}</p>}
          <div
            className="actions"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <button className="btn" onClick={openReceiptPreview}>
              Preview Receipt
            </button>
            <button className="btn" onClick={openKotPreview}>
              Preview Kitchen Ticket
            </button>
            <button className="btn primary" onClick={handleTestPrint}>
              Send Test Receipt
            </button>
          </div>
        </section>

        {/* ADMIN-ONLY: Printer routing */}
        {isAdmin && (
          <section className="card">
            <h2>Printer Routing</h2>
            <p className="muted">
              Choose default printers and copies for each ticket.
            </p>
            <div className="form-grid-2">
              <div>
                <label>Receipt printer</label>
                <select
                  value={receiptPrinter}
                  onChange={(e) => setReceiptPrinter(e.target.value)}
                >
                  <option value="">(Use first available)</option>
                  {isAndroidBridge()
                    ? androidPrinters.map((p) => (
                        <option
                          key={p.address || p.name}
                          value={p.address || ""}
                        >
                          {p.name} {p.address ? `(${p.address})` : ""}
                        </option>
                      ))
                    : printerList.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                </select>

                <label style={{ display: "block", marginTop: 8 }}>
                  Receipt copies
                </label>
                <input
                  type="number"
                  min={1}
                  value={receiptCopies}
                  onChange={(e) =>
                    setReceiptCopies(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>

              <div>
                <label>Kitchen printer</label>
                <select
                  value={kitchenPrinter}
                  onChange={(e) => setKitchenPrinter(e.target.value)}
                >
                  <option value="">
                    (Use first available / name contains "kitchen")
                  </option>
                  {isAndroidBridge()
                    ? androidPrinters.map((p) => (
                        <option
                          key={p.address || p.name}
                          value={p.address || ""}
                        >
                          {p.name} {p.address ? `(${p.address})` : ""}
                        </option>
                      ))
                    : printerList.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                </select>

                <label style={{ display: "block", marginTop: 8 }}>
                  Kitchen copies
                </label>
                <input
                  type="number"
                  min={1}
                  value={kitchenCopies}
                  onChange={(e) =>
                    setKitchenCopies(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={savePrinters}>
                Save
              </button>
            </div>
          </section>
        )}

        {/* ADMIN-ONLY: Ticket appearance */}
        {isAdmin && (
          <section className="card">
            <h2>Ticket Appearance</h2>
            <div className="form-grid-2">
              <div>
                <label>Paper width</label>
                <select
                  value={rollWidth}
                  onChange={(e) => setRollWidth(e.target.value)}
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </select>

                <label style={{ display: "block", marginTop: 8 }}>
                  Print density (darkness)
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={density}
                  onChange={(e) => setDensity(Number(e.target.value))}
                />
                <div className="muted">Current: {density}</div>
              </div>

              <div>
                <label>Logo image</label>
                <input type="file" accept="image/*" onChange={onLogoFile} />
                {(logoDataUrl || appLogo) && (
                  <div className="logo-preview">
                    <img
                      src={logoDataUrl || appLogo}
                      alt="Logo preview"
                      style={{ height: 60, objectFit: "contain" }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={savePrintPrefs}>
                Save
              </button>
            </div>
          </section>
        )}

        {/* ADMIN-ONLY: Receipt template text */}
        {isAdmin && (
          <section className="card">
            <h2>Receipt Template</h2>
            <label>Shop Name</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />

            <label style={{ marginTop: 8 }}>Address</label>
            <textarea
              rows={2}
              value={shopAddr}
              onChange={(e) => setShopAddr(e.target.value)}
            />

            <label style={{ marginTop: 8 }}>Footer Message</label>
            <input
              value={footerMsg}
              onChange={(e) => setFooterMsg(e.target.value)}
            />

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveBiz}>
                Save
              </button>
            </div>
          </section>
        )}

        {/* ADMIN-ONLY: Promotions */}
        {isAdmin && (
          <section className="card">
            <h2>Promotions</h2>
            <p className="muted">
              Create and manage discounts staff can pick at checkout.
            </p>

            <div className="form-grid-2">
              <div>
                <label>Promo name</label>
                <input
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="e.g. Student Discount"
                />

                <label style={{ marginTop: 8 }}>Type</label>
                <select
                  value={pType}
                  onChange={(e) => setPType(e.target.value)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat (Rp.)</option>
                </select>
              </div>

              <div>
                <label>Value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pValue}
                  onChange={(e) => setPValue(e.target.value)}
                  placeholder={
                    pType === "percentage" ? "10 for 10%" : "5000 for Rp.5,000"
                  }
                />

                <label style={{ marginTop: 8 }}>Active?</label>
                <select
                  value={String(pActive)}
                  onChange={(e) => setPActive(e.target.value === "true")}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <label style={{ marginTop: 8 }}>Description (optional)</label>
            <input
              type="text"
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              placeholder="e.g. Show student ID"
            />

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={addPromo}>
                Add Promotion
              </button>
            </div>

            {/* list */}
            {pLoading ? (
              <p className="note">Loading promotions…</p>
            ) : pError ? (
              <p className="note" style={{ color: "#b91c1c" }}>
                {pError}
              </p>
            ) : promos.length > 0 ? (
              <div className="note" style={{ marginTop: 10 }}>
                <strong>Saved promotions:</strong>
                <ul className="list-reset" style={{ marginTop: 8 }}>
                  {promos.map((p) => (
                    <li key={p._id} className="list-item">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div>
                            <b>{p.name}</b>{" "}
                            <span className={p.active ? "tag" : "tag muted"}>
                              {p.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="muted" style={{ margin: 0 }}>
                            {p.type === "percentage"
                              ? `${p.value}%`
                              : `Rp.${Number(p.value || 0).toFixed(2)}`}
                            {p.description ? ` — ${p.description}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            className="btn"
                            onClick={() => togglePromo(p._id, p.active)}
                          >
                            {p.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="btn outline"
                            onClick={() => deletePromo(p._id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="note">No promotions yet.</p>
            )}
          </section>
        )}

        {/* Diagnostics */}
        <section className="card">
          <h2>Diagnostics</h2>
          <div
            className="actions"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <button className="btn" onClick={probeBridge}>
              Probe Android Bridge
            </button>
          </div>
          {bridgeCaps && (
            <pre className="note pre" style={{ marginTop: 8 }}>
              {JSON.stringify(bridgeCaps, null, 2)}
            </pre>
          )}

          <div style={{ marginTop: 12 }}>
            <label>Raw ESC/POS test (QZ)</label>
            <textarea
              rows={4}
              value={rawCmd}
              onChange={(e) => setRawCmd(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn" onClick={sendRawTest}>
                Send Raw
              </button>
            </div>
          </div>
        </section>

        {/* Logout */}
        <section className="card">
          <h2>Account</h2>
          <div className="actions">
            <button className="btn outline" onClick={logout}>
              Log out
            </button>
          </div>
        </section>
      </div>

      {/* Preview modal (works for both receipt & KOT) */}
      {showPreview && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPreview(false)}
        >
          <div className="modal__dialog" onClick={(e) => e.stopPropagation()}>
            <header className="modal__head">
              <strong>
                {previewVariant === "kot"
                  ? "Kitchen Ticket Preview"
                  : "Receipt Preview"}
              </strong>
              <button
                className="modal__close"
                aria-label="Close"
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </header>

            <div className="modal__body">
              <ReceiptPreview
                data={previewData}
                variant={previewVariant}
                roll={previewData?.roll || Number(rollWidth) || 58}
              />
            </div>

            <footer className="modal__actions">
              <button
                className="btn outline"
                onClick={() => setShowPreview(false)}
              >
                Close
              </button>
              {previewVariant === "receipt" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setShowPreview(false);
                    handleTestPrint();
                  }}
                >
                  Print This
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
