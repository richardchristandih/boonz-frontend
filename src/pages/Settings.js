// src/pages/Settings.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Settings.css";
import { fetchOrderCharges, saveOrderCharges } from "../services/orderCharges";

import {
  isAndroidBridge,
  androidListPrintersDetailed,
  androidPrintWithRetry,
  androidIsBtOn,
  androidGetLastError,
  androidPrintLogoAndText,
} from "../utils/androidBridge";

import { buildReceipt } from "../receipt";
import { connectQZ, listPrinters } from "../utils/qzHelper";
import ReceiptPreview from "../components/ReceiptPreview";
import appLogo from "../images/logo.jpg";
import api from "../services/api";
import { formatIDR } from "../utils/money";

async function toDataUrl(url) {
  if (typeof url === "string" && url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

/* -------------------------------------------------------
   SplitButtonMenu — compact actions menu with primary CTA
   ------------------------------------------------------- */

function SplitButtonMenu({
  onTestPrint,
  onRefresh,
  onSave,
  onPrevReceipt,
  onPrevKOT,
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  // close on outside click / ESC
  React.useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="printer-actions" ref={menuRef}>
      {/* Primary CTA */}
      <button className="btn primary btn--lg" onClick={onTestPrint}>
        Send Test Print
      </button>

      {/* Split toggle (collapses other actions into a menu on small screens) */}
      <button
        className="btn split-toggle btn--lg"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More printer actions"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="split-toggle__label">More</span>
        <span className="split-toggle__chev" aria-hidden>
          ▾
        </span>
      </button>

      {/* Popover menu */}
      {open && (
        <div className="split-menu" role="menu">
          <button
            role="menuitem"
            className="split-menu__item"
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            Refresh Printers
          </button>
          <button
            role="menuitem"
            className="split-menu__item"
            onClick={() => {
              setOpen(false);
              onSave();
            }}
          >
            Save Preferences
          </button>
          <div className="split-menu__sep" role="separator" />
          <button
            role="menuitem"
            className="split-menu__item"
            onClick={() => {
              setOpen(false);
              onPrevReceipt();
            }}
          >
            Preview Receipt
          </button>
          <button
            role="menuitem"
            className="split-menu__item"
            onClick={() => {
              setOpen(false);
              onPrevKOT();
            }}
          >
            Preview KOT
          </button>
        </div>
      )}

      {/* Wide layout helper – shows the four “secondary” buttons inline on large screens */}
      <div className="printer-actions__inline">
        <button className="btn btn--lg" onClick={onRefresh}>
          Refresh Printers
        </button>
        <button className="btn btn--lg" onClick={onSave}>
          Save Preferences
        </button>
        <button className="btn outline btn--lg" onClick={onPrevReceipt}>
          Preview Receipt
        </button>
        <button className="btn outline btn--lg" onClick={onPrevKOT}>
          Preview KOT
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  /* -------------------------- User / auth --------------------------- */
  const userObj = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const [user, setUser] = useState(userObj);
  const isAdmin =
    (user?.role && String(user.role).toLowerCase() === "admin") ||
    user?.isAdmin === true;

  /* ----------------------- Profile (change name) -------------------- */
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileMsg, setProfileMsg] = useState("");

  async function saveProfile() {
    try {
      setProfileMsg("Saving…");
      const { data } = await api.patch("/users/me", { name: profileName });
      const next = { ...(user || {}), name: data?.name || profileName };
      localStorage.setItem("user", JSON.stringify(next));
      setUser(next);
      setProfileMsg("Profile updated ✓");
      setTimeout(() => setProfileMsg(""), 1500);
    } catch (err) {
      setProfileMsg(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save profile."
      );
    }
  }

  /* ------------------------ Printer Settings ------------------------ */
  // unified printer option list: [{label, value}]
  const [printerList, setPrinterList] = useState([]);
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
  const [btMsg, setBtMsg] = useState("");
  const [testMsg, setTestMsg] = useState("");

  function toOptions(list) {
    if (isAndroidBridge()) {
      return (list || []).map((p) => ({
        label: `${p?.name ?? "Unknown"} (${p?.address || "no-mac"})`,
        value: p?.address || p?.name || "",
      }));
    }
    return (list || []).map((name) => ({ label: name, value: name }));
  }

  async function handleListPrinters() {
    try {
      setBtMsg("Scanning printers…");
      if (isAndroidBridge()) {
        const raw = androidListPrintersDetailed() || [];
        const list = Array.isArray(raw) ? raw : [];
        setPrinterList(toOptions(list));
        setBtMsg(
          list.length
            ? `Paired BT printers:\n• ${list
                .map((p) => `${p?.name ?? "Unknown"} — ${p?.address ?? "-"}`)
                .join("\n• ")}`
            : "No paired Bluetooth printers found."
        );
        return;
      }
      await connectQZ();
      const printers = await listPrinters();
      const arr = Array.isArray(printers) ? printers : [];
      setPrinterList(toOptions(arr));
      setBtMsg(
        arr.length
          ? `Installed printers:\n• ${arr.join("\n• ")}`
          : "No printers found."
      );
    } catch (e) {
      setBtMsg("List failed: " + (e?.message || String(e)));
    }
  }

  function savePrinters() {
    localStorage.setItem("printer.receipt", receiptPrinter);
    localStorage.setItem("printer.kitchen", kitchenPrinter);
    localStorage.setItem("printer.receiptCopies", String(receiptCopies || 1));
    localStorage.setItem("printer.kitchenCopies", String(kitchenCopies || 1));
    alert("Printer preferences saved.");
  }

  /* -------------------------- Print Preview ------------------------- */
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewVariant, setPreviewVariant] = useState("receipt");

  const [rollWidth, setRollWidth] = useState(
    localStorage.getItem("print.roll") || "58"
  );
  const [density, setDensity] = useState(
    Number(localStorage.getItem("print.density")) || 1
  );
  const [logoDataUrl, setLogoDataUrl] = useState(
    localStorage.getItem("print.logo") || ""
  );
  const [shopName, setShopName] = useState(
    localStorage.getItem("biz.name") || "Boonz"
  );
  const [shopAddr, setShopAddr] = useState(
    localStorage.getItem("biz.addr") || "Jl. Mekar Utama No. 61, Bandung"
  );
  const [footerMsg, setFooterMsg] = useState(
    localStorage.getItem("biz.footer") || "Terima kasih!"
  );

  const hideShopName = localStorage.getItem("print.hideShopName") === "true";

  function makeReceiptSample() {
    return {
      shopName: hideShopName ? "" : shopName,
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
      roll: Number(rollWidth),
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
      ],
      roll: Number(rollWidth),
      kot: true,
    };
  }

  function openPreview(type) {
    setPreviewData(type === "kot" ? makeKotSample() : makeReceiptSample());
    setPreviewVariant(type);
    setShowPreview(true);
  }

  function extractBtAddress(val) {
    const s = String(val || "");
    const m = s.match(/\(([^)]+)\)\s*$/);
    return (m && m[1]) || s;
  }

  async function handleTestPrint() {
    try {
      setTestMsg("Sending sample receipt and kitchen ticket…");
      const sampleReceipt = buildReceipt(makeReceiptSample());
      const sampleKot = buildReceipt(makeKotSample());
      const receiptCopiesNum = Math.max(1, Number(receiptCopies) || 1);
      const kitchenCopiesNum = Math.max(1, Number(kitchenCopies) || 1);

      // Get logos
      const logoSrc = logoDataUrl || appLogo;
      const logoData = await toDataUrl(logoSrc);

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) return setTestMsg("Bluetooth is OFF.");
        const raw = androidListPrintersDetailed() || [];
        const list = Array.isArray(raw) ? raw : [];
        if (!list.length) return setTestMsg("No paired Bluetooth printers.");

        // --- Print to RECEIPT printer ---
        const receiptAddr =
          extractBtAddress(receiptPrinter) || list[0].address || "";
        for (let i = 0; i < receiptCopiesNum; i++) {
          const ok = androidPrintLogoAndText(logoData, sampleReceipt, {
            address: receiptAddr,
            nameLike: receiptAddr,
          });
          if (!ok) {
            await androidPrintWithRetry(sampleReceipt, {
              address: receiptAddr,
              copies: 1,
              tries: 3,
              baseDelay: 500,
            });
          }
        }

        // --- Print to KITCHEN printer (if defined) ---
        if (kitchenPrinter) {
          const kitchenAddr =
            extractBtAddress(kitchenPrinter) ||
            list.find((p) => p.address !== receiptAddr)?.address ||
            "";
          for (let i = 0; i < kitchenCopiesNum; i++) {
            await androidPrintWithRetry(sampleKot, {
              address: kitchenAddr,
              copies: 1,
              tries: 3,
              baseDelay: 500,
            });
          }
        }

        const err = androidGetLastError();
        setTestMsg(err ? "Finished with error: " + err : "Both prints sent ✅");
        return;
      }

      // --- QZ path ---
      await connectQZ();
      const printers = await listPrinters();
      const arr = Array.isArray(printers) ? printers : [];
      const receiptTarget = receiptPrinter || arr[0];
      const kitchenTarget = kitchenPrinter || arr[0];

      if (!receiptTarget && !kitchenTarget)
        throw new Error("No printers found (QZ).");

      // Print receipt
      if (receiptTarget)
        await window.qz.print(
          window.qz.configs.create(receiptTarget, { rasterize: true }),
          [
            { type: "image", data: logoData },
            { type: "raw", format: "plain", data: sampleReceipt },
          ]
        );

      // Print kitchen ticket
      if (kitchenTarget)
        await window.qz.print(
          window.qz.configs.create(kitchenTarget, { rasterize: true }),
          [{ type: "raw", format: "plain", data: sampleKot }]
        );

      setTestMsg("Both receipt and kitchen test prints sent ✅");
    } catch (e) {
      setTestMsg("Print failed: " + (e?.message || String(e)));
    }
  }

  /* ----------------------------- Promos ----------------------------- */
  const [promos, setPromos] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pName, setPName] = useState("");
  const [pType, setPType] = useState("percentage");
  const [pValue, setPValue] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pActive, setPActive] = useState(true);

  async function fetchPromos() {
    try {
      setPLoading(true);
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
    const val = Number(pValue);
    if (!pName.trim() || !(val > 0))
      return alert("Please fill promo name and value.");
    try {
      const { data } = await api.post("/promotions", {
        name: pName.trim(),
        type: pType,
        value: val,
        description: pDesc.trim(),
        active: pActive,
      });
      setPromos((p) => [data, ...p]);
      setPName("");
      setPValue("");
      setPDesc("");
      setPType("percentage");
      setPActive(true);
    } catch (e) {
      alert("Add failed: " + (e?.message || "Unknown error."));
    }
  }

  async function togglePromo(id, currentActive) {
    try {
      const { data } = await api.patch(`/promotions/${id}`, {
        active: !currentActive,
      });
      setPromos((prev) => prev.map((p) => (p._id === id ? data : p)));
    } catch {
      alert("Failed to toggle promo.");
    }
  }

  async function deletePromo(id) {
    if (!window.confirm("Delete this promotion?")) return;
    try {
      await api.delete(`/promotions/${id}`);
      setPromos((p) => p.filter((x) => x._id !== id));
    } catch {
      alert("Delete failed.");
    }
  }

  /* ---------------------------- Tax & Service ----------------------- */
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("10"); // UI shows percent
  const [svcEnabled, setSvcEnabled] = useState(false);
  const [svcRate, setSvcRate] = useState("5");
  const [chargesMsg, setChargesMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchOrderCharges();
        setTaxEnabled(!!s.taxEnabled);
        setSvcEnabled(!!s.serviceEnabled);
        // convert decimal to percentage text for inputs
        setTaxRate(
          String(
            (Number(s.taxRate) <= 1
              ? Number(s.taxRate) * 100
              : Number(s.taxRate)) || 0
          )
        );
        setSvcRate(
          String(
            (Number(s.serviceRate) <= 1
              ? Number(s.serviceRate) * 100
              : Number(s.serviceRate)) || 0
          )
        );
      } catch (e) {
        console.warn("Failed to load order charges:", e);
      }
    })();
  }, []);

  async function saveTaxSettings() {
    try {
      setChargesMsg("Saving…");
      await saveOrderCharges({
        taxEnabled,
        taxRate: Number(taxRate) / 100, // accept “10” as 10%
        serviceEnabled: svcEnabled,
        serviceRate: Number(svcRate) / 100,
      });
      setChargesMsg("Saved ✓");
      setTimeout(() => setChargesMsg(""), 1200);
    } catch (e) {
      setChargesMsg(e?.response?.data?.message || e?.message || "Save failed.");
    }
  }

  /* ---------------------------- Logout ------------------------------ */
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  /* Auto-load printers once */
  useEffect(() => {
    handleListPrinters();
  }, []);

  /* ---------------------------- RENDER ------------------------------ */
  return (
    <div className="page-container">
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>
      <h1 className="page-title">Settings</h1>

      <div className="settings-grid">
        {/* PROFILE + ACCOUNT (combined) */}
        <section className="card">
          <h2>Profile &amp; Account</h2>
          <label>Display name</label>
          <input
            className="input-hero"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name"
          />
          {profileMsg && <p className="note">{profileMsg}</p>}
          <div className="actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={saveProfile}>
              Save Profile
            </button>
            <button className="btn danger" onClick={logout}>
              Log out
            </button>
          </div>
        </section>

        {/* PRINTERS — Refresh + Routing + Test */}
        <section className="card">
          <h2>Printers — Refresh, Routing &amp; Test</h2>
          <p className="muted">Manage Android Bluetooth or QZ printers.</p>

          <SplitButtonMenu
            onTestPrint={handleTestPrint}
            onRefresh={handleListPrinters}
            onSave={savePrinters}
            onPrevReceipt={() => openPreview("receipt")}
            onPrevKOT={() => openPreview("kot")}
          />

          {btMsg && (
            <pre className="note pre" style={{ marginTop: 10 }}>
              {btMsg}
            </pre>
          )}

          <div className="form-grid-2" style={{ marginTop: 14 }}>
            <div>
              <label>Receipt Printer</label>
              <select
                value={receiptPrinter}
                onChange={(e) => setReceiptPrinter(e.target.value)}
              >
                <option value="">(Default)</option>
                {printerList.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label style={{ marginTop: 8 }}>Receipt Copies</label>
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
              <label>Kitchen Printer</label>
              <select
                value={kitchenPrinter}
                onChange={(e) => setKitchenPrinter(e.target.value)}
              >
                <option value="">(Default)</option>
                {printerList.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label style={{ marginTop: 8 }}>Kitchen Copies</label>
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

          {testMsg && (
            <p className="note" style={{ marginTop: 10 }}>
              {testMsg}
            </p>
          )}
        </section>

        {/* ADMIN ONLY */}
        {isAdmin && (
          <>
            <section className="card">
              <h2>Ticket Appearance</h2>
              <div className="form-grid-2">
                <div>
                  <label>Paper Width</label>
                  <select
                    value={rollWidth}
                    onChange={(e) => setRollWidth(e.target.value)}
                  >
                    <option value="58">58 mm</option>
                    <option value="80">80 mm</option>
                  </select>
                  <label style={{ marginTop: 8 }}>Print Density</label>
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
                  <label>Logo Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const fr = new FileReader();
                      fr.onload = () => setLogoDataUrl(fr.result);
                      fr.readAsDataURL(f);
                    }}
                  />
                  {(logoDataUrl || appLogo) && (
                    <div className="logo-preview">
                      <img src={logoDataUrl || appLogo} alt="Logo" />
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => {
                    localStorage.setItem("print.roll", rollWidth);
                    localStorage.setItem("print.density", String(density));
                    if (logoDataUrl)
                      localStorage.setItem("print.logo", logoDataUrl);
                    alert("Print settings saved.");
                  }}
                >
                  Save
                </button>
              </div>
            </section>

            <section className="card">
              <h2>Receipt Template</h2>
              <label>Shop Name</label>
              <input
                className="input-hero"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
              <label style={{ marginTop: 8 }}>Address</label>
              <textarea
                className="textarea--enhanced"
                rows={2}
                value={shopAddr}
                onChange={(e) => setShopAddr(e.target.value)}
              />
              <label style={{ marginTop: 8 }}>Footer Message</label>
              <input
                className="input-hero"
                type="text"
                value={footerMsg}
                onChange={(e) => setFooterMsg(e.target.value)}
              />
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => {
                    localStorage.setItem("biz.name", shopName);
                    localStorage.setItem("biz.addr", shopAddr);
                    localStorage.setItem("biz.footer", footerMsg);
                    alert("Business profile saved.");
                  }}
                >
                  Save
                </button>
              </div>
            </section>

            <section className="card">
              <h2>Tax &amp; Service Charge</h2>
              <p className="muted">Configure order charges and rates.</p>
              <div className="form-grid-2">
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={taxEnabled}
                      onChange={(e) => setTaxEnabled(e.target.checked)}
                    />{" "}
                    Enable Tax
                  </label>
                  <label style={{ marginTop: 8 }}>Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </div>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={svcEnabled}
                      onChange={(e) => setSvcEnabled(e.target.checked)}
                    />{" "}
                    Enable Service Charge
                  </label>
                  <label style={{ marginTop: 8 }}>Service Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={svcRate}
                    onChange={(e) => setSvcRate(e.target.value)}
                  />
                </div>
              </div>
              <div className="actions">
                <button className="btn" onClick={saveTaxSettings}>
                  Save
                </button>
              </div>
              {chargesMsg && <p className="note">{chargesMsg}</p>}
            </section>

            <section className="card">
              <h2>Promotions</h2>
              <p className="muted">Create and manage discount promotions.</p>
              <div className="form-grid-2">
                <div>
                  <div>
                    <label>Name</label>
                    <input
                      className="input-hero"
                      type="text"
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                    />

                    <label style={{ marginTop: 8 }}>Type</label>
                    <select
                      className="input-hero"
                      value={pType}
                      onChange={(e) => setPType(e.target.value)}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="flat">Flat (Rp)</option>
                    </select>
                  </div>

                  <div>
                    <label>Value</label>
                    <input
                      className="input-hero"
                      type="number"
                      min="0"
                      step="0.01"
                      value={pValue}
                      onChange={(e) => setPValue(e.target.value)}
                    />
                  </div>

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

              <label style={{ marginTop: 8 }}>Description</label>
              <input
                className="input-hero"
                type="text"
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
              />

              <div className="actions">
                <button className="btn" onClick={addPromo}>
                  Add Promotion
                </button>
              </div>
              {pLoading ? (
                <p className="note">Loading…</p>
              ) : pError ? (
                <p className="note" style={{ color: "#b91c1c" }}>
                  {pError}
                </p>
              ) : promos.length ? (
                <ul className="list-reset" style={{ marginTop: 10 }}>
                  {promos.map((p) => (
                    <li key={p._id} className="list-item">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <b>{p.name}</b>{" "}
                          <span className={p.active ? "tag" : "tag muted"}>
                            {p.active ? "Active" : "Inactive"}
                          </span>
                          <div className="muted">
                            {p.type === "percentage"
                              ? `${p.value}%`
                              : formatIDR(p.value)}{" "}
                            {p.description}
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
              ) : (
                <p className="note">No promotions yet.</p>
              )}
            </section>
          </>
        )}
      </div>

      {/* PREVIEW MODAL */}
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
                roll={previewData?.roll || Number(rollWidth)}
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
