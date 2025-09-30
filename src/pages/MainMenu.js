// src/pages/MainMenu.jsx
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
import { printRaw, listPrinters } from "../utils/qzHelper";
import SafeImage from "../components/SafeImage";
import api from "../services/api";
import appLogo from "../images/logo.jpg";
import { normalizeImageUrl } from "../utils/driveUrl";
import {
  isAndroidBridge,
  androidListPrintersDetailed,
  androidPrintWithRetry,
  androidIsBtOn,
  androidPrintLogoAndText,
} from "../utils/androidBridge";
import { sendOrderEmail, EMAIL_COOLDOWN_SEC } from "../services/orderEmail";
import { formatIDR } from "../utils/money";

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
const MOBILE_BP = 900; // px

// Printer hints (desktop/QZ only)
const RECEIPT_PRINTER_HINT = /RPP02N/i;

const productImages = require.context(
  "../images",
  true,
  /\.(png|jpe?g|gif|webp)$/
);

function SkeletonCard() {
  return (
    <div className="product-card skeleton">
      <div className="skeleton-img shimmer" />
      <div className="skeleton-line shimmer" style={{ width: "70%" }} />
      <div className="skeleton-line shimmer" style={{ width: "50%" }} />
      <div
        className="skeleton-line shimmer"
        style={{ width: "40%", marginTop: 6 }}
      />
      <div className="skeleton-btn shimmer" />
    </div>
  );
}

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function getImageSrc(product) {
  const raw = product?.imageUrl || product?.image || "";
  if (!raw) return null;

  // Convert Google Drive links if needed
  const normalized = normalizeImageUrl(raw);

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) {
    return normalized;
  }

  try {
    return productImages("./" + normalized);
  } catch {
    return normalized;
  }
}

// ---------- Helpers ----------
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

function isAndroidChrome() {
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !window.AndroidPrinter;
}

function printReceiptViaSystem(html) {
  const w = window.open("", "_blank");
  if (!w) return alert("Pop-up blocked. Please allow pop-ups and try again.");
  w.document.open();
  w.document.write(html);
  w.document.close();
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
      (it) => `[L]<b>${Number(it.quantity || 0)} x ${it.name || "Item"}</b>\n`
    )
    .join("");
  return header + lines + `[C]------------------------------\n\n`;
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

// small hook for responsive layout
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return isMobile;
}

// ---------- Prefs / timing ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getPrinterPrefs() {
  return {
    receiptName: localStorage.getItem("printer.receipt") || "",
    kitchenName: localStorage.getItem("printer.kitchen") || "",
    receiptCopies: Math.max(
      1,
      Number(localStorage.getItem("printer.receiptCopies")) || 1
    ),
    kitchenCopies: Math.max(
      1,
      Number(localStorage.getItem("printer.kitchenCopies")) || 1
    ),
  };
}

