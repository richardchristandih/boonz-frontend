// src/MainMenu.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./MainMenu.css";
import richardImage from "./ProfilePic.png";
import Sidebar from "./Sidebar";
import { buildReceipt } from "../receipt";
import { isAndroidBridge, androidPrintFormatted } from "../utils/androidBridge";
import { printRaw, listPrinters } from "../utils/qzHelper";
import SafeImage from "../components/SafeImage";
import api from "../services/api"; // <-- use the shared Axios client

// ---------- Constants ----------
const CATEGORIES = [
  "Coffee",
  "Drink",
  "Burger",
  "Beer",
  "Patisserie",
  "Matcha",
];
const TAX_RATE = 0.1;
const SERVICE_CHARGE_RATE = 0.05;

// Hints used to find printers (edit to match your setup)
const KITCHEN_PRINTER_HINTS = [/kitchen/i, /\bKOT\b/i]; // prefer a printer with “kitchen” in its name
const RECEIPT_PRINTER_HINT = /RPP02N/i; // your receipt printer hint

const productImages = require.context(
  "../images",
  true,
  /\.(png|jpe?g|gif|webp)$/
);

// ---------- Helpers ----------
function resolveProductImage(relPath) {
  if (!relPath) return null;
  try {
    return productImages("./" + relPath);
  } catch {
    return null;
  }
}

function formatCurrency(num) {
  const n = Number(num || 0);
  return `Rp.${n.toFixed(2)}`;
}

/** Build a simple Kitchen Order Ticket (KOT) using DantSu markup */
function buildKitchenTicket({
  shopName,
  orderNumber,
  dateStr,
  orderType,
  items,
  customer,
}) {
  const header =
    `[C]<b><font size='big'>KITCHEN ORDER</font></b>\n` +
    `[C]${shopName}\n` +
    `[C]------------------------------\n` +
    `[L]Order #${orderNumber}\n` +
    `[L]Type : ${orderType}\n` +
    `[L]Time : ${dateStr}\n` +
    (customer?.name ? `[L]Cust : ${customer.name}\n` : ``) +
    `[C]------------------------------\n`;

  const lines = (items || [])
    .map((it) => {
      const qty = Number(it.quantity || 0);
      const name = it.name || "Item";
      return `[L]<b>${qty} × ${name}</b>\n`;
    })
    .join("");

  return header + lines + `[C]------------------------------\n\n`;
}

/** Desktop (QZ) picker: try hints first, then first printer */
function pickPrinter(printers, hints) {
  for (const h of hints) {
    const found = printers.find((p) => h.test(p));
    if (found) return found;
  }
  return printers[0];
}

/** Print the KOT on Android/QZ */
async function printKitchenTicket(kotText) {
  if (isAndroidBridge()) {
    // On Android, your bridge filters by nameLike (if implemented).
    // We pass “KITCHEN” so you can route to a dedicated KOT printer.
    androidPrintFormatted(kotText, "KITCHEN");
    return;
  }
  const printers = await listPrinters();
  if (!Array.isArray(printers) || printers.length === 0)
    throw new Error("No printers found (QZ).");
  const printerName = pickPrinter(printers, KITCHEN_PRINTER_HINTS);
  await printRaw(printerName, kotText);
}

// Compute discount for a promo object against a subtotal
function computePromoDiscount(promo, subtotal) {
  if (!promo || !promo.active) return 0;
  // Optional constraints
  if (promo.minSubtotal && subtotal < Number(promo.minSubtotal)) return 0;

  let d = 0;
  if (promo.type === "percentage") {
    d = subtotal * (Number(promo.value || 0) / 100);
  } else {
    d = Number(promo.value || 0);
  }
  if (promo.maxDiscount && d > Number(promo.maxDiscount))
    d = Number(promo.maxDiscount);
  return Math.max(0, d);
}

