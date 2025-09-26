import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import "./MainMenu.css";
import richardImage from "./ProfilePic.png";
import Sidebar from "./Sidebar";
import { buildReceipt } from "../receipt";
import { isAndroidBridge, androidPrintFormatted } from "../utils/androidBridge";
import { printRaw, listPrinters } from "../utils/qzHelper";
import SafeImage from "../components/SafeImage";
import api from "../services/api";

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

// Printer hints
const KITCHEN_PRINTER_HINTS = [/kitchen/i, /\bKOT\b/i];
const RECEIPT_PRINTER_HINT = /RPP02N/i;

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
    .map(
      (it) => `[L]<b>${Number(it.quantity || 0)} × ${it.name || "Item"}</b>\n`
    )
    .join("");
  return header + lines + `[C]------------------------------\n\n`;
}
function pickPrinter(printers, hints) {
  for (const h of hints) {
    const found = printers.find((p) => h.test(p));
    if (found) return found;
  }
  return printers[0];
}
async function printKitchenTicket(kotText) {
  if (isAndroidBridge()) {
    androidPrintFormatted(kotText, "KITCHEN");
    return;
  }
  const printers = await listPrinters();
  if (!Array.isArray(printers) || printers.length === 0)
    throw new Error("No printers found (QZ).");
  const printerName = pickPrinter(printers, KITCHEN_PRINTER_HINTS);
  await printRaw(printerName, kotText);
}
function computePromoDiscount(promo, subtotal) {
  if (!promo || !promo.active) return 0;
  if (promo.minSubtotal && subtotal < Number(promo.minSubtotal)) return 0;
  let d =
    promo.type === "percentage"
      ? subtotal * (Number(promo.value || 0) / 100)
      : Number(promo.value || 0);
  if (promo.maxDiscount && d > Number(promo.maxDiscount))
    d = Number(promo.maxDiscount);
  return Math.max(0, d);
}