// ---------- Component ----------
export default function MenuLayout() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // user
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  // email receipt (customer optional during checkout)
  const [wantEmailReceipt, setWantEmailReceipt] = useState(false);
  const [customerEmail, setCustomerEmail] = useState(user?.email || "");
  const [customerName, setCustomerName] = useState(user?.name || "");

  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Coffee");
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Delivery");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [orderNumber, setOrderNumber] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // desktop “Email Receipt” box
  const [email, setEmail] = useState(user?.email || "");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0);
  const [nowTsEmail, setNowTsEmail] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTsEmail(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const emailCooldownLeft = Math.max(
    0,
    Math.ceil((emailCooldownUntil - nowTsEmail) / 1000)
  );

  const handleEmailReceipt = async () => {
    if (!orderNumber) return alert("Place an order first.");
    if (!email) return alert("Enter an email address.");
    if (sendingEmail || emailCooldownLeft > 0) return;

    try {
      setSendingEmail(true);
      setEmailNotice("");
      setEmailError("");
      await sendOrderEmail(orderNumber, email); // optional 3rd arg: logoUrl
      setEmailNotice(`Receipt sent to ${email}.`);
      setEmailCooldownUntil(Date.now() + EMAIL_COOLDOWN_SEC * 1000);
    } catch (e) {
      console.error(e);
      setEmailError("Failed to send email. Please try again.");
    } finally {
      setSendingEmail(false);
    }
  };

  const PAUSE_AFTER_KOT_MS =
    Number(localStorage.getItem("print.pauseAfterKotMs")) || 1200;

  // mobile cart bottom sheet
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

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

  // fetch products
  useEffect(() => {
    (async () => {
      try {
        setLoadingProducts(true);
        const res = await api.get("/products");
        const list = Array.isArray(res.data)
          ? res.data
          : res.data && Array.isArray(res.data.items)
          ? res.data.items
          : [];
        setProducts(list);
      } catch (err) {
        console.error("Error fetching products:", err);
        setProducts([]);
      } finally {
        setLoadingProducts(false);
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

  const filteredProducts = useMemo(() => {
    const term = (searchTerm || "").toLowerCase();
    const list = Array.isArray(products) ? products : [];
    return list.filter((p) => {
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

      // Email customer (optional)
      sendEmail: wantEmailReceipt && !!(customerEmail || "").trim(),
      customerEmail: wantEmailReceipt
        ? (customerEmail || "").trim()
        : undefined,
      customerName: wantEmailReceipt ? (customerName || "").trim() : undefined,

      // Optional logo for email template
      logoUrl: appLogo,
    };

    try {
      const response = await api.post("/orders", orderData);
      const newOrderNumber = response.data?.orderNumber;
      setOrderNumber(newOrderNumber);

      // PRINT — Kitchen ticket FIRST, then customer receipt
      try {
        const { receiptCopies, kitchenCopies } = getPrinterPrefs();
        const dateStr = new Date().toLocaleString();

        const kotText = buildKitchenTicket({
          shopName: "Boonz Hauz",
          orderNumber: newOrderNumber || "N/A",
          dateStr,
          orderType: orderData.orderType,
          items: orderData.products,
          customer: { name: user?.name || "" },
        });

        let receiptText = buildReceipt({
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
        receiptText = receiptText.replace(/^[\s\r\n]+/, "");

        const logoPref = localStorage.getItem("print.logo") || appLogo;
        const logoDataUrl =
          typeof logoPref === "string" && logoPref.startsWith("data:")
            ? logoPref
            : await toDataUrl(logoPref);

        // ---------- ANDROID (WebView app) ----------
        if (isAndroidBridge()) {
          // Determine targets (prefer saved MAC; fallback to first paired)
          const paired = androidListPrintersDetailed();
          const fallbackAddr = paired[0]?.address || paired[0]?.name || "";

          const receiptTarget =
            localStorage.getItem("printer.receipt") || fallbackAddr;
          const kitchenTarget =
            localStorage.getItem("printer.kitchen") || fallbackAddr;

          if (!androidIsBtOn()) {
            window.alert(
              "Bluetooth is OFF. Please enable Bluetooth and try again."
            );
            throw new Error("Bluetooth disabled");
          }

          // KOT (text only; reliable)
          for (let i = 0; i < kitchenCopies; i++) {
            await androidPrintWithRetry(kotText, {
              address: kitchenTarget,
              nameLike: kitchenTarget,
              copies: 1,
              tries: 3,
              baseDelay: 500,
            });
          }

          await sleep(PAUSE_AFTER_KOT_MS);

          // Receipt (logo + text if bridge supports; else text)
          for (let i = 0; i < receiptCopies; i++) {
            const printedWithLogo = androidPrintLogoAndText(
              logoDataUrl,
              receiptText,
              {
                address: receiptTarget,
                nameLike: receiptTarget,
              }
            );

            if (!printedWithLogo) {
              await androidPrintWithRetry(receiptText, {
                address: receiptTarget,
                nameLike: receiptTarget,
                copies: 1,
                tries: 3,
                baseDelay: 500,
              });
            } else {
              await sleep(700); // let BT buffer flush
            }
          }

          // stop here; don't run desktop code
          return;
        }

        // ---------- ANDROID CHROME (no bridge): system print ----------
        if (isAndroidChrome()) {
          const html = buildReceiptHtml({
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
            logo: logoDataUrl,
          });
          printReceiptViaSystem(html);
        } else {
          // ---------- DESKTOP (QZ) ----------
          const printers = await listPrinters();
          if (!Array.isArray(printers) || printers.length === 0)
            throw new Error("No printers found (QZ).");
          const receiptPrinterName =
            printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];

          await printRaw(receiptPrinterName, kotText);
          await sleep(300);
          await printRaw(receiptPrinterName, receiptText);
        }
      } catch (printErr) {
        console.error("Printing failed:", printErr);
        window.alert(
          "Order saved, but printing failed: " +
            (printErr?.message || "Unknown error")
        );
      }

      // reset state relevant to the cart
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
    wantEmailReceipt,
    customerEmail,
    customerName,
  ]);

  /** Build a simple 58mm print HTML (system print) */
  function buildReceiptHtml({
    address,
    orderNumber,
    dateStr,
    items,
    subtotal,
    tax,
    service,
    discount,
    total,
    payment,
    orderType,
    customer,
    discountNote,
    logo,
  }) {
    const rows = (items || [])
      .map(
        (it) => `
      <tr>
        <td>${it.quantity || 0}× ${it.name || ""}</td>
        <td style="text-align:right">${formatIDR(Number(it.price || 0), {
          withDecimals: true,
        })}</td>
      </tr>`
      )
      .join("");

    return `
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: 58mm auto; margin: 0; }
  body { margin: 0; font-family: monospace; font-size: 12px; }
  .wrap { padding: 8px; }
  .c { text-align: center; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }
  .totals td { padding: 2px 0; }
  .bold { font-weight: 700; }
</style>
</head>
<body onload="setTimeout(()=>window.print(),300)">
  <div class="wrap">
    ${
      logo
        ? `<div class="c"><img src="${logo}" style="height:60px;object-fit:contain" /></div>`
        : ``
    }
    <div class="c">${address || ""}</div>
    <div class="line"></div>
    <div>Order #${orderNumber || "N/A"}</div>
    <div>Type : ${orderType || ""}</div>
    <div>Time : ${dateStr || ""}</div>
    ${customer?.name ? `<div>Cust : ${customer.name}</div>` : ""}
    <div class="line"></div>
    <table>${rows}</table>
    <div class="line"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td style="text-align:right">${formatIDR(subtotal, {
        withDecimals: true,
      })}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">${formatIDR(tax, {
        withDecimals: true,
      })}</td></tr>
      <tr><td>Service</td><td style="text-align:right">${formatIDR(service, {
        withDecimals: true,
      })}</td></tr>

      ${
        Number(discount || 0) > 0
          ? `<tr><td>Discount ${
              discountNote ? `(${discountNote})` : ""
            }</td><td style="text-align:right">-${formatIDR(discount, {
              withDecimals: true,
            })}</td></tr>`
          : ""
      }
      <tr class="bold"><td>Total</td><td style="text-align:right">${formatIDR(
        total,
        { withDecimals: true }
      )}</td></tr>
      <tr><td>Payment</td><td style="text-align:right">${
        payment || ""
      }</td></tr>
    </table>
    <div class="line"></div>
    <div class="c">Thank you!</div>
  </div>
</body></html>`;
  }

  // discount modal controls
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
                  placeholder="Search products..."
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

            {/* avatar dropdown */}
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
          {loadingProducts ? (
            <SkeletonGrid count={12} />
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">🍽️</div>
              <h3>No products in “{selectedCategory}”</h3>
              <p>Try another category or add new items to this menu.</p>
              <button
                className="empty-cta"
                onClick={() => navigate("/product-page")}
              >
                Add Product
              </button>
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map((prod) => {
                const key =
                  prod?._id ||
                  prod?.id ||
                  prod?.sku ||
                  Math.random().toString(36);
                const name = prod?.name || "Untitled";
                const desc = prod?.description || "";
                const priceNum = Number(prod?.price ?? 0);

                return (
                  <div key={key} className="product-card">
                    <SafeImage
                      className="product-image"
                      src={getImageSrc(prod)}
                      alt={name}
                    />
                    <h3 className="product-name">{name}</h3>
                    <p className="product-desc">{desc}</p>
                    <p className="product-price">
                      {formatIDR(priceNum, { withDecimals: true })}
                    </p>

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
          )}
        </div>

        {/* Floating Cart button (mobile only) */}
        <button
          className="fab-cart"
          aria-label="Open cart"
          onClick={() => setMobileCartOpen(true)}
          disabled={cart.length === 0}
        >
          <i className="fas fa-shopping-cart" />
          <span className="fab-cart__label">Cart</span>
          {cart.length > 0 && (
            <span className="fab-cart__badge">{cart.length}</span>
          )}
        </button>

        {/* Mobile Cart Sheet */}
        {isMobile && (
          <div className={`cart-sheet ${mobileCartOpen ? "open" : ""}`}>
            <div
              className="cart-sheet__backdrop"
              onClick={() => setMobileCartOpen(false)}
            />
            <div className="cart-sheet__panel" role="dialog" aria-label="Cart">
              <div className="cart-sheet__grab" />
              <div className="cart-sheet__head">
                <strong>Cart</strong>
                <button
                  className="cart-sheet__close"
                  onClick={() => setMobileCartOpen(false)}
                >
                  <i className="fas fa-times" />
                </button>
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
                      <p>
                        {formatIDR(Number(item.price ?? 0), {
                          withDecimals: true,
                        })}
                      </p>

                      <div className="cart-qty">
                        <button onClick={() => handleDecreaseQty(item.id)}>
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button onClick={() => handleIncreaseQty(item.id)}>
                          +
                        </button>
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

              <div className="cart-summary">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>{formatIDR(sub, { withDecimals: true })}</span>
                </div>
                <div className="summary-row">
                  <span>Tax (10%)</span>
                  <span>{formatIDR(tx, { withDecimals: true })}</span>
                </div>
                <div className="summary-row">
                  <span>Service Charge (5%)</span>
                  <span>{formatIDR(svc, { withDecimals: true })}</span>
                </div>
                <div className="summary-row">
                  <span>{discountLabel}</span>
                  <span>-{formatIDR(discount, { withDecimals: true })}</span>
                </div>
                <div className="summary-row total-row">
                  <strong>Total</strong>
                  <strong>{formatIDR(total, { withDecimals: true })}</strong>
                </div>

                <button
                  className="discount-btn"
                  onClick={handleOpenDiscountModal}
                >
                  Add Discount
                </button>
                <button
                  className="checkout-btn"
                  onClick={() => {
                    setMobileCartOpen(false);
                    handleCheckout();
                  }}
                  disabled={isSubmitting || cart.length === 0}
                >
                  {isSubmitting ? "Processing..." : "Checkout"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Cart (desktop) */}
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
                <p>{formatIDR(Number(item.price ?? 0))}</p>
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
            <span>{formatIDR(sub)}</span>
          </div>
          <div className="summary-row">
            <span>Tax (10%)</span>
            <span>{formatIDR(tx)}</span>
          </div>
          <div className="summary-row">
            <span>Service Charge (5%)</span>
            <span>{formatIDR(svc)}</span>
          </div>
          <div className="summary-row">
            <span>{discountLabel}</span>
            <span>-{formatIDR(discount)}</span>
          </div>
          <div className="summary-row total-row">
            <strong>Total</strong>
            <strong>{formatIDR(total)}</strong>
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

        {/* Email Receipt (desktop) */}
        <div className="email-receipt">
          <h4>Email Receipt (Optional)</h4>
          <div className="email-receipt__row">
            <input
              className="email-receipt__input"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="email-receipt__btn"
              onClick={handleEmailReceipt}
              disabled={!orderNumber || sendingEmail || emailCooldownLeft > 0}
              title={
                emailCooldownLeft > 0
                  ? `Resend in ${emailCooldownLeft}s`
                  : "Email receipt"
              }
            >
              {sendingEmail
                ? "Sending…"
                : emailCooldownLeft > 0
                ? `Resend in ${emailCooldownLeft}s`
                : "Email Receipt"}
            </button>
          </div>

          {emailNotice && <p className="email-receipt__note">{emailNotice}</p>}
          {emailError && <p className="email-receipt__error">{emailError}</p>}
        </div>
      </aside>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paymodal-title"
          onClick={() => !isSubmitting && setShowPaymentModal(false)}
        >
          <div
            className="paymodal__dialog"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3 id="paymodal-title">Select Payment Method</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <ul
                className="paylist"
                role="listbox"
                aria-label="Payment methods"
              >
                {[
                  { k: "Credit Card", i: "💳" },
                  { k: "Debit Card", i: "🏦" },
                  { k: "QRIS", i: "🔳" },
                  { k: "Go Pay", i: "🟦" },
                  { k: "Grab Pay", i: "🟩" },
                ].map(({ k, i }) => {
                  const selected = selectedPaymentMethod === k;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        className={`payitem ${selected ? "is-selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => setSelectedPaymentMethod(k)}
                      >
                        <span className="payitem__icon" aria-hidden="true">
                          {i}
                        </span>
                        <span className="payitem__label">{k}</span>
                        {selected && <span className="payitem__check">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <hr style={{ margin: "12px 0", borderTop: "1px solid #eee" }} />

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={wantEmailReceipt}
                  onChange={(e) => setWantEmailReceipt(e.target.checked)}
                />
                Email receipt to customer
              </label>

              {wantEmailReceipt && (
                <div style={{ marginTop: 10 }}>
                  <label
                    className="register-label"
                    style={{ display: "block", marginBottom: 4 }}
                  >
                    Customer Email (optional)
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="register-input"
                    autoComplete="email"
                  />
                  <label
                    className="register-label"
                    style={{ display: "block", marginTop: 10, marginBottom: 4 }}
                  >
                    Customer Name (optional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    className="register-input"
                  />
                </div>
              )}
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={confirmPayment}
                disabled={isSubmitting || !selectedPaymentMethod}
                title={
                  !selectedPaymentMethod
                    ? "Pick a method to continue"
                    : "Confirm payment"
                }
              >
                {isSubmitting ? "Confirming…" : "Confirm Payment"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowPaymentModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </footer>
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
                          : `(${formatIDR(Number(p.value || 0), {
                              withDecimals: true,
                            })} off)`}
                      </option>
                    );
                  })}
                </select>

                {promosLoading && (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Loading promotions...
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
                    {/* selected promo details */}
                    {selectedPromo.minSubtotal ? (
                      <div>
                        - Min subtotal:{" "}
                        {formatIDR(Number(selectedPromo.minSubtotal), {
                          withDecimals: true,
                        })}
                      </div>
                    ) : null}
                    {selectedPromo.maxDiscount ? (
                      <div>
                        - Max discount:{" "}
                        {formatIDR(Number(selectedPromo.maxDiscount), {
                          withDecimals: true,
                        })}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6 }}>
                      <strong>Preview:</strong> will apply{" "}
                      <strong>
                        {formatIDR(promoDiscount, { withDecimals: true })}
                      </strong>{" "}
                      now (Subtotal: {formatIDR(sub, { withDecimals: true })})
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
                  <strong>
                    {formatIDR(customDiscount, { withDecimals: true })}
                  </strong>
                  ( Subtotal: {formatIDR(sub, { withDecimals: true })} )
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
