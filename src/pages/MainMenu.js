// src/pages/MainMenu.jsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { buildKitchenTicket } from "../kitchenReceipt";
import "./MainMenu.css";
import { FiArchive, FiChevronDown, FiCoffee, FiPlus, FiRefreshCw, FiSearch, FiShoppingBag, FiTag, FiX } from "react-icons/fi";
import ReceiptPreview from "../components/ReceiptPreview";
import Sidebar from "./Sidebar";
import { buildReceipt } from "../receipt";
import { printRaw, listPrinters } from "../utils/qzHelper";
import SafeImage from "../components/SafeImage";
import api from "../services/api";
import appLogo from "../images/logo.jpg";
import { normalizeImageUrl } from "../utils/driveUrl";
import { listCategories } from "../services/categories";
import {
  isAndroidBridge,
  androidListPrintersDetailed,
  androidPrintWithRetry,
  androidIsBtOn,
  androidPrintLogoAndText,
} from "../utils/androidBridge";
import { sendOrderEmail, EMAIL_COOLDOWN_SEC } from "../services/orderEmail";
import { fetchOrderCharges } from "../services/orderCharges";
import { formatIDR } from "../utils/money";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

/* ---------------- Constants ---------------- */
const MOBILE_BP = 900; // px
const RECEIPT_PRINTER_HINT = /RPP02N/i;

// Category UX preferences
const DEFAULT_CATEGORY = "All";

const productImages = require.context(
  "../images",
  true,
  /\.(png|jpe?g|gif|webp)$/
);

/* ---------------- Small components ---------------- */
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
function ChipsSkeleton({ count = 6 }) {
  const widths = [64, 72, 88, 70, 96, 84, 60, 90];
  return (
    <div className="chip-row" aria-hidden="true" style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            height: 32,
            width: widths[i % widths.length],
            borderRadius: 16,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06))",
            backgroundSize: "200% 100%",
            animation: "chip-shimmer 1.2s linear infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes chip-shimmer { 
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
    </div>
  );
}