// ---------- Component ----------
export default function MenuLayout() {
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken"); // ensure refresh token is cleared too
    localStorage.removeItem("user");
    navigate("/login");
  }, [navigate]);

  // UI / Data state
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Coffee");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Delivery");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [orderNumber, setOrderNumber] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search bar
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchBar, setShowSearchBar] = useState(false);

  // Promotions
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState("");

  // Discount popup
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // Two modes: 'promo' | 'custom'
  const [discountMode, setDiscountMode] = useState("promo");

  // PROMO state
  const [selectedPromoId, setSelectedPromoId] = useState("");

  // CUSTOM state
  const [discountValue, setDiscountValue] = useState(""); // user input (string)
  const [discountType, setDiscountType] = useState("flat"); // "flat" | "percentage"
  const [discountNote, setDiscountNote] = useState("");

  // User
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // ---------- Effects ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/products");
        setProducts(res.data || []);
      } catch (err) {
        console.error("Error fetching products:", err);
        setProducts([]);
      }
    })();
  }, []);

  // Fetch promos (active)
  const fetchPromos = useCallback(async () => {
    try {
      setPromosLoading(true);
      setPromosError("");
      const res = await api.get("/promotions?active=true");
      setPromos(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Failed to load promotions:", e);
      setPromosError("Failed to load promotions.");
      setPromos([]);
    } finally {
      setPromosLoading(false);
    }
  }, []);

  // ---------- Derivations ----------
  const filteredProducts = useMemo(() => {
    const term = (searchTerm || "").toLowerCase();
    return (products || []).filter((p) => {
      const category = (p?.category ?? "").trim();
      const name = p?.name ?? "";
      const matchesCategory = category === selectedCategory;
      const matchesSearch = name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [products, searchTerm, selectedCategory]);

  // Find selected promo object
  const selectedPromo = useMemo(
    () => promos.find((p) => (p._id || p.id) === selectedPromoId) || null,
    [promos, selectedPromoId]
  );

  // Base sums
  const sub = useMemo(
    () =>
      cart.reduce(
        (acc, item) =>
          acc + Number(item.price ?? 0) * Number(item.quantity ?? 0),
        0
      ),
    [cart]
  );
  const tx = useMemo(() => sub * TAX_RATE, [sub]);
  const svc = useMemo(() => sub * SERVICE_CHARGE_RATE, [sub]);

  // Custom discount compute
  const customDiscount = useMemo(() => {
    const parsed = parseFloat(discountValue) || 0;
    if (discountMode !== "custom") return 0;
    if (discountType === "percentage") return sub * (parsed / 100);
    return parsed;
  }, [discountMode, discountType, discountValue, sub]);

  // Promo discount compute
  const promoDiscount = useMemo(() => {
    if (discountMode !== "promo") return 0;
    return computePromoDiscount(selectedPromo, sub);
  }, [discountMode, selectedPromo, sub]);

  // Final discount & total
  const discount = useMemo(() => {
    return Math.max(
      0,
      discountMode === "promo" ? promoDiscount : customDiscount
    );
  }, [discountMode, promoDiscount, customDiscount]);

  const total = useMemo(() => {
    const ttl = Math.max(0, sub + tx + svc - discount);
    return ttl;
  }, [sub, tx, svc, discount]);

  const discountLabel = useMemo(() => {
    if (discountMode === "promo") {
      return selectedPromo
        ? `Discount (Promo: ${selectedPromo.name})`
        : "Discount (Promo)";
    }
    return discountType === "percentage"
      ? `Discount (${discountValue || 0}%)`
      : "Discount";
  }, [discountMode, selectedPromo, discountType, discountValue]);

  // ---------- Cart operations ----------
  const handleAddToCart = useCallback((product) => {
    if (!product) return;
    const productId = product._id || product.id || product.sku;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === productId);
      if (existing)
        return prev.map((i) =>
          i.id === productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      const priceNum = Number(product.price ?? 0);
      return [
        ...prev,
        { ...product, price: priceNum, quantity: 1, id: productId },
      ];
    });
  }, []);

  const handleIncreaseQty = useCallback((id) => {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
    );
  }, []);

  const handleDecreaseQty = useCallback((id) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.id === id && i.quantity > 1)
          return { ...i, quantity: i.quantity - 1 };
        return i;
      })
    );
  }, []);

  const handleRemoveItem = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ---------- Checkout flow ----------
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) {
      window.alert("Your cart is empty!");
      return;
    }
    setShowPaymentModal(true);
  }, [cart.length]);

  const confirmPayment = useCallback(async () => {
    if (!user) {
      window.alert("Your session expired. Please log in again.");
      navigate("/login");
      return;
    }
    if (!selectedPaymentMethod) {
      window.alert("Please select a payment method!");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);

    // Prepare discount note + promo
    let finalDiscountNote = discountNote.trim();
    let promoMeta = null;
    if (discountMode === "promo") {
      if (selectedPromo) {
        finalDiscountNote = selectedPromo.name;
        promoMeta = {
          promoId: selectedPromo._id || selectedPromo.id,
          promoName: selectedPromo.name,
        };
      } else if (!finalDiscountNote) {
        finalDiscountNote = "Promo";
      }
    } else {
      // custom
      if (discount === 0 && !finalDiscountNote) {
        finalDiscountNote = "None";
      } else if (discount > 0 && !finalDiscountNote) {
        const parsed = parseFloat(discountValue) || 0;
        finalDiscountNote =
          discountType === "percentage"
            ? `Custom ${parsed}% Discount`
            : "Custom Flat Discount";
      }
    }

    const orderData = {
      products: cart.map((item) => ({
        productId: item._id || item.id || item.sku,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price ?? 0),
      })),
      subtotal: sub,
      tax: tx,
      serviceCharge: svc,
      discount, // numeric discount applied
      discountNote: finalDiscountNote,
      totalAmount: total,
      user: user?._id,
      orderType,
      paymentMethod: selectedPaymentMethod,
      discountMode,
      ...(promoMeta || {}), // promoId, promoName when promo chosen
    };

    try {
      // 1) Save order
      const response = await api.post("/orders", orderData);
      const newOrderNumber = response.data?.orderNumber;
      setOrderNumber(newOrderNumber);

      // 2) PRINT — Kitchen ticket FIRST, then customer receipt
      try {
        const dateStr = new Date().toLocaleString();

        // 2a) Kitchen Order Ticket (KOT)
        const kotText = buildKitchenTicket({
          shopName: "Boonz Hauz",
          orderNumber: newOrderNumber || "N/A",
          dateStr,
          orderType: orderData.orderType,
          items: orderData.products,
          customer: { name: user?.name || "" },
        });
        await printKitchenTicket(kotText);

        // 2b) Customer receipt
        const receiptText = buildReceipt({
          shopName: "Boonz",
          address: "Jl. Mekar Utama No. 61, Bandung",
          orderNumber: newOrderNumber || "N/A",
          dateStr,
          items: orderData.products,
          subtotal: orderData.subtotal,
          tax: orderData.tax,
          service: orderData.serviceCharge,
          discount: orderData.discount,
          total: orderData.totalAmount,
          payment: orderData.paymentMethod,
          orderType: orderData.orderType,
          customer: { name: user?.name || "" },
          discountNote: finalDiscountNote,
        });

        if (isAndroidBridge()) {
          androidPrintFormatted(receiptText, "RPP02N");
        } else {
          const printers = await listPrinters();
          if (!Array.isArray(printers) || printers.length === 0)
            throw new Error("No printers found (QZ).");
          const receiptPrinterName =
            printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];
          await printRaw(receiptPrinterName, receiptText);
        }
      } catch (printErr) {
        console.error("Printing failed:", printErr);
        window.alert(
          "Order saved, but printing failed: " +
            (printErr?.message || "Unknown error")
        );
      }

      // 3) Reset UI
      setCart([]);
      setSelectedPromoId("");
      setDiscountMode("promo");
      setDiscountValue("0");
      setDiscountNote("");
      setDiscountType("flat");
      setShowPaymentModal(false);
      setSelectedPaymentMethod("");
      window.alert(
        `Order placed successfully! Your order number is ${newOrderNumber}`
      );
    } catch (error) {
      console.error("Error placing order:", error);
      window.alert("There was an error placing your order.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    cart,
    discount,
    discountMode,
    discountNote,
    discountType,
    discountValue,
    orderType,
    selectedPaymentMethod,
    svc,
    sub,
    tx,
    total,
    user,
    isSubmitting,
    selectedPromo,
    navigate,
  ]);

  // ---------- Discount modal handlers ----------
  const handleOpenDiscountModal = async () => {
    setShowDiscountModal(true);
    if (!promos.length && !promosLoading) {
      await fetchPromos();
    }
  };
  const handleCloseDiscountModal = () => setShowDiscountModal(false);
  const handleApplyDiscount = () => {
    setShowDiscountModal(false);
  };

  // ---------- Render ----------
  return (
    <div className="layout-container">
      {/* Sidebar */}
      <Sidebar onAddProduct={() => navigate("/product-page")} />

      {/* Main Content */}
      <main className="layout-main">
        {/* Top Bar */}
        <div className="layout-topbar">
          <div className="layout-categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`category-btn ${
                  cat === selectedCategory ? "active" : ""
                }`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search & User */}
          <div className="layout-user">
            {!showSearchBar && (
              <button
                className="search-icon-btn"
                onClick={() => setShowSearchBar(true)}
              >
                <i className="fas fa-search" />
              </button>
            )}
            {showSearchBar && (
              <div className="search-bar-container">
                <input
                  type="text"
                  className="search-bar"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
                <button
                  className="close-search-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setShowSearchBar(false);
                  }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            <div className="user-info">
              <img src={richardImage} alt="User Avatar" className="avatar" />
              <div>
                <strong>{user?.name || ""}</strong>
                <br />
                <small style={{ color: "#999" }}>{user?.email || ""}</small>
              </div>
            </div>

            <button
              className="logout-btn"
              onClick={handleLogout}
              title="Log out"
            >
              <i className="fas fa-sign-out-alt" />
            </button>
          </div>
        </div>

        {/* Products */}
        <div className="products-area">
          <h2>{selectedCategory} Menu</h2>
          <div className="product-grid">
            {filteredProducts.map((prod) => {
              const key =
                prod?._id ||
                prod?.id ||
                prod?.sku ||
                Math.random().toString(36);
              const name = prod?.name || "Untitled";
              const desc = prod?.description || "";
              const imgSrc = resolveProductImage(prod?.image);
              const priceNum = Number(prod?.price ?? 0);

              return (
                <div key={key} className="product-card">
                  <SafeImage
                    className="product-image"
                    src={imgSrc}
                    alt={name}
                  />
                  <h3 className="product-name">{name}</h3>
                  <p className="product-desc">{desc}</p>
                  <p className="product-price">{formatCurrency(priceNum)}</p>
                  <button
                    onClick={() => handleAddToCart(prod)}
                    className="add-to-cart-btn"
                  >
                    Add to cart
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Cart */}
      <aside className="layout-cart">
        <div className="cart-header">
          <h3>Cart</h3>
          <p className="cart-order-id">
            Order #{orderNumber ? orderNumber : "Pending"}
          </p>
        </div>

        <div className="cart-delivery">
          {["Delivery", "Dine in", "Take away"].map((t) => (
            <button
              key={t}
              className={orderType === t ? "active" : ""}
              onClick={() => setOrderType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="cart-items">
          {cart.map((item) => (
            <div key={item.id} className="cart-item">
              <div className="cart-item-left">
                <strong>{item.name}</strong>
                <br />
                <small>{(Number(item.quantity) || 0) * 200} ml</small>
              </div>
              <div className="cart-item-right">
                <p>{formatCurrency(Number(item.price ?? 0))}</p>
                <div className="cart-qty">
                  <button onClick={() => handleDecreaseQty(item.id)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => handleIncreaseQty(item.id)}>+</button>
                </div>
                <button
                  className="cart-remove"
                  onClick={() => handleRemoveItem(item.id)}
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="cart-summary">
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatCurrency(sub)}</span>
          </div>
          <div className="summary-row">
            <span>Tax (10%)</span>
            <span>{formatCurrency(tx)}</span>
          </div>
          <div className="summary-row">
            <span>Service Charge (5%)</span>
            <span>{formatCurrency(svc)}</span>
          </div>
          <div className="summary-row">
            <span>{discountLabel}</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
          <div className="summary-row total-row">
            <strong>Total</strong>
            <strong>{formatCurrency(total)}</strong>
          </div>

          <button className="discount-btn" onClick={handleOpenDiscountModal}>
            Add Discount
          </button>
          <button
            className="checkout-btn"
            onClick={handleCheckout}
            disabled={isSubmitting || cart.length === 0}
          >
            {isSubmitting ? "Processing..." : "Checkout"}
          </button>
        </div>
      </aside>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="payment-modal">
          <div className="payment-modal-content">
            <h3>Select Payment Method</h3>
            <ul className="payment-method-list">
              {["Credit Card", "Debit Card", "QRIS", "Go Pay", "Grab Pay"].map(
                (method) => (
                  <li key={method}>
                    <button
                      className={`payment-method-btn ${
                        selectedPaymentMethod === method ? "active" : ""
                      }`}
                      onClick={() => setSelectedPaymentMethod(method)}
                    >
                      {method}
                    </button>
                  </li>
                )
              )}
            </ul>
            <div className="payment-modal-actions">
              <button
                className="confirm-payment-btn"
                onClick={confirmPayment}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Confirming…" : "Confirm Payment"}
              </button>
              <button
                className="cancel-payment-btn"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="discount-modal">
          <div className="discount-modal-content">
            <h3>Apply Discount</h3>

            {/* Mode selector */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <label style={{ fontWeight: "bold" }}>
                <input
                  type="radio"
                  name="discountMode"
                  value="promo"
                  checked={discountMode === "promo"}
                  onChange={() => setDiscountMode("promo")}
                  style={{ marginRight: 6 }}
                />
                Promotion
              </label>
              <label style={{ fontWeight: "bold" }}>
                <input
                  type="radio"
                  name="discountMode"
                  value="custom"
                  checked={discountMode === "custom"}
                  onChange={() => setDiscountMode("custom")}
                  style={{ marginRight: 6 }}
                />
                Custom
              </label>
            </div>

            {/* PROMO UI */}
            {discountMode === "promo" && (
              <div style={{ marginBottom: "1rem" }}>
                <label>Choose Promotion</label>
                <select
                  value={selectedPromoId}
                  onChange={(e) => setSelectedPromoId(e.target.value)}
                >
                  <option value="">— Select a promotion —</option>
                  {promos.map((p) => {
                    const id = p._id || p.id;
                    return (
                      <option key={id} value={id}>
                        {p.name}{" "}
                        {p.type === "percentage"
                          ? `(${p.value}% off)`
                          : `(Rp.${Number(p.value || 0).toFixed(0)} off)`}
                      </option>
                    );
                  })}
                </select>

                {promosLoading && (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Loading promotions…
                  </p>
                )}
                {promosError && (
                  <p
                    className="muted"
                    style={{ marginTop: 8, color: "#b91c1c" }}
                  >
                    {promosError}
                  </p>
                )}

                {selectedPromo && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "#555" }}>
                    {selectedPromo.description && (
                      <div>- {selectedPromo.description}</div>
                    )}
                    {selectedPromo.minSubtotal ? (
                      <div>
                        - Min subtotal:{" "}
                        {formatCurrency(Number(selectedPromo.minSubtotal))}
                      </div>
                    ) : null}
                    {selectedPromo.maxDiscount ? (
                      <div>
                        - Max discount:{" "}
                        {formatCurrency(Number(selectedPromo.maxDiscount))}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6 }}>
                      <strong>Preview:</strong> will apply{" "}
                      <strong>{formatCurrency(promoDiscount)}</strong> now
                      (Subtotal: {formatCurrency(sub)})
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CUSTOM UI */}
            {discountMode === "custom" && (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontWeight: "bold", marginRight: "10px" }}>
                    <input
                      type="radio"
                      name="discountType"
                      value="flat"
                      checked={discountType === "flat"}
                      onChange={() => setDiscountType("flat")}
                      style={{ marginRight: "5px" }}
                    />
                    Flat (Rp.)
                  </label>

                  <label style={{ fontWeight: "bold" }}>
                    <input
                      type="radio"
                      name="discountType"
                      value="percentage"
                      checked={discountType === "percentage"}
                      onChange={() => setDiscountType("percentage")}
                      style={{ marginRight: "5px" }}
                    />
                    Percentage (%)
                  </label>
                </div>

                <label>Discount Value</label>
                <input
                  type="text"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percentage"
                      ? "e.g. 10 for 10%"
                      : "e.g. 5000 for Rp.5,000"
                  }
                />

                <label>Reason/Note</label>
                <textarea
                  rows="3"
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  placeholder="(Optional) Reason for discount..."
                />

                <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                  <strong>Preview:</strong> will apply{" "}
                  <strong>{formatCurrency(customDiscount)}</strong> now
                  (Subtotal: {formatCurrency(sub)})
                </div>
              </>
            )}

            <div className="discount-modal-actions">
              <button onClick={handleApplyDiscount}>Apply</button>
              <button onClick={handleCloseDiscountModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