// ---------- Component ----------
export default function MenuLayout() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Coffee");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Delivery");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [orderNumber, setOrderNumber] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // search
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchBar, setShowSearchBar] = useState(false);

  // promos
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState("");

  // discounts
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountMode, setDiscountMode] = useState("promo");
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState("flat");
  const [discountNote, setDiscountNote] = useState("");

  // user
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  // avatar dropdown
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () =>
      document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // fetch
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

  // derived
  const filteredProducts = useMemo(() => {
    const term = (searchTerm || "").toLowerCase();
    return (products || []).filter((p) => {
      const category = (p?.category ?? "").trim();
      const name = p?.name ?? "";
      return category === selectedCategory && name.toLowerCase().includes(term);
    });
  }, [products, searchTerm, selectedCategory]);

  const selectedPromo = useMemo(
    () => promos.find((p) => (p._id || p.id) === selectedPromoId) || null,
    [promos, selectedPromoId]
  );

  const sub = useMemo(
    () =>
      cart.reduce(
        (acc, it) => acc + Number(it.price ?? 0) * Number(it.quantity ?? 0),
        0
      ),
    [cart]
  );
  const tx = useMemo(() => sub * TAX_RATE, [sub]);
  const svc = useMemo(() => sub * SERVICE_CHARGE_RATE, [sub]);

  const customDiscount = useMemo(() => {
    const parsed = parseFloat(discountValue) || 0;
    if (discountMode !== "custom") return 0;
    return discountType === "percentage" ? sub * (parsed / 100) : parsed;
  }, [discountMode, discountType, discountValue, sub]);

  const promoDiscount = useMemo(() => {
    if (discountMode !== "promo") return 0;
    return computePromoDiscount(selectedPromo, sub);
  }, [discountMode, selectedPromo, sub]);

  const discount = useMemo(
    () =>
      Math.max(0, discountMode === "promo" ? promoDiscount : customDiscount),
    [discountMode, promoDiscount, customDiscount]
  );
  const total = useMemo(
    () => Math.max(0, sub + tx + svc - discount),
    [sub, tx, svc, discount]
  );

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

  // cart ops
  const handleAddToCart = useCallback((product) => {
    if (!product) return;
    const productId = product._id || product.id || product.sku;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === productId);
      if (existing)
        return prev.map((i) =>
          i.id === productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      return [
        ...prev,
        {
          ...product,
          price: Number(product.price ?? 0),
          quantity: 1,
          id: productId,
        },
      ];
    });
  }, []);
  const handleIncreaseQty = useCallback(
    (id) =>
      setCart((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
      ),
    []
  );
  const handleDecreaseQty = useCallback(
    (id) =>
      setCart((prev) =>
        prev.map((i) =>
          i.id === id && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i
        )
      ),
    []
  );
  const handleRemoveItem = useCallback(
    (id) => setCart((prev) => prev.filter((i) => i.id !== id)),
    []
  );

  // checkout
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

    let finalDiscountNote = (discountNote || "").trim();
    let promoMeta = null;
    if (discountMode === "promo") {
      if (selectedPromo) {
        finalDiscountNote = selectedPromo.name;
        promoMeta = {
          promoId: selectedPromo._id || selectedPromo.id,
          promoName: selectedPromo.name,
        };
      } else if (!finalDiscountNote) finalDiscountNote = "Promo";
    } else if (discount === 0 && !finalDiscountNote) {
      finalDiscountNote = "None";
    } else if (discount > 0 && !finalDiscountNote) {
      const parsed = parseFloat(discountValue) || 0;
      finalDiscountNote =
        discountType === "percentage"
          ? `Custom ${parsed}% Discount`
          : "Custom Flat Discount";
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
      discount,
      discountNote: finalDiscountNote,
      totalAmount: total,
      user: user?._id,
      orderType,
      paymentMethod: selectedPaymentMethod,
      discountMode,
      ...(promoMeta || {}),
    };

    try {
      const response = await api.post("/orders", orderData);
      const newOrderNumber = response.data?.orderNumber;
      setOrderNumber(newOrderNumber);

      try {
        const dateStr = new Date().toLocaleString();

        const kotText = buildKitchenTicket({
          shopName: "Boonz Hauz",
          orderNumber: newOrderNumber || "N/A",
          dateStr,
          orderType: orderData.orderType,
          items: orderData.products,
          customer: { name: user?.name || "" },
        });
        await printKitchenTicket(kotText);

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

  // discount modal
  const handleOpenDiscountModal = async () => {
    setShowDiscountModal(true);
    if (!promos.length && !promosLoading) await fetchPromos();
  };
  const handleCloseDiscountModal = () => setShowDiscountModal(false);
  const handleApplyDiscount = () => setShowDiscountModal(false);

  return (
    <div className="layout-container">
      <Sidebar onAddProduct={() => navigate("/product-page")} />

      <main className="layout-main">
        {/* Sticky top bar */}
        <div className="layout-topbar">
          {/* swipeable category chips */}
          <div className="chip-row" role="tablist" aria-label="Categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={cat === selectedCategory}
                className={`chip ${cat === selectedCategory ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* right controls */}
          <div className="topbar-actions">
            {!showSearchBar ? (
              <button
                className="icon-btn"
                aria-label="Search"
                onClick={() => setShowSearchBar(true)}
              >
                <i className="fas fa-search" />
              </button>
            ) : (
              <div className="search-wrap">
                <i className="fas fa-search search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search products…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
                <button
                  className="icon-btn"
                  aria-label="Close search"
                  onClick={() => {
                    setSearchTerm("");
                    setShowSearchBar(false);
                  }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            {/* avatar dropdown (name/email hidden by default) */}
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                className="avatar-btn"
                aria-label="Account"
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                <img src={richardImage} alt="User avatar" className="avatar" />
                <i className="fas fa-chevron-down caret" />
              </button>

              {userMenuOpen && (
                <div className="user-menu">
                  <div className="user-menu__head">
                    <img
                      src={richardImage}
                      alt="User avatar"
                      className="avatar lg"
                    />
                    <div className="user-text">
                      <strong>{user?.name || "User"}</strong>
                      <small>{user?.email || ""}</small>
                    </div>
                  </div>
                  <button
                    className="user-menu__item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/settings");
                    }}
                  >
                    <i className="fas fa-cog" /> Settings
                  </button>
                  <button
                    className="user-menu__item danger"
                    onClick={handleLogout}
                  >
                    <i className="fas fa-sign-out-alt" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="products-area">
          <h2 className="visually-hidden">{selectedCategory} Menu</h2>
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

            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  name="discountMode"
                  value="promo"
                  checked={discountMode === "promo"}
                  onChange={() => setDiscountMode("promo")}
                />
                Promotion
              </label>
              <label>
                <input
                  type="radio"
                  name="discountMode"
                  value="custom"
                  checked={discountMode === "custom"}
                  onChange={() => setDiscountMode("custom")}
                />
                Custom
              </label>
            </div>

            {discountMode === "promo" ? (
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
                  <div className="preview">
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
            ) : (
              <>
                <div className="radio-row" style={{ marginBottom: "1rem" }}>
                  <label>
                    <input
                      type="radio"
                      name="discountType"
                      value="flat"
                      checked={discountType === "flat"}
                      onChange={() => setDiscountType("flat")}
                    />
                    Flat (Rp.)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="discountType"
                      value="percentage"
                      checked={discountType === "percentage"}
                      onChange={() => setDiscountType("percentage")}
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

                <div className="preview">
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