function getImageSrc(product) {
  const raw = product?.imageUrl || product?.image || "";
  if (!raw) return null;
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

/* ---------------- Helpers ---------------- */
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
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

const toStr = (v) => (v == null ? "" : String(v));

/** Sanitize, collapse, and cap note length for safe printing & storage */
function normalizeNote(raw, max = 140) {
  const s = toStr(raw)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}
/** Escape for the HTML receipt path */
function escapeHtml(s) {
  return toStr(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractBtAddress(val) {
  const s = String(val || "");
  const m = s.match(/\(([^)]+)\)\s*$/);
  return (m && m[1]) || s;
}

function promoUnavailable(promo, subtotal, now = Date.now()) {
  if (!promo?.active) return "Promotion is inactive.";
  if (promo.startsAt && Date.parse(promo.startsAt) > now) return "Promotion hasn’t started.";
  if (promo.endsAt && Date.parse(promo.endsAt) < now) return "Promotion has ended.";
  if (subtotal < Number(promo.minSubtotal || 0)) return "Order subtotal is below the minimum.";
  return "";
}

function computePromoDiscount(promo, subtotal) {
  if (promoUnavailable(promo, subtotal)) return 0;
  let d =
    promo.type === "percentage"
      ? subtotal * (Number(promo.value || 0) / 100)
      : Number(promo.value || 0);
  if (promo.maxDiscount && d > Number(promo.maxDiscount))
    d = Number(promo.maxDiscount);
  return Math.max(0, d);
}
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BP : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const h = (e) => setIsMobile(e.matches);
    h(mq);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return isMobile;
}
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
function deriveCategoryNames(products = []) {
  const set = new Set();
  products.forEach((p) => {
    const c = (p?.category || "").trim();
    if (c) set.add(c);
  });
  return Array.from(set);
}
const includesCI = (arr, name) =>
  arr.some((n) => n.toLowerCase() === (name || "").toLowerCase());

function buildOrderedChips(apiCats, prodCats) {
  const map = new Map();
  const add = (name) => {
    const clean = (name || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!map.has(key)) map.set(key, clean);
  };
  apiCats.forEach(add);
  [...prodCats].sort((a, b) => a.localeCompare(b)).forEach(add);
  map.delete("all");
  return ["All", ...map.values()];
}

/* ---------------- Component ---------------- */
export default function MenuLayout() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { show } = useToast();
  const confirm = useConfirm();

  const [taxEnabled, setTaxEnabled] = useState(false);
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(0); // decimals, e.g. 0.10
  const [serviceRate, setServiceRate] = useState(0);
  const [chargesState, setChargesState] = useState("loading");

  const reloadCharges = useCallback(async () => {
    setChargesState("loading");
    try {
      const charges = await fetchOrderCharges();
      setTaxEnabled(Boolean(charges.taxEnabled));
      setServiceEnabled(Boolean(charges.serviceEnabled));
      setTaxRate(Number(charges.taxRate) || 0);
      setServiceRate(Number(charges.serviceRate) || 0);
      setChargesState("ready");
    } catch {
      setChargesState("error");
    }
  }, []);

  useEffect(() => { reloadCharges(); }, [reloadCharges]);

  // categories from API (preferred)
  const [categories, setCategories] = useState([]); // [{_id, name}]
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);

  // user
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);
  const isAdmin = user?.role === "admin" || user?.isAdmin === true;
  const initials = (user?.name || user?.email || "Boonz").trim().split(/\s+/)
    .slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();

  const draftKey = user ? `boonz.register.draft:${user._id || user.id || user.email || user.name}` : "";
  const initialDraft = useMemo(() => {
    if (!draftKey) return {};
    try {
      return JSON.parse(sessionStorage.getItem(draftKey)) || {};
    } catch {
      return {};
    }
  }, [draftKey]);
  const [customerEmail, setCustomerEmail] = useState(initialDraft.customerEmail || "");
  const [customerName, setCustomerName] = useState(initialDraft.customerName || "");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [cart, setCart] = useState(Array.isArray(initialDraft.cart) ? initialDraft.cart : []);
  const [orderType, setOrderType] = useState(initialDraft.orderType || "Delivery");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [receiptOrderId, setReceiptOrderId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const [coffeeCustomize, setCoffeeCustomize] = useState({
    open: false,
    product: null,
    temperature: "Ice",
  });

  /* ---- NEW: Post-payment print dialog state ---- */
  const [printDialog, setPrintDialog] = useState(null);
  const [printBusy, setPrintBusy] = useState(""); // "", "kitchen", "receipt"

  const [openBills, setOpenBills] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("openBills") || "[]");
      return Array.isArray(stored) ? stored.filter((bill) => bill?.orderData) : [];
    } catch {
      return [];
    }
  });
  const [showOpenBills, setShowOpenBills] = useState(false);
  const [resuming, setResuming] = useState(initialDraft.resuming || null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /* ---- Drink customization & toppings ---- */
  const TOPPING_PRICE_IDR = 4000;
  const DRINK_CATEGORIES = ["Drink"];

  // Show toppings section only when the **base drink SKU** starts with TPD
  const isToppingSku = (sku) =>
    typeof sku === "string" && sku.toUpperCase().startsWith("DRT");

  // We store a SKU-like code per topping mostly for clarity in notes/metadata
  const TOPPING_OPTIONS = [
    { sku: "TPD-BB-040", name: "Boba" },
    { sku: "TPD-GJ-040", name: "Grass Jelly" },
    { sku: "TPD-LJ-040", name: "Lychee Jelly" },
  ];

  /* ---- Fries flavors ---- */
  const FRIES_FLAVORS = ["Truffle Mayo", "Garlic", "Cheese"];
  const isFries = (p) => {
    const name = (p?.name || "").toLowerCase();
    const sku = (p?.sku || "").toUpperCase();
    return name.includes("fries") || sku.startsWith("FRY");
  };

  /* ---- Onion Rings flavors (same as fries) ---- */
  const ONION_RINGS_FLAVORS = ["Truffle Mayo", "Garlic", "Cheese"];
  const isOnionRings = (p) => {
    const name = (p?.name || "").toLowerCase();
    const sku = (p?.sku || "").toUpperCase();
    return name.includes("onion rings") || sku.startsWith("ONR") || sku.includes("ONR");
  };

  /* ---- Burger cut options ---- */
  const isBurger = (p) => {
    const name = (p?.name || "").toLowerCase();
    const sku = (p?.sku || "").toUpperCase();
    return (
      name.includes("burger") ||
      sku.startsWith("BRG") ||
      name.includes("smoky") ||
      name.startsWith("truffle") ||
      name.startsWith("double") ||
      name.startsWith("crispy")
    );
  };

  const COFFEE_KEYWORDS = [
    "latte",
    "cappuccino",
    "americano",
    "long black",
    "mocha",
    "espresso",
    "macchiato",
    "flat white",
    "cold brew",
    "dalgona",
    "affogato",
  ];

  const isCoffee = (p) => {
    const name = (p?.name || "").toLowerCase();
    const cat = (p?.category || "").trim().toLowerCase();

    if (cat === "coffee") return true; // primary signal
    return COFFEE_KEYWORDS.some((k) => name.includes(k));
  };

  const SODA_KEYWORDS = [
    "soda",
    "sparkling",
    "cola",
    "coke",
    "fizz",
    "tonic",
    "fanta",
    "sprite",
    "mineral",
    "water",
  ];

  const isSoda = (p) => {
    const name = (p?.name || "").toLowerCase();
    const cat = (p?.category || "").trim().toLowerCase();

    // match by category, sku prefix, or keyword
    return (
      cat === "soda" ||
      cat === "water" ||
      SODA_KEYWORDS.some((k) => name.includes(k))
    );
  };

  /* ---- Qty change ---- */
  const handleDecreaseQty = useCallback((id) => {
    setCart((prev) =>
      prev.reduce((acc, it) => {
        if (it.id !== id) {
          acc.push(it);
          return acc;
        }
        const q = Number(it.quantity || 0);
        if (q <= 1) {
          return acc; // remove
        }
        acc.push({ ...it, quantity: q - 1 });
        return acc;
      }, [])
    );
  }, []);

  const openCoffeeCustomize = useCallback((product) => {
    setCoffeeCustomize({ open: true, product, temperature: "Ice" });
  }, []);

  const cancelCoffeeCustomize = useCallback(() => {
    setCoffeeCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);

  const applyCoffeeCustomize = useCallback(() => {
    const { product, temperature } = coffeeCustomize;
    if (!product) return;

    const note = `Temp: ${temperature}`;
    const baseId = product._id || product.id || product.sku || product.name;
    const uniqueId = `${baseId}-${Date.now()}`;

    setCart((prev) => [
      ...prev,
      {
        ...product,
        id: uniqueId,
        quantity: 1,
        note,
        options: { temperature },
      },
    ]);

    setCoffeeCustomize({ open: false, product: null, temperature: "Ice" });
  }, [coffeeCustomize, setCart]);

  const [sodaCustomize, setSodaCustomize] = useState({
    open: false,
    product: null,
    ice: "Ice",
  });

  const openSodaCustomize = useCallback((product) => {
    setSodaCustomize({ open: true, product, ice: "Ice" });
  }, []);

  const cancelSodaCustomize = useCallback(() => {
    setSodaCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);

  const applySodaCustomize = useCallback(() => {
    const { product, ice } = sodaCustomize;
    if (!product) return;

    const note = `Ice: ${ice}`;
    const baseId = product._id || product.id || product.sku || product.name;
    const uniqueId = `${baseId}-${Date.now()}`;

    setCart((prev) => [
      ...prev,
      {
        ...product,
        id: uniqueId,
        quantity: 1,
        note,
        options: { ice },
      },
    ]);

    setSodaCustomize({ open: false, product: null, ice: "Ice" });
  }, [sodaCustomize, setCart]);

  /* ---- Fries modal state ---- */
  const [friesCustomize, setFriesCustomize] = useState({
    open: false,
    product: null,
    flavor: "Truffle Mayo",
  });
  const openFriesCustomize = useCallback((product) => {
    setFriesCustomize({ open: true, product, flavor: "Truffle Mayo" });
  }, []);
  const cancelFriesCustomize = useCallback(() => {
    setFriesCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);
  const applyFriesCustomize = useCallback(() => {
    const { product, flavor } = friesCustomize;
    if (!product) return;

    const note = `Flavor: ${flavor}`;
    const productId = product._id || product.id || product.sku;
    setCart((prev) => [
      ...prev,
      {
        ...product,
        price: Number(product.price ?? 0),
        quantity: 1,
        id: `${productId}-${Date.now()}`, // keep lines separate per flavor
        note,
        options: { flavor },
      },
    ]);

    setFriesCustomize({ open: false, product: null, flavor: "Truffle Mayo" });
  }, [friesCustomize, setCart]);

  /* ---- Onion Rings modal state ---- */
  const [onionRingsCustomize, setOnionRingsCustomize] = useState({
    open: false,
    product: null,
    flavor: "Truffle Mayo",
  });
  const openOnionRingsCustomize = useCallback((product) => {
    setOnionRingsCustomize({ open: true, product, flavor: "Truffle Mayo" });
  }, []);
  const cancelOnionRingsCustomize = useCallback(() => {
    setOnionRingsCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);
  const applyOnionRingsCustomize = useCallback(() => {
    const { product, flavor } = onionRingsCustomize;
    if (!product) return;

    const note = `Flavor: ${flavor}`;
    const productId = product._id || product.id || product.sku;
    setCart((prev) => [
      ...prev,
      {
        ...product,
        price: Number(product.price ?? 0),
        quantity: 1,
        id: `${productId}-${Date.now()}`, // keep lines separate per flavor
        note,
        options: { flavor },
      },
    ]);

    setOnionRingsCustomize({ open: false, product: null, flavor: "Truffle Mayo" });
  }, [onionRingsCustomize, setCart]);

  /* ---- Burger customize (cut style) ---- */
  const [burgerCustomize, setBurgerCustomize] = useState({
    open: false,
    product: null,
    cut: "Whole",
  });
  const openBurgerCustomize = useCallback((product) => {
    setBurgerCustomize({ open: true, product, cut: "Whole" });
  }, []);
  const cancelBurgerCustomize = useCallback(() => {
    setBurgerCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);
  const applyBurgerCustomize = useCallback(() => {
    const { product, cut } = burgerCustomize;
    if (!product) return;

    const note = `Cut: ${cut}`;
    const productId = product._id || product.id || product.sku || product.name;
    setCart((prev) => [
      ...prev,
      {
        ...product,
        price: Number(product.price ?? 0),
        quantity: 1,
        id: `${productId}-${Date.now()}`, // unique per cut selection
        note,
        options: { cut },
      },
    ]);

    setBurgerCustomize({ open: false, product: null, cut: "Whole" });
  }, [burgerCustomize, setCart]);

  /* ---- Categories ---- */
  const reloadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const cats = await listCategories();
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  /* ---- Note modal (edit per-line custom note) ---- */
  const [noteModal, setNoteModal] = useState({
    open: false,
    id: null,
    text: "",
  });
  const openNoteModal = useCallback((item) => {
    setNoteModal({
      open: true,
      id: item.id,
      text: (item.note || "").toString(),
    });
  }, []);
  const closeNoteModal = useCallback(() => {
    setNoteModal({ open: false, id: null, text: "" });
  }, []);
  const saveNoteModal = useCallback(() => {
    const normalized = normalizeNote(noteModal.text);
    setCart((prev) =>
      prev.map((i) => (i.id === noteModal.id ? { ...i, note: normalized } : i))
    );
    closeNoteModal();
  }, [noteModal, closeNoteModal, setCart]);

  /* ---- Drink customize modal state ---- */
  const [customize, setCustomize] = useState({
    open: false,
    product: null,
    sugar: "Full",
    ice: "Normal",
    toppings: [], // array of topping SKUs
    temperature: "Ice",
  });
  const openCustomize = useCallback((product) => {
    setCustomize({
      open: true,
      product,
      sugar: "Full",
      ice: "Normal",
      toppings: [],
      temperature: "Ice",
    });
  }, []);
  const cancelCustomize = useCallback(() => {
    setCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);

  const applyCustomize = useCallback(() => {
    const { product, sugar, ice, toppings, temperature } = customize;
    if (!product) return;

    const basePrice = Number(product.price ?? 0);
    const toppingCount = Array.isArray(toppings) ? toppings.length : 0;
    const extra = toppingCount * TOPPING_PRICE_IDR;
    const finalUnitPrice = basePrice + extra;

    const chosenToppings =
      toppingCount > 0
        ? ` | Toppings: ${toppings
            .map(
              (sku) => TOPPING_OPTIONS.find((x) => x.sku === sku)?.name || sku
            )
            .join(", ")}`
        : "";

    const effectiveIce = temperature === "Hot" ? "No" : ice; // Hot implies no ice
    const note = `Temp: ${temperature} | Sugar: ${sugar} | Ice: ${effectiveIce}${chosenToppings}`;

    const baseId = product._id || product.id || product.sku || product.name;
    const uniqueId = `${baseId}-${Date.now()}`;

    setCart((prev) => [
      ...prev,
      {
        ...product,
        price: finalUnitPrice, // include topping add-on(s)
        quantity: 1,
        id: uniqueId,
        note,
        options: {
          sugar,
          ice: effectiveIce,
          toppings: Array.from(toppings || []),
          toppingUnitAddOn: TOPPING_PRICE_IDR,
          temperature, // NEW
        },
      },
    ]);

    setCustomize({
      open: false,
      product: null,
      sugar: "Normal",
      ice: "Normal",
      toppings: [],
      temperature: "Ice", // reset
    });
  }, [customize, setCart]);

  /* ---- Email receipt (desktop box) ---- */
  const [email, setEmail] = useState("");
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
    if (!receiptOrderId) {
      show("Place an order first.", { type: "info" });
      return;
    }
    if (!email) {
      show("Enter an email address.", { type: "warning" });
      return;
    }
    if (sendingEmail || emailCooldownLeft > 0) return;
    try {
      setSendingEmail(true);
      setEmailNotice("");
      setEmailError("");
      await sendOrderEmail(receiptOrderId, email);
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
    Number(localStorage.getItem("print.pauseAfterKotMs")) || 3000;

  /* ---- Bottom sheet (mobile) ---- */
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  /* ---- Search ---- */
  const [searchTerm, setSearchTerm] = useState("");
  const searchInput = useRef(null);

  /* ---- Promotions / discount ---- */
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState("");

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const discountBeforeEdit = useRef(null);
  const [discountMode, setDiscountMode] = useState(initialDraft.discountMode || "promo");
  const [selectedPromoId, setSelectedPromoId] = useState(initialDraft.selectedPromoId || "");
  const [discountValue, setDiscountValue] = useState(initialDraft.discountValue || "");
  const [discountType, setDiscountType] = useState(initialDraft.discountType || "flat");
  const [discountNote, setDiscountNote] = useState(initialDraft.discountNote || "");

  useEffect(() => {
    if (!draftKey || showDiscountModal) return;
    try {
      if (cart.length) {
        sessionStorage.setItem(draftKey, JSON.stringify({
          cart, orderType, customerName, customerEmail, discountMode,
          selectedPromoId, discountValue, discountType, discountNote, resuming,
        }));
      } else {
        sessionStorage.removeItem(draftKey);
      }
    } catch {
      // The active order remains available in memory when browser storage is unavailable.
    }
  }, [draftKey, showDiscountModal, cart, orderType, customerName, customerEmail,
    discountMode, selectedPromoId, discountValue, discountType, discountNote, resuming]);

  /* ---- Avatar dropdown ---- */
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

  /* ---- Hard reset (local settings only) ---- */
  const handleHardReset = useCallback(async () => {
    const confirmed = await confirm({
      title: "Clear local settings?",
      message:
        "This will clear local settings (printers, logo, email cooldowns, UI prefs). Your login will stay signed in. Continue?",
      confirmText: "Yes, clear all",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    const keep = new Set(["token", "refreshToken", "user", "openBills"]);
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!keep.has(key)) toRemove.push(key);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      try {
        sessionStorage.clear();
      } catch {}
      try {
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {}
      try {
        const idbDbs = ["keyval-store"];
        idbDbs.forEach((name) => {
          try {
            indexedDB.deleteDatabase(name);
          } catch {}
        });
      } catch {}
    } finally {
      window.location.reload();
    }
  }, []);

  /* ---- Auth guard ---- */
  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  const reloadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError("");
    try {
      const { data } = await api.get("/products");
      const list = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(list)) throw new Error("Unexpected catalog response");
      setProducts(list);
    } catch {
      setProductsError("Couldn’t load the menu.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    reloadProducts();
  }, [reloadProducts]);

  /* ---- Load categories on mount ---- */
  useEffect(() => {
    reloadCategories();
  }, [reloadCategories]);

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

  /* ---------- Chips (stable order) ---------- */
  const chipNames = useMemo(() => {
    const fromApi = (categories || []).map((c) => c?.name).filter(Boolean);
    const fromProducts = deriveCategoryNames(products);
    return buildOrderedChips(fromApi, fromProducts);
  }, [categories, products]);

  const dataReady = !loadingProducts && !categoriesLoading;
  const chipReady = dataReady && chipNames.length > 0;

  useEffect(() => {
    if (chipReady && !includesCI(chipNames, selectedCategory)) setSelectedCategory("All");
  }, [chipReady, chipNames, selectedCategory]);

  useEffect(() => {
    if (initialDraft.selectedPromoId) fetchPromos();
  }, [initialDraft, fetchPromos]);

  const query = searchTerm.trim().toLowerCase();
  const filteredProducts = useMemo(() => products.filter((product) => {
    const category = String(product.category || "").trim().toLowerCase();
    if (!query) return selectedCategory === "All" || category === selectedCategory.toLowerCase();
    return [product.name, product.sku, product.category].some(
      (value) => String(value || "").toLowerCase().includes(query)
    );
  }), [products, query, selectedCategory]);

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
  const tx = useMemo(
    () => (taxEnabled ? sub * taxRate : 0),
    [sub, taxEnabled, taxRate]
  );
  const svc = useMemo(
    () => (serviceEnabled ? sub * serviceRate : 0),
    [sub, serviceEnabled, serviceRate]
  );

  const customDiscount = useMemo(() => {
    const parsed = parseFloat(discountValue) || 0;
    if (discountMode !== "custom") return 0;
    return discountType === "percentage" ? sub * (parsed / 100) : parsed;
  }, [discountMode, discountType, discountValue, sub]);

  const promoDiscount = discountMode === "promo" ? computePromoDiscount(selectedPromo, sub) : 0;

  const discount = useMemo(
    () =>
      Math.min(sub + tx + svc, Math.max(0, discountMode === "promo" ? promoDiscount : customDiscount)),
    [sub, tx, svc, discountMode, promoDiscount, customDiscount]
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

  /* ---------- Cart ops ---------- */
  const handleAddToCart = useCallback(
    (product) => {
      if (!product) return;

      // 1) Drinks -> customization modal
      if (isCoffee(product)) {
        openCoffeeCustomize(product);
        return;
      }

      if (isSoda(product)) {
        openSodaCustomize(product);
        return;
      }
      if (DRINK_CATEGORIES.includes(product.category)) {
        openCustomize(product);
        return;
      }

      // 2) Fries -> flavor modal
      if (isFries(product)) {
        openFriesCustomize(product);
        return;
      }

      // 2.5) Onion Rings -> flavor modal
      if (isOnionRings(product)) {
        openOnionRingsCustomize(product);
        return;
      }

      // 3) Burger -> cut modal
      if (isBurger(product)) {
        openBurgerCustomize(product);
        return;
      }

      // 4) Default path (no customization)
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
            note: "",
          },
        ];
      });
    },
    [
      openCustomize,
      openFriesCustomize,
      openOnionRingsCustomize,
      openBurgerCustomize,
      openCoffeeCustomize,
      openSodaCustomize,
    ]
  );

  const handleIncreaseQty = useCallback(
    (id) =>
      setCart((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
      ),
    []
  );

  const itemCount = cart.reduce((count, item) => count + item.quantity, 0);

  function addSearchResult(event) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !query) return;
    event.preventDefault();
    const exactMatch = products.find((product) => String(product.sku || "").toLowerCase() === query);
    const product = exactMatch || (filteredProducts.length === 1 ? filteredProducts[0] : null);
    if (product) {
      handleAddToCart(product);
      setSearchTerm("");
    }
  }

  function resetCart() {
    setCart([]);
    setResuming(null);
    setCustomerName("");
    setCustomerEmail("");
    setSelectedPromoId("");
    setDiscountMode("promo");
    setDiscountValue("");
    setDiscountNote("");
    setDiscountType("flat");
    setOrderType("Delivery");
    setSelectedPaymentMethod("");
  }

  function saveOpenBills(bills) {
    try {
      localStorage.setItem("openBills", JSON.stringify(bills));
      setOpenBills(bills);
      return true;
    } catch {
      show("Couldn’t save held orders on this device.", { type: "error" });
      return false;
    }
  }

  function holdOrder() {
    if (!itemCount || submitting.current) return;
    const orderNumber = resuming || `Draft-${Date.now()}`;
    const draft = {
      orderNumber,
      createdAt: new Date().toISOString(),
      customerName,
      customerEmail,
      orderData: {
        products: cart.map((item) => ({
          productId: item._id || item.id,
          name: item.name,
          quantity: item.quantity,
          price: Number(item.price ?? 0),
          note: item.note,
          options: item.options,
        })),
        orderType,
        discountMode,
        discountType,
        discountValue,
        discountNote,
        promoId: selectedPromoId,
        discount,
        totalAmount: total,
      },
    };
    const bills = [...openBills.filter((bill) => bill.orderNumber !== orderNumber), draft];
    if (!saveOpenBills(bills)) return;
    resetCart();
    setMobileCartOpen(false);
    show("Order held on this device.", { type: "success" });
  }

  async function confirmPayment(event) {
    event.preventDefault();
    if (!user || !selectedPaymentMethod || !itemCount || !online || chargesState !== "ready" || submitting.current) return;
    if (discountMode === "custom" && discount > 0 && (!isAdmin || !discountNote.trim())) {
      show("An admin must add a reason for a manual discount.", { type: "error" });
      return;
    }
    const promoReason = selectedPromoId && discountMode === "promo"
      ? promoUnavailable(selectedPromo, sub) : "";
    if (promoReason) {
      show(`${promoReason} Review the discount before recording payment.`, { type: "error" });
      setShowPaymentModal(false);
      await handleOpenDiscountModal();
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    const finalDiscountNote = (discountMode === "promo" ? selectedPromo?.name : discountNote.trim())
      || (discount > 0 ? "Custom discount" : "None");
    const orderData = {
      products: cart.map((item) => ({
        productId: item._id || item.id,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price ?? 0),
        note: normalizeNote(item.note) || undefined,
        options: item.options || {},
      })),
      discount,
      discountNote: finalDiscountNote,
      orderType,
      paymentMethod: selectedPaymentMethod,
      ...(discountMode === "promo" && selectedPromo ? { promoId: selectedPromo._id || selectedPromo.id } : {}),
      sendEmail: Boolean(customerEmail.trim()),
      customerEmail: customerEmail.trim() || undefined,
      customerName: customerName.trim() || undefined,
    };

    try {
      const { data: saved } = await api.post("/orders", orderData);
      const newOrderNumber = saved.orderNumber;
      setReceiptOrderId(saved._id || saved.id || newOrderNumber);
      setEmail(customerEmail.trim());
      setEmailNotice(saved.emailSent ? `Receipt sent to ${customerEmail.trim()}.` : "");
      setEmailCooldownUntil(saved.emailSent ? Date.now() + EMAIL_COOLDOWN_SEC * 1000 : 0);
      setEmailError(orderData.sendEmail && !saved.emailSent ? "The order was recorded. The receipt email failed." : "");
      const dateStr = new Date(saved.createdAt || Date.now()).toLocaleString();
      const customer = { name: saved.customerName || orderData.customerName };
      const items = orderData.products.map((item) => ({
        ...item,
        name: item.note ? `${item.name} [${item.note}]` : item.name,
      }));
      const document = {
        shopName: "Boonz",
        address: "Jl. Mekar Utama No. 61, Bandung",
        orderNumber: newOrderNumber,
        dateStr,
        items,
        subtotal: saved.subtotal ?? sub,
        tax: saved.tax ?? tx,
        service: saved.serviceCharge ?? svc,
        showTax: taxEnabled,
        showService: serviceEnabled,
        discount: saved.discount ?? discount,
        total: saved.totalAmount ?? total,
        payment: saved.paymentMethod || selectedPaymentMethod,
        orderType,
        customer,
        discountNote: finalDiscountNote,
      };
      const logo = localStorage.getItem("print.logo") || appLogo;
      if (resuming) {
        const remaining = openBills.filter((bill) => bill.orderNumber !== resuming);
        if (!saveOpenBills(remaining)) setOpenBills(remaining);
      }
      resetCart();
      setShowPaymentModal(false);
      setMobileCartOpen(false);
      setPrintDialog({
        ...document,
        logo,
        kotText: buildKitchenTicket({ orderNumber: newOrderNumber, dateStr, orderType, items: orderData.products, customer }),
        receiptText: buildReceipt(document) + "\n\n",
      });
      show(`Order #${newOrderNumber} recorded.`, { type: "success" });
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error;
      show(typeof message === "string" && error.response.status < 500
        ? message : "Couldn’t confirm the order. Check Orders before trying payment again.", { type: "error" });
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  /* ==========================
     NEW: Manual print handlers
     ========================== */
  async function handlePrintKitchen(kotText) {
    if (!kotText) return;
    try {
      setPrintBusy("kitchen");

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) {
          show("⚠️ Bluetooth is OFF. Please enable it and try again.", {
            type: "error",
            ttl: 5000,
          });
          return;
        }
        const paired = androidListPrintersDetailed();
        const fallbackAddr = paired[0]?.address || paired[0]?.name || "";
        const kitchenTarget =
          extractBtAddress(localStorage.getItem("printer.kitchen")) ||
          fallbackAddr;

        const { kitchenCopies } = getPrinterPrefs();
        for (let i = 0; i < kitchenCopies; i++) {
          await androidPrintWithRetry(kotText, {
            address: kitchenTarget,
            nameLike: kitchenTarget,
            copies: 1,
            tries: 3,
            baseDelay: 500, // Reduced from 3000ms for faster printing
          });
        }
        // Reduced pause time - only wait if multiple copies
        if (kitchenCopies > 1) {
          await sleep(Math.min(PAUSE_AFTER_KOT_MS, 1000));
        }
        show("Kitchen ticket sent.", { type: "success" });
        return;
      }

      // Desktop / QZ (fallback)
      const printers = await listPrinters();
      if (!Array.isArray(printers) || printers.length === 0)
        throw new Error("No printers found (QZ).");

      const preferred =
        printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];

      await printRaw(preferred, kotText);
      show("Kitchen ticket printed.", { type: "success" });
    } catch (err) {
      console.error(err);
      show("Failed to print kitchen ticket: " + (err?.message || "Unknown"), {
        type: "error",
      });
    } finally {
      setPrintBusy("");
    }
  }

  async function handlePrintReceipt(receiptText, logoDataUrl) {
    if (!receiptText) return;
    try {
      setPrintBusy("receipt");

      if (isAndroidBridge()) {
        if (!androidIsBtOn()) {
          show("⚠️ Bluetooth is OFF. Please enable it and try again.", {
            type: "error",
            ttl: 5000,
          });
          return;
        }
        const paired = androidListPrintersDetailed();
        const fallbackAddr = paired[0]?.address || paired[0]?.name || "";
        const receiptTarget =
          extractBtAddress(localStorage.getItem("printer.receipt")) ||
          fallbackAddr;

        const { receiptCopies } = getPrinterPrefs();
        for (let i = 0; i < receiptCopies; i++) {
          const logo = logoDataUrl?.startsWith("data:")
            ? logoDataUrl : await toDataUrl(logoDataUrl || appLogo).catch(() => "");
          const res = logo ? await androidPrintLogoAndText(logo, receiptText, {
            address: receiptTarget,
            nameLike: receiptTarget,
          }) : null;
          if (!res?.text) {
            await androidPrintWithRetry(receiptText + "\n\n\n", {
              address: receiptTarget,
              nameLike: receiptTarget,
              copies: 1,
              tries: 3,
              baseDelay: 500,
            });
          } else {
            await sleep(800);
          }
        }
        show("Receipt sent.", { type: "success" });
        return;
      }

      if (isAndroidChrome()) {
        // Fallback simple print content
        const ok = printReceiptViaSystem(
          `<pre style="white-space:pre-wrap">${escapeHtml(receiptText)}</pre>`
        );
        if (!ok) {
          show("Pop-up blocked. Please allow pop-ups and try again.", {
            type: "error",
            ttl: 4000,
          });
        } else {
          show("Receipt opened in system print.", { type: "success" });
        }
        return;
      }

      // Desktop / QZ (fallback)
      const printers = await listPrinters();
      if (!Array.isArray(printers) || printers.length === 0)
        throw new Error("No printers found (QZ).");

      const preferred =
        printers.find((p) => RECEIPT_PRINTER_HINT.test(p)) || printers[0];

      await printRaw(preferred, receiptText);
      show("Receipt printed.", { type: "success" });
    } catch (err) {
      console.error(err);
      show("Failed to print receipt: " + (err?.message || "Unknown"), {
        type: "error",
      });
    } finally {
      setPrintBusy("");
    }
  }

  /* ---- Re-print Functions ---- */
  async function handleReprintKitchen(bill) {
    if (!bill.kotText) {
      // Generate KOT text if not available
      const dateStr = new Date(bill.createdAt).toLocaleString();
      const kitchenItems = (bill.orderData.products || []).map((it) => ({
        name: it.name || "Item",
        quantity: Number(it.quantity) || 0,
        note: it.note || "",
        options: it.options || {},
      }));
      const kotText = buildKitchenTicket({
        orderNumber: bill.orderNumber || "N/A",
        dateStr,
        orderType: bill.orderData.orderType,
        items: kitchenItems,
        customer: { name: bill.customerName },
      });
      await handlePrintKitchen(kotText);
    } else {
      await handlePrintKitchen(bill.kotText);
    }
  }

  async function handleReprintReceipt(bill) {
    if (!bill.receiptText || !bill.logoDataUrl) {
      // Generate receipt text if not available
      const dateStr = new Date(bill.createdAt).toLocaleString();
      const itemsForReceipt = (bill.orderData.products || []).map((it) => {
        const n = normalizeNote(it.note);
        return {
          ...it,
          name: n ? `${it.name} [${n}]` : it.name,
        };
      });
      const receiptText = buildReceipt({
        address: "Jl. Mekar Utama No. 61, Bandung",
        orderNumber: bill.orderNumber || "N/A",
        dateStr,
        items: itemsForReceipt,
        subtotal: bill.orderData.subtotal,
        tax: bill.orderData.tax,
        service: bill.orderData.serviceCharge,
        showTax: taxEnabled,
        showService: serviceEnabled,
        discount: bill.orderData.discount,
        total: bill.orderData.totalAmount,
        payment: bill.orderData.paymentMethod,
        orderType: bill.orderData.orderType,
        customer: { name: bill.customerName },
        discountNote: bill.orderData.discountNote,
      }).replace(/^[\s\r\n]+/, "");

      const logoPref = localStorage.getItem("print.logo") || appLogo;
      const logoDataUrl =
        typeof logoPref === "string" && logoPref.startsWith("data:")
          ? logoPref
          : await toDataUrl(logoPref);
      await handlePrintReceipt(receiptText, logoDataUrl);
    } else {
      await handlePrintReceipt(bill.receiptText, bill.logoDataUrl);
    }
  }

  async function handleDeleteOpenBill(bill) {
    if (!await confirm({
      title: "Discard held order?",
      message: "This removes the saved order from this device.",
      confirmText: "Discard",
    })) return;
    try {
      if (bill.orderId) await api.patch(`/orders/${bill.orderId}`, { status: "cancelled" });
      if (saveOpenBills(openBills.filter((entry) => entry.orderNumber !== bill.orderNumber))) {
        if (resuming === bill.orderNumber) resetCart();
        show("Held order discarded.", { type: "success" });
      }
    } catch {
      show("Couldn’t cancel the saved order. Try again.", { type: "error" });
    }
  }

  async function handleLoadOpenBillToCart(bill) {
    if (cart.length || bill.orderId) return;
    const data = bill.orderData;
    setCart((data.products || []).map((product, index) => ({
      _id: product.productId,
      id: `${bill.orderNumber}-${index}`,
      name: product.name,
      price: Number(product.price || 0),
      quantity: Number(product.quantity || 0),
      note: product.note || "",
      options: product.options || {},
    })));
    setCustomerName(bill.customerName || "");
    setCustomerEmail(bill.customerEmail || "");
    setOrderType(data.orderType || "Delivery");
    const mode = data.discountMode || (data.discount > 0 ? "custom" : "promo");
    setDiscountMode(mode);
    setSelectedPromoId(data.promoId || "");
    setDiscountType(data.discountType || "flat");
    setDiscountValue(data.discountValue ?? String(data.discount || ""));
    setDiscountNote(data.discountNote || "");
    setResuming(bill.orderNumber);
    setShowOpenBills(false);
    if (data.promoId && !promos.length) await fetchPromos();
  }

  // discount modal controls
  const handleOpenDiscountModal = async () => {
    discountBeforeEdit.current = { discountMode, selectedPromoId, discountType, discountValue, discountNote };
    setShowDiscountModal(true);
    if (!promosLoading) await fetchPromos();
  };
  function handleCloseDiscountModal() {
    const previous = discountBeforeEdit.current;
    setDiscountMode(previous.discountMode);
    setSelectedPromoId(previous.selectedPromoId);
    setDiscountType(previous.discountType);
    setDiscountValue(previous.discountValue);
    setDiscountNote(previous.discountNote);
    setShowDiscountModal(false);
  }
  function handleApplyDiscount(event) {
    event.preventDefault();
    if (discountMode === "promo" && selectedPromoId && promoUnavailable(selectedPromo, sub)) return;
    setShowDiscountModal(false);
  }

  /* ==========================
     SOFT REFRESH
     ========================== */
  const refreshData = useCallback(() => {
    return Promise.all([reloadProducts(), reloadCategories(), fetchPromos(), reloadCharges()]);
  }, [reloadProducts, reloadCategories, fetchPromos, reloadCharges]);

  useEffect(() => {
    const onKey = (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k" && searchInput.current) {
        event.preventDefault();
        searchInput.current.focus();
      } else if (event.shiftKey && !event.metaKey && !event.ctrlKey && key === "r"
        && !event.target.matches?.("input, textarea, select, [contenteditable]")) {
        event.preventDefault();
        refreshData();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshData]);

  const isRefreshing = loadingProducts || categoriesLoading || promosLoading || chargesState === "loading";

  const serviceControls = (
    <div className="cart-delivery" role="group" aria-label="Service type">
      {["Delivery", "Dine in", "Take away"].map((type) => (
        <button key={type} type="button" className={orderType === type ? "active" : ""}
          aria-pressed={orderType === type} onClick={() => setOrderType(type)}>
          {type === "Dine in" ? "Dine-in" : type === "Take away" ? "Takeaway" : type}
        </button>
      ))}
    </div>
  );
  const cartItems = (
    <div className="cart-items">
      {cart.length ? cart.map((item) => (
        <div key={item.id} className="cart-item">
          <div className="cart-item-left">
            <strong>{item.name}</strong>
            {item.note && <p className="order-item-note">{item.note}</p>}
            <button className="link-btn" type="button" onClick={() => openNoteModal(item)}
              aria-label={`${item.note ? "Edit" : "Add"} note for ${item.name}`}>
              {item.note ? "Edit note" : "Add note"}
            </button>
          </div>
          <div className="cart-item-right">
            <p>{formatIDR(Number(item.price ?? 0) * item.quantity)}</p>
            <div className="stepper" role="group" aria-label={`${item.name} quantity`}>
              <button type="button" className="stepper-btn" onClick={() => handleDecreaseQty(item.id)}
                aria-label={`Decrease ${item.name} quantity`}>−</button>
              <span className="stepper-qty">{item.quantity}</span>
              <button type="button" className="stepper-btn" onClick={() => handleIncreaseQty(item.id)}
                aria-label={`Increase ${item.name} quantity`}>+</button>
            </div>
          </div>
        </div>
      )) : (
        <div className="order-empty">
          <FiShoppingBag size={25} aria-hidden="true" />
          <strong>No items yet</strong>
          <p>Select a product to start an order.</p>
        </div>
      )}
    </div>
  );
  const cartSummary = (
    <div className="cart-summary">
      {itemCount > 0 && (
        <details className="order-breakdown">
          <summary>Order breakdown <FiChevronDown aria-hidden="true" /></summary>
          <div className="summary-row"><span>Subtotal</span><span>{formatIDR(sub)}</span></div>
          {taxEnabled && <div className="summary-row"><span>Tax</span><span>{formatIDR(tx)}</span></div>}
          {serviceEnabled && <div className="summary-row"><span>Service charge</span><span>{formatIDR(svc)}</span></div>}
          {discount > 0 && <div className="summary-row"><span>{discountLabel}</span><span>−{formatIDR(discount)}</span></div>}
        </details>
      )}
      {itemCount > 0 && (
        <button className="discount-btn order-discount" type="button" onClick={handleOpenDiscountModal}>
          <FiTag aria-hidden="true" /> {discount > 0 ? "Edit discount" : "Add discount"}
        </button>
      )}
      <div className="summary-row total-row"><strong>Total</strong><strong>{formatIDR(total)}</strong></div>
      {chargesState === "error" && <p className="register-charge-error" role="alert">
        Couldn’t load order charges. <button type="button" className="link-btn" onClick={reloadCharges}>Retry</button>
      </p>}
      <div className="register-order-actions">
        <button className="hold-order-btn" type="button" disabled={isSubmitting || !itemCount} onClick={holdOrder}>Hold</button>
        <button className="checkout-btn" type="button" disabled={!online || isSubmitting || !itemCount || chargesState !== "ready"}
          onClick={() => { setMobileCartOpen(false); setShowPaymentModal(true); }}>
          Review payment
        </button>
      </div>
    </div>
  );

  return (
    <div className="layout-container boonz-register">
      <Sidebar
        onAddProduct={() => navigate("/product-page?view=add")}
        onAddCategory={() => navigate("/admin/categories?view=add")}
      />

      <main className="layout-main">
        <header className="layout-topbar">
          <div className="register-location"><span>Boonz</span><strong>Point of sale</strong></div>
          <div className="topbar-actions">
            <span className={`register-connection ${online ? "" : "offline"}`} role="status">{online ? "Online" : "Offline"}</span>
            <button className="icon-btn register-held-button" type="button"
              aria-label={`Held orders (${openBills.length})`} onClick={() => setShowOpenBills(true)}>
              <FiArchive size={18} aria-hidden="true" />
              <span>Held orders</span>
              {openBills.length > 0 && <b>{openBills.length}</b>}
            </button>
            <button className="icon-btn" type="button" aria-label="Refresh menu" title="Refresh menu"
              onClick={refreshData} disabled={isRefreshing}>
              <FiRefreshCw size={17} aria-hidden="true" />
            </button>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button type="button" className="avatar-btn" aria-label="Account" aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}>{initials}</button>
              {userMenuOpen && (
                <div className="user-menu">
                  <div className="user-menu__head">
                    <div className="user-text"><strong>{user?.name || "Account"}</strong><small>{user?.email}</small></div>
                  </div>
                  {isAdmin && <button className="user-menu__item" type="button" onClick={() => {
                    setUserMenuOpen(false);
                    handleHardReset();
                  }}>Reset device preferences</button>}
                  <button className="user-menu__item" type="button" onClick={handleLogout}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {!online && <p className="register-offline">You’re offline. Hold this order on this device or reconnect to record payment.</p>}
        <div className="products-area" aria-busy={loadingProducts}>
          <section className="register-masthead" aria-labelledby="register-menu">
            <div><p>Boonz Hauz</p><h1 id="register-menu">Menu</h1></div>
            <FiCoffee size={66} strokeWidth={1.25} aria-hidden="true" />
          </section>

          <div className="search-wrap">
            <FiSearch size={18} aria-hidden="true" />
            <input ref={searchInput} type="search" className="search-input"
              aria-label="Search menu or scan SKU" placeholder="Search menu or scan SKU"
              value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={addSearchResult} />
            {searchTerm && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => {
              setSearchTerm("");
              searchInput.current.focus();
            }}><FiX size={17} aria-hidden="true" /></button>}
          </div>

          {chipReady ? (
            <div className="chip-row" role="group" aria-label="Menu categories">
              {chipNames.map((name) => (
                <button key={name} type="button" className={`chip ${name === selectedCategory && !query ? "active" : ""}`}
                  aria-pressed={name === selectedCategory && !query} onClick={() => {
                    setSelectedCategory(name);
                    setSearchTerm("");
                  }}>{name === "All" ? "All items" : name}</button>
              ))}
            </div>
          ) : <ChipsSkeleton />}

          <div className="register-catalog-heading">
            <h2>{query ? "Search results" : selectedCategory === "All" ? "All items" : selectedCategory}</h2>
            {!loadingProducts && !productsError && <span role="status">{filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"}</span>}
          </div>
          {loadingProducts ? <SkeletonGrid count={8} /> : productsError ? (
            <div className="empty-state" role="alert">
              <h3>{productsError}</h3>
              <button className="empty-cta" type="button" onClick={refreshData}>Try again</button>
            </div>
          ) : filteredProducts.length ? (
            <div className="product-grid">
              {filteredProducts.map((product) => {
                const image = getImageSrc(product);
                return <button key={product._id || product.id || product.sku} type="button" className="product-card"
                  onClick={() => handleAddToCart(product)}>
                  <span className="register-product-image">
                    {image ? <SafeImage className="product-image" src={image} alt="" loading="lazy" />
                      : <FiShoppingBag className="register-product-placeholder" size={33} aria-hidden="true" />}
                    <span className="register-product-add"><FiPlus size={18} aria-hidden="true" /></span>
                  </span>
                  <span className="register-product-info">
                    <strong className="product-name">{product.name}</strong>
                    <span className="register-product-meta">
                      <span>{product.category}</span>
                      <strong className="product-price">{formatIDR(product.price)}</strong>
                    </span>
                  </span>
                </button>;
              })}
            </div>
          ) : (
            <div className="empty-state">
              <h3>{query ? "No matching products" : "No products in this category"}</h3>
              {query || selectedCategory !== "All" ? (
                <button className="empty-cta" type="button" onClick={() => { setSearchTerm(""); setSelectedCategory("All"); }}>Show all items</button>
              ) : isAdmin && <button className="empty-cta" type="button" onClick={() => navigate("/product-page?view=add")}>Add product</button>}
            </div>
          )}
        </div>

        <button className="fab-cart" type="button" aria-label={`View order, ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatIDR(total)}`}
          onClick={() => setMobileCartOpen(true)}>
          <FiShoppingBag size={19} aria-hidden="true" />
          <span className="fab-cart__label">View order</span>
          <span className="fab-cart__badge">{itemCount} · {formatIDR(total)}</span>
        </button>

        {isMobile && mobileCartOpen && (
          <div className="cart-sheet open" onKeyDown={(event) => {
            if (event.key === "Escape") setMobileCartOpen(false);
          }}>
            <div className="cart-sheet__backdrop" onClick={() => setMobileCartOpen(false)} />
            <section className="cart-sheet__panel" role="dialog" aria-modal="true" aria-label="Current order">
              <div className="cart-sheet__head"><h2>Current order</h2>
                <button className="cart-sheet__close" type="button" aria-label="Close order" autoFocus onClick={() => setMobileCartOpen(false)}><FiX /></button>
              </div>
              {serviceControls}
              {cartItems}
              {cartSummary}
            </section>
          </div>
        )}
      </main>

      {!isMobile && (
        <aside className="layout-cart" aria-label="Current order">
          <header className="cart-header"><h2>Current order</h2><span aria-live="polite">{itemCount} {itemCount === 1 ? "item" : "items"}</span></header>
          {serviceControls}
          {cartItems}
          {cartSummary}
        </aside>
      )}

      {showPaymentModal && (
        <div className="paymodal" role="dialog" aria-modal="true" aria-labelledby="paymodal-title"
          onClick={() => !isSubmitting && setShowPaymentModal(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isSubmitting) setShowPaymentModal(false);
          }}>
          <form className="paymodal__dialog" onSubmit={confirmPayment} onClick={(event) => event.stopPropagation()}>
            <header className="paymodal__head">
              <h3 id="paymodal-title">Record payment</h3>
              <button className="paymodal__close" type="button" aria-label="Close" disabled={isSubmitting}
                autoFocus onClick={() => setShowPaymentModal(false)}><FiX /></button>
            </header>
            <div className="paymodal__body">
              <div className="payment-due"><span>Amount due</span><strong>{formatIDR(total)}</strong></div>
              <p className="payment-help">Complete the payment on your terminal, then select its method below.</p>
              <fieldset className="payment-fields" disabled={isSubmitting}>
                <legend>Payment method</legend>
                <div className="payment-methods">
                  {["Credit Card", "Debit Card", "QRIS", "Go Pay", "Grab Pay"].map((method) => (
                    <button key={method} type="button" className={`payitem ${selectedPaymentMethod === method ? "is-selected" : ""}`}
                      aria-pressed={selectedPaymentMethod === method} onClick={() => setSelectedPaymentMethod(method)}>
                      {method}
                    </button>
                  ))}
                </div>
                <label>Customer name <span>(optional)</span>
                  <input className="register-input" value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)} />
                </label>
                <label>Email receipt <span>(optional)</span>
                  <input className="register-input" type="email" value={customerEmail} placeholder="customer@example.com"
                    onChange={(event) => setCustomerEmail(event.target.value)} />
                </label>
              </fieldset>
            </div>
            <footer className="paymodal__actions">
              <button className="btn btn-ghost" type="button" disabled={isSubmitting} onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={isSubmitting || !selectedPaymentMethod || !online}>
                {isSubmitting ? "Recording…" : "Record payment"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {printDialog && (
        <div className="paymodal" role="dialog" aria-modal="true" aria-labelledby="post-print-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !printBusy) setPrintDialog(null);
          }}>
          <div className="paymodal__dialog">
            <header className="paymodal__head">
              <h3 id="post-print-title">Order #{printDialog.orderNumber} recorded</h3>
              <button className="paymodal__close" type="button" aria-label="Close" disabled={!!printBusy}
                autoFocus onClick={() => setPrintDialog(null)}><FiX /></button>
            </header>
            <div className="paymodal__body order-documents">
              <div className="document-actions">
                <button className="btn btn-primary" type="button" disabled={!!printBusy}
                  onClick={() => handlePrintKitchen(printDialog.kotText)}>
                  {printBusy === "kitchen" ? "Printing…" : "Print kitchen ticket"}
                </button>
                <button className="btn btn-ghost" type="button" disabled={!!printBusy}
                  onClick={() => handlePrintReceipt(printDialog.receiptText, printDialog.logo)}>
                  {printBusy === "receipt" ? "Printing…" : "Print receipt"}
                </button>
              </div>
              <details><summary>Preview receipt</summary><ReceiptPreview data={printDialog} /></details>
              <details>
                <summary>Email receipt</summary>
                <form className="order-receipt-email" onSubmit={(event) => { event.preventDefault(); handleEmailReceipt(); }}>
                  <label>Email address <input className="register-input" type="email" required value={email}
                    onChange={(event) => setEmail(event.target.value)} /></label>
                  <button className="btn btn-ghost" type="submit" disabled={sendingEmail || emailCooldownLeft > 0}>
                    {sendingEmail ? "Sending…" : emailCooldownLeft > 0 ? `Resend in ${emailCooldownLeft}s` : "Send receipt"}
                  </button>
                </form>
              </details>
              {emailNotice && <p role="status">{emailNotice}</p>}
              {emailError && <p className="email-receipt__error" role="alert">{emailError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {noteModal.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-title"
          onClick={closeNoteModal}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="note-title">Add a note</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={closeNoteModal}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <label
                className="register-label"
                style={{ display: "block", marginBottom: 6 }}
              >
                Note for this item (e.g., “no onion”, “extra spicy”)
              </label>
              <textarea
                rows={4}
                className="register-input"
                value={noteModal.text}
                onChange={(e) =>
                  setNoteModal((m) => ({ ...m, text: e.target.value }))
                }
                placeholder="Type note…"
                autoFocus
              />
            </div>

            <footer className="paymodal__actions">
              <button className="btn btn-primary" onClick={saveNoteModal}>
                Save
              </button>
              <button className="btn btn-ghost" onClick={closeNoteModal}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="discount-modal" role="dialog" aria-modal="true" aria-labelledby="discount-title"
          onKeyDown={(event) => { if (event.key === "Escape") handleCloseDiscountModal(); }}>
          <form className="discount-modal-content" onSubmit={handleApplyDiscount}>
            <h3 id="discount-title">Order discount</h3>

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
                  disabled={!isAdmin}
                  checked={discountMode === "custom"}
                  onChange={() => setDiscountMode("custom")}
                />
                Manual (admin)
              </label>
            </div>

            {discountMode === "promo" ? (
              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="order-promotion">Choose promotion</label>
                <select id="order-promotion" autoFocus
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
                    {promoUnavailable(selectedPromo, sub) && <p role="status">{promoUnavailable(selectedPromo, sub)}</p>}
                    {selectedPromo.description && (
                      <div>- {selectedPromo.description}</div>
                    )}
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

                <label htmlFor="order-discount-value">Discount value</label>
                <input
                  id="order-discount-value"
                  type="number"
                  min="0"
                  max={discountType === "percentage" ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percentage"
                      ? "e.g. 10 for 10%"
                      : "e.g. 5000 for Rp.5,000"
                  }
                />

                <label htmlFor="order-discount-reason">Reason</label>
                <textarea
                  id="order-discount-reason"
                  required={customDiscount > 0}
                  rows="3"
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  placeholder="Reason for the discount"
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
              <button type="submit" disabled={discountMode === "promo" && Boolean(selectedPromoId)
                && (promosLoading || Boolean(promoUnavailable(selectedPromo, sub)))}>Apply</button>
              <button type="button" onClick={handleCloseDiscountModal}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Customize Drink Modal */}
      {customize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drink-customize-title"
          onClick={cancelCustomize}
        >
          <div
            className="paymodal__dialog paymodal__dialog--customize"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="drink-customize-title">
                Customize {customize.product?.name || "Drink"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div style={{ marginBottom: 12 }}>
                <div className="register-label" style={{ marginBottom: 6 }}>
                  Temperature
                </div>
                <div className="radio-row">
                  {["Ice", "Hot"].map((v) => (
                    <label key={v}>
                      <input
                        type="radio"
                        name="temperature"
                        value={v}
                        checked={customize.temperature === v}
                        onChange={() =>
                          setCustomize((s) => ({ ...s, temperature: v }))
                        }
                      />{" "}
                      {v}
                    </label>
                  ))}
                </div>
              </div>
              {/* Sugar */}
              <div style={{ marginBottom: 12 }}>
                <div className="register-label" style={{ marginBottom: 6 }}>
                  Sugar
                </div>
                <div className="radio-row">
                  {["Full", "Half", "No"].map((v) => (
                    <label key={v}>
                      <input
                        type="radio"
                        name="sugar"
                        value={v}
                        checked={customize.sugar === v}
                        onChange={() =>
                          setCustomize((s) => ({ ...s, sugar: v }))
                        }
                      />{" "}
                      {v}
                    </label>
                  ))}
                </div>
              </div>

              {/* Ice */}
              <div
                style={{
                  marginBottom: 12,
                  opacity: customize.temperature === "Hot" ? 0.5 : 1,
                }}
              >
                <div className="register-label" style={{ marginBottom: 6 }}>
                  Ice
                </div>
                <div className="radio-row">
                  {["Normal", "Less", "No"].map((v) => (
                    <label key={v}>
                      <input
                        type="radio"
                        name="ice"
                        value={v}
                        checked={customize.ice === v}
                        onChange={() => setCustomize((s) => ({ ...s, ice: v }))}
                        disabled={customize.temperature === "Hot"} // NEW
                      />{" "}
                      {v}
                    </label>
                  ))}
                </div>
              </div>

              {/* Toppings: only when base SKU starts with "TPD" */}
              {isToppingSku(customize.product?.sku) && (
                <div style={{ marginTop: 10 }}>
                  <div className="register-label" style={{ marginBottom: 6 }}>
                    Toppings (Rp {TOPPING_PRICE_IDR.toLocaleString("id-ID")}{" "}
                    each)
                  </div>

                  <div
                    className="radio-row"
                    style={{ flexWrap: "wrap", gap: 12 }}
                  >
                    {TOPPING_OPTIONS.map((t) => {
                      const checked = customize.toppings.includes(t.sku);
                      return (
                        <label
                          key={t.sku}
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            minWidth: 160,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setCustomize((s) => {
                                const next = new Set(s.toppings);
                                if (e.target.checked) next.add(t.sku);
                                else next.delete(t.sku);
                                return { ...s, toppings: Array.from(next) };
                              })
                            }
                          />
                          {t.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <footer className="paymodal__actions">
              <button className="btn btn-primary" onClick={applyCustomize}>
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Fries Flavor Modal */}
      {friesCustomize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fries-customize-title"
          onClick={cancelFriesCustomize}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="fries-customize-title">
                Choose Flavor — {friesCustomize.product?.name || "Fries"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelFriesCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div className="register-label" style={{ marginBottom: 6 }}>
                Flavor
              </div>
              <div className="radio-row">
                {FRIES_FLAVORS.map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="fries-flavor"
                      value={v}
                      checked={friesCustomize.flavor === v}
                      onChange={() =>
                        setFriesCustomize((s) => ({ ...s, flavor: v }))
                      }
                    />{" "}
                    {v}
                  </label>
                ))}
              </div>
            </div>

            <footer className="paymodal__actions">
              <button className="btn btn-primary" onClick={applyFriesCustomize}>
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelFriesCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Onion Rings Flavor Modal */}
      {onionRingsCustomize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onion-rings-customize-title"
          onClick={cancelOnionRingsCustomize}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="onion-rings-customize-title">
                Choose Flavor — {onionRingsCustomize.product?.name || "Onion Rings"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelOnionRingsCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div className="register-label" style={{ marginBottom: 6 }}>
                Flavor
              </div>
              <div className="radio-row">
                {ONION_RINGS_FLAVORS.map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="onion-rings-flavor"
                      value={v}
                      checked={onionRingsCustomize.flavor === v}
                      onChange={() =>
                        setOnionRingsCustomize((s) => ({ ...s, flavor: v }))
                      }
                    />{" "}
                    {v}
                  </label>
                ))}
              </div>
            </div>

            <footer className="paymodal__actions">
              <button className="btn btn-primary" onClick={applyOnionRingsCustomize}>
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelOnionRingsCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Burger Cut Modal */}
      {burgerCustomize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="burger-customize-title"
          onClick={cancelBurgerCustomize}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="burger-customize-title">
                Choose Cut — {burgerCustomize.product?.name || "Burger"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelBurgerCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div className="register-label" style={{ marginBottom: 6 }}>
                Cut Style
              </div>
              <div className="radio-row">
                {["Whole", "Half", "4"].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="burger-cut"
                      value={v}
                      checked={burgerCustomize.cut === v}
                      onChange={() =>
                        setBurgerCustomize((s) => ({ ...s, cut: v }))
                      }
                    />{" "}
                    {v === "4" ? "4 cut" : v}
                  </label>
                ))}
              </div>
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={applyBurgerCustomize}
              >
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelBurgerCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {coffeeCustomize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coffee-customize-title"
          onClick={cancelCoffeeCustomize}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="coffee-customize-title">
                Choose Temperature — {coffeeCustomize.product?.name || "Coffee"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelCoffeeCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div className="register-label" style={{ marginBottom: 6 }}>
                Temperature
              </div>
              <div className="radio-row">
                {["Ice", "Hot"].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="coffee-temp"
                      value={v}
                      checked={coffeeCustomize.temperature === v}
                      onChange={() =>
                        setCoffeeCustomize((s) => ({ ...s, temperature: v }))
                      }
                    />{" "}
                    {v}
                  </label>
                ))}
              </div>
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={applyCoffeeCustomize}
              >
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelCoffeeCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {sodaCustomize.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="soda-customize-title"
          onClick={cancelSodaCustomize}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="soda-customize-title">
                Choose Ice — {sodaCustomize.product?.name || "Soda"}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={cancelSodaCustomize}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <div className="register-label" style={{ marginBottom: 6 }}>
                Ice Option
              </div>
              <div className="radio-row">
                {["Ice", "No Ice"].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="soda-ice"
                      value={v}
                      checked={sodaCustomize.ice === v}
                      onChange={() =>
                        setSodaCustomize((s) => ({ ...s, ice: v }))
                      }
                    />{" "}
                    {v}
                  </label>
                ))}
              </div>
            </div>

            <footer className="paymodal__actions">
              <button className="btn btn-primary" onClick={applySodaCustomize}>
                Add to cart
              </button>
              <button className="btn btn-ghost" onClick={cancelSodaCustomize}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {showOpenBills && (
        <div className="paymodal" role="dialog" aria-modal="true" aria-labelledby="open-bills-title"
          onClick={() => setShowOpenBills(false)}
          onKeyDown={(event) => { if (event.key === "Escape") setShowOpenBills(false); }}>
          <div className="paymodal__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="paymodal__head">
              <h3 id="open-bills-title">Held orders</h3>
              <button className="paymodal__close" type="button" aria-label="Close" autoFocus
                onClick={() => setShowOpenBills(false)}><FiX /></button>
            </header>
            <div className="paymodal__body">
              <p className="payment-help">Held orders are saved on this device.</p>
              {cart.length > 0 && <p className="payment-help">Hold or finish the current order before resuming another.</p>}
              {openBills.length ? (
                <ul className="held-orders-list">
                  {openBills.map((bill) => (
                    <li key={bill.orderNumber}>
                      <div className="held-order-heading">
                        <div><strong>{bill.customerName || bill.orderData.orderType || "Held order"}</strong>
                          <small>{new Date(bill.createdAt).toLocaleString()}</small></div>
                        <strong>{formatIDR(bill.orderData.totalAmount)}</strong>
                      </div>
                      {bill.orderId ? (
                        <div className="document-actions">
                          <button className="btn btn-ghost" type="button" onClick={() => handleReprintKitchen(bill)} disabled={!!printBusy}>Print kitchen</button>
                          <button className="btn btn-ghost" type="button" onClick={() => handleReprintReceipt(bill)} disabled={!!printBusy}>Print receipt</button>
                        </div>
                      ) : null}
                      <div className="document-actions">
                        {!bill.orderId && <button type="button" className="btn btn-primary" onClick={() => handleLoadOpenBillToCart(bill)}
                          disabled={cart.length > 0}>Resume</button>}
                        <button type="button" className="btn btn-ghost" disabled={resuming === bill.orderNumber && cart.length > 0}
                          onClick={() => handleDeleteOpenBill(bill)}>Discard</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p>No held orders.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
