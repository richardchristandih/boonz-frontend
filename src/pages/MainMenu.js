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
import richardImage from "./ProfilePic.png";
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
import AddCategoryModal from "../components/AddCategoryModal";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

/* ---------------- Constants ---------------- */
const MOBILE_BP = 1024; // px
const RECEIPT_PRINTER_HINT = /RPP02N/i;

// Category UX preferences
const DEFAULT_CATEGORY = "Coffee";

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
  (apiCats || []).forEach(add);
  (prodCats || []).forEach(add);

  if (map.size === 0) {
    ["Coffee", "Drink", "Burger", "Beer", "Patisserie", "Matcha"].forEach(add);
  }

  const allNames = Array.from(map.values());
  const primary = ["Coffee", "Burger"]
    .filter((p) => includesCI(allNames, p))
    .map((p) => allNames.find((n) => n.toLowerCase() === p.toLowerCase()));

  const rest = allNames
    .filter((n) => !includesCI(primary, n))
    .sort((a, b) => a.localeCompare(b));

  const ordered = [...primary, ...rest];
  return ordered.length > 1 ? ["All", ...ordered] : ordered;
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
  const [serviceRate, setServiceRate] = useState(0); // decimals, e.g. 0.05

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchOrderCharges();
        setTaxEnabled(!!s.taxEnabled);
        setServiceEnabled(!!s.serviceEnabled);
        // already normalized to decimals by the service
        setTaxRate(Number(s.taxRate) || 0);
        setServiceRate(Number(s.serviceRate) || 0);
      } catch (e) {
        console.warn("Failed to load order charges:", e);
        // keep defaults
      }
    })();
  }, []);

  // categories from API (preferred)
  const [categories, setCategories] = useState([]); // [{_id, name}]
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [addCatOpen, setAddCatOpen] = useState(false);

  const initRef = useRef(true);

  // user
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  // email receipt (customer optional during checkout)
  const [wantEmailReceipt, setWantEmailReceipt] = useState(false);
  const [customerEmail, setCustomerEmail] = useState(user?.email || "");
  const [customerName, setCustomerName] = useState(user?.name || "");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Delivery");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [orderNumber, setOrderNumber] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coffeeCustomize, setCoffeeCustomize] = useState({
    open: false,
    product: null,
    temperature: "Ice",
  });

  /* ---- NEW: Post-payment print dialog state ---- */
  const [printDialog, setPrintDialog] = useState({
    open: false,
    orderNumber: null,
    kotText: "",
    receiptText: "",
    logoDataUrl: "",
  });
  const [printBusy, setPrintBusy] = useState(""); // "", "kitchen", "receipt"

  /* ---- Open Bill Feature ---- */
  const [openBills, setOpenBills] = useState([]); // Array of unpaid orders
  const [showOpenBills, setShowOpenBills] = useState(false);
  const [editingOpenBill, setEditingOpenBill] = useState(null); // Currently editing open bill order number

  // Load open bills from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("openBills");
      if (stored) {
        setOpenBills(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to load open bills:", e);
    }
  }, []);

  // Save open bills to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("openBills", JSON.stringify(openBills));
    } catch (e) {
      console.warn("Failed to save open bills:", e);
    }
  }, [openBills]);

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
    if (!orderNumber) {
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
      await sendOrderEmail(orderNumber, email);
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
  const [showSearchBar, setShowSearchBar] = useState(false);

  /* ---- Promotions / discount ---- */
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState("");

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountMode, setDiscountMode] = useState("promo");
  const [selectedPromoId, setSelectedPromoId] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState("flat");
  const [discountNote, setDiscountNote] = useState("");

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

    const keep = new Set(["token", "refreshToken", "user"]);
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

  /* ---- Load products once ---- */
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

  /* ---- Load categories on mount ---- */
  useEffect(() => {
    reloadCategories();
  }, [reloadCategories]);

  /* ---- Fallback selected category ---- */
  useEffect(() => {
    if (!selectedCategory && products.length && categories.length === 0) {
      const derived = deriveCategoryNames(products);
      setSelectedCategory(derived[0] || DEFAULT_CATEGORY);
    }
  }, [categories.length, products, selectedCategory]);

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
    if (!chipReady) return;
    const prefer =
      chipNames.find(
        (n) => n.toLowerCase() === DEFAULT_CATEGORY.toLowerCase()
      ) || chipNames[0];

    if (initRef.current) {
      if (!includesCI(chipNames, selectedCategory)) {
        setSelectedCategory(prefer);
      }
      initRef.current = false;
      return;
    }
    if (!includesCI(chipNames, selectedCategory)) {
      setSelectedCategory(prefer);
    }
  }, [chipReady, chipNames, selectedCategory]);

  /* ---------- Product filtering ---------- */
  const filteredProducts = useMemo(() => {
    const term = (searchTerm || "").toLowerCase();
    const list = Array.isArray(products) ? products : [];
    return list.filter((p) => {
      const category = (p?.category ?? "").trim();
      const name = p?.name ?? "";
      const categoryOk =
        !selectedCategory || selectedCategory === "All"
          ? true
          : category.toLowerCase() === selectedCategory.toLowerCase();
      return categoryOk && name.toLowerCase().includes(term);
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

  /* ---------- Cart ops ---------- */
  const handleAddToCart = useCallback(
    (product) => {
      if (!product) return;

      const category = (product.category || "").trim();

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

  const handleRemoveItem = useCallback(
    (id) => setCart((prev) => prev.filter((i) => i.id !== id)),
    []
  );

  /* ---------- Customer Name Dialog State ---------- */
  const [showCustomerNameDialog, setShowCustomerNameDialog] = useState(false);
  const [checkoutCustomerName, setCheckoutCustomerName] = useState("");

  /* ---------- Checkout ---------- */
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) {
      show("Your cart is empty!", { type: "info" });
      return;
    }
    // Show customer name dialog first
    setCheckoutCustomerName(customerName || user?.name || "");
    setShowCustomerNameDialog(true);
  }, [cart.length, customerName, user?.name]);

  const handleCustomerNameConfirm = useCallback(() => {
    setCustomerName(checkoutCustomerName);
    setShowCustomerNameDialog(false);
    setShowPaymentModal(true);
  }, [checkoutCustomerName]);

  const finishOrder = (newOrderNumber) => {
    setShowPaymentModal(false);
    setMobileCartOpen(false);
    // Only clear cart if not editing an open bill
    if (!editingOpenBill) {
      setCart([]);
      setSelectedPromoId("");
      setDiscountMode("promo");
      setDiscountValue("0");
      setDiscountNote("");
      setDiscountType("flat");
    }
    setSelectedPaymentMethod("");
    setEditingOpenBill(null);
    show(`Order #${newOrderNumber} placed successfully!`, {
      type: "success",
      ttl: 5000,
    });
  };

  const confirmPayment = useCallback(async () => {
    if (!user) {
      show("Your session expired. Please log in again.", { type: "error" });
      navigate("/login");
      return;
    }
    if (!selectedPaymentMethod) {
      show("Please select a payment method!", { type: "error" });
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

    // Check if this is an open bill (unpaid)
    const isOpenBill = selectedPaymentMethod === "Open Bill";

    const orderData = {
      products: cart.map((item) => ({
        productId: item._id || item.id || item.sku,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price ?? 0),
        note: normalizeNote(item.note) || undefined,
        options: item.options || {}, // Preserve options for kitchen ticket
      })),
      subtotal: sub,
      tax: tx,
      serviceCharge: svc,
      discount,
      discountNote: finalDiscountNote,
      totalAmount: total,
      user: user?._id,
      orderType,
      paymentMethod: isOpenBill ? "Open Bill" : selectedPaymentMethod,
      discountMode,
      ...(promoMeta || {}),

      // Email customer (optional)
      sendEmail: wantEmailReceipt && !!(customerEmail || "").trim(),
      customerEmail: wantEmailReceipt
        ? (customerEmail || "").trim()
        : undefined,
      // Always save customer name if provided (not just for email receipts)
      customerName: (customerName || "").trim() || undefined,

      // Optional logo for email template
      logoUrl: appLogo,
    };

    try {
      let newOrderNumber;

      if (isOpenBill) {
        // Check if we're updating an existing open bill
        if (editingOpenBill) {
          // Update existing open bill
          const existingBill = openBills.find(
            (b) => b.orderNumber === editingOpenBill
          );
          if (existingBill) {
            // Merge the old and new items
            const existingProducts = existingBill.orderData.products || [];
            const newProducts = orderData.products || [];

            // Combine products (add quantities if same product, otherwise append)
            const productMap = new Map();

            // Add existing products
            existingProducts.forEach((p) => {
              const key = p.productId || p.name;
              productMap.set(key, { ...p });
            });

            // Add/merge new products
            newProducts.forEach((p) => {
              const key = p.productId || p.name;
              if (productMap.has(key)) {
                // Same product - add quantities
                const existing = productMap.get(key);
                existing.quantity =
                  (Number(existing.quantity) || 0) + (Number(p.quantity) || 0);
              } else {
                // New product
                productMap.set(key, { ...p });
              }
            });

            const mergedProducts = Array.from(productMap.values());
            const mergedSubtotal = mergedProducts.reduce(
              (sum, p) =>
                sum + (Number(p.price) || 0) * (Number(p.quantity) || 0),
              0
            );
            const mergedTax = taxEnabled ? mergedSubtotal * taxRate : 0;
            const mergedService = serviceEnabled
              ? mergedSubtotal * serviceRate
              : 0;
            const mergedTotal = Math.max(
              0,
              mergedSubtotal + mergedTax + mergedService - discount
            );

            const updatedOrderData = {
              ...orderData,
              products: mergedProducts,
              subtotal: mergedSubtotal,
              tax: mergedTax,
              serviceCharge: mergedService,
              totalAmount: mergedTotal,
            };

            setOpenBills((prev) =>
              prev.map((bill) =>
                bill.orderNumber === editingOpenBill
                  ? {
                      ...bill,
                      orderData: updatedOrderData,
                      customerName: customerName || bill.customerName || "",
                      updatedAt: new Date().toISOString(),
                    }
                  : bill
              )
            );

            newOrderNumber = editingOpenBill;
            setEditingOpenBill(null);
            show(`Order #${newOrderNumber} updated!`, {
              type: "success",
              ttl: 3000,
            });
          } else {
            // Bill not found, create new one
            newOrderNumber = `OPEN-${Date.now()}`;
            const openBill = {
              orderNumber: newOrderNumber,
              orderData,
              customerName: customerName || user?.name || "",
              createdAt: new Date().toISOString(),
              kotText: null,
              receiptText: null,
              logoDataUrl: null,
            };
            setOpenBills((prev) => [...prev, openBill]);
            show(`Order #${newOrderNumber} saved as open bill!`, {
              type: "success",
              ttl: 3000,
            });
          }
        } else {
          // Create new open bill
          newOrderNumber = `OPEN-${Date.now()}`;
          const openBill = {
            orderNumber: newOrderNumber,
            orderData,
            customerName: customerName || user?.name || "",
            createdAt: new Date().toISOString(),
            kotText: null, // Will be generated when needed
            receiptText: null,
            logoDataUrl: null,
          };
          setOpenBills((prev) => [...prev, openBill]);
          show(`Order #${newOrderNumber} saved as open bill!`, {
            type: "success",
            ttl: 3000,
          });
        }
      } else {
        // Normal paid order - send to server
        const response = await api.post("/orders", orderData);
        newOrderNumber = response.data?.orderNumber;
      }

      setOrderNumber(newOrderNumber);

      // Build printable strings but DO NOT print yet
      const dateStr = new Date().toLocaleString();

      // Always use customerName if provided, otherwise fall back to user name
      const printedCustomerName =
        (customerName || "").trim() || user?.name || "";

      // Ensure items have all required fields for kitchen ticket
      const kitchenItems = (orderData.products || []).map((it) => ({
        name: it.name || "Item",
        quantity: Number(it.quantity) || 0,
        note: it.note || "",
        options: it.options || {}, // Preserve options if they exist
      }));

      // Debug: log if items are missing
      if (kitchenItems.length === 0) {
        console.warn("No items found for kitchen ticket!");
      }

      const kotText = buildKitchenTicket({
        orderNumber: newOrderNumber || "N/A",
        dateStr,
        orderType: orderData.orderType,
        items: kitchenItems,
        customer: { name: printedCustomerName || user?.name },
      });

      // Debug: log kitchen ticket content (first 500 chars)
      if (process.env.NODE_ENV === "development") {
        console.log("Kitchen ticket preview:", kotText.substring(0, 500));
        console.log("Kitchen items count:", kitchenItems.length);
      }

      const itemsForReceipt = orderData.products.map((it) => {
        const n = normalizeNote(it.note);
        return {
          ...it,
          name: n ? `${it.name} [${n}]` : it.name,
        };
      });

      let receiptText = buildReceipt({
        address: "Jl. Mekar Utama No. 61, Bandung",
        orderNumber: newOrderNumber || "N/A",
        dateStr,
        items: itemsForReceipt,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        service: orderData.serviceCharge,
        showTax: taxEnabled,
        showService: serviceEnabled,
        discount: orderData.discount,
        total: orderData.totalAmount,
        payment: orderData.paymentMethod,
        orderType: orderData.orderType,
        customer: { name: printedCustomerName || user?.name },
        discountNote: finalDiscountNote,
      }).replace(/^[\s\r\n]+/, "");

      const logoPref = localStorage.getItem("print.logo") || appLogo;
      const logoDataUrl =
        typeof logoPref === "string" && logoPref.startsWith("data:")
          ? logoPref
          : await toDataUrl(logoPref);

      // For open bills, update the stored bill with receipt data
      if (isOpenBill) {
        setOpenBills((prev) =>
          prev.map((bill) =>
            bill.orderNumber === newOrderNumber
              ? {
                  ...bill,
                  kotText,
                  receiptText,
                  logoDataUrl,
                }
              : bill
          )
        );
        // Don't show print dialog for open bills - they can print later
        // Clear editing state
        setEditingOpenBill(null);
        finishOrder(newOrderNumber);
        return;
      }

      // Close the payment modal and open a persistent print options dialog
      setShowPaymentModal(false);
      setPrintDialog({
        open: true,
        orderNumber: newOrderNumber || "N/A",
        kotText,
        receiptText: receiptText + "\n\n",
        logoDataUrl,
      });
    } catch (error) {
      console.error("Error placing order:", error);
      show("There was an error placing your order.", { type: "error" });
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
    taxEnabled,
    serviceEnabled,
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
    showTax,
    showService,
    discount,
    total,
    payment,
    orderType,
    customer,
    discountNote,
    logo,
  }) {
    const rows = (items || [])
      .map((it) => {
        const note = normalizeNote(it.note);
        return `
    <tr>
      <td>${Number(it.quantity) || 0}x ${escapeHtml(it.name || "")}</td>
      <td style="text-align:right">${formatIDR(Number(it.price || 0), {
        withDecimals: true,
      })}</td>
    </tr>
    ${
      note
        ? `<tr><td colspan="2"><em>Note: ${escapeHtml(note)}</em></td></tr>`
        : ""
    }
  `;
      })
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
    <div class="c">${escapeHtml(address || "")}</div>
    <div class="line"></div>
    <div>Order #${escapeHtml(orderNumber || "N/A")}</div>
    <div>Type : ${escapeHtml(orderType || "")}</div>
    <div>Time : ${escapeHtml(dateStr || "")}</div>
    ${customer?.name ? `<div>Cust : ${escapeHtml(customer.name)}</div>` : ""}
    <div class="line"></div>
    <table>${rows}</table>
    <div class="line"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td style="text-align:right">${formatIDR(subtotal, {
        withDecimals: true,
      })}</td></tr>
           ${
             showTax && Number(tax) > 0
               ? `<tr><td>Tax</td><td style="text-align:right">${formatIDR(
                   tax,
                   {
                     withDecimals: true,
                   }
                 )}</td></tr>`
               : ""
           }
      ${
        showService && Number(service) > 0
          ? `<tr><td>Service</td><td style="text-align:right">${formatIDR(
              service,
              {
                withDecimals: true,
              }
            )}</td></tr>`
          : ""
      }
      ${
        Number(discount || 0) > 0
          ? `<tr><td>Discount ${
              discountNote ? `(${escapeHtml(discountNote)})` : ""
            }</td><td style="text-align:right">-${formatIDR(discount, {
              withDecimals: true,
            })}</td></tr>`
          : ""
      }
      <tr class="bold"><td>Total</td><td style="text-align:right">${formatIDR(
        total,
        { withDecimals: true }
      )}</td></tr>
      <tr><td>Payment</td><td style="text-align:right">${escapeHtml(
        payment || ""
      )}</td></tr>
    </table>
    <div class="line"></div>
    <div class="c">Thank you!</div>
  </div>
</body></html>`;
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
          const res = await androidPrintLogoAndText(logoDataUrl, receiptText, {
            address: receiptTarget,
            nameLike: receiptTarget,
          });
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

  function closePostPrintDialog() {
    const on = printDialog.orderNumber;
    setPrintDialog({
      open: false,
      orderNumber: null,
      kotText: "",
      receiptText: "",
      logoDataUrl: "",
    });
    // Finalize/cleanup only when the user closes the dialog
    finishOrder(on || "N/A");
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

  function handleDeleteOpenBill(orderNumber) {
    setOpenBills((prev) =>
      prev.filter((bill) => bill.orderNumber !== orderNumber)
    );
    if (editingOpenBill === orderNumber) {
      setEditingOpenBill(null);
    }
    show("Open bill deleted.", { type: "success" });
  }

  function handleLoadOpenBillToCart(bill) {
    // Load the open bill's products back into the cart
    const itemsToLoad = (bill.orderData.products || []).map(
      (product, index) => {
        // Reconstruct cart item from order product
        // Use productId as base, but ensure unique ID for cart
        const baseId = product.productId || product.name || `item-${index}`;
        return {
          _id: baseId,
          id: `${baseId}-${Date.now()}-${index}`, // Ensure unique ID
          name: product.name,
          price: Number(product.price || 0),
          quantity: Number(product.quantity || 0),
          note: product.note || "",
          options: product.options || {},
        };
      }
    );

    setCart(itemsToLoad);
    setCustomerName(bill.customerName || "");
    setOrderType(bill.orderData.orderType || "Delivery");

    // Set discount if exists
    if (bill.orderData.discount > 0) {
      setDiscountMode(bill.orderData.discountMode || "custom");
      if (bill.orderData.discountMode === "promo") {
        setSelectedPromoId(bill.orderData.promoId || "");
      } else {
        // Calculate discount value from discount amount
        const discountValue = bill.orderData.discount;
        setDiscountValue(String(discountValue));
        setDiscountType("flat");
      }
      setDiscountNote(bill.orderData.discountNote || "");
    }

    // Mark this open bill as being edited
    setEditingOpenBill(bill.orderNumber);

    // Close the open bills modal
    setShowOpenBills(false);

    show(`Loaded order #${bill.orderNumber} to cart. You can add more items.`, {
      type: "success",
      ttl: 3000,
    });
  }

  // discount modal controls
  const handleOpenDiscountModal = async () => {
    setShowDiscountModal(true);
    if (!promos.length && !promosLoading) await fetchPromos();
  };
  const handleCloseDiscountModal = () => setShowDiscountModal(false);
  const handleApplyDiscount = () => setShowDiscountModal(false);

  /* ==========================
     SOFT REFRESH
     ========================== */
  const refreshData = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const [prodRes] = await Promise.all([
        api.get("/products").catch(() => ({ data: [] })),
        reloadCategories(),
        fetchPromos(),
      ]);

      const list = Array.isArray(prodRes.data)
        ? prodRes.data
        : prodRes.data && Array.isArray(prodRes.data.items)
        ? prodRes.data.items
        : [];

      setProducts(list);
    } catch (err) {
      console.error("Soft refresh failed:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, [reloadCategories, fetchPromos]);

  // Shift+R refresh
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.key.toLowerCase() === "r"
      ) {
        e.preventDefault();
        refreshData();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshData]);

  const isRefreshing = loadingProducts || categoriesLoading || promosLoading;

  return (
    <div className="layout-container">
      <Sidebar
        onAddProduct={() => navigate("/product-page")}
        onAddCategory={() => navigate("/admin/categories")}
      />

      <main className="layout-main">
        {/* Sticky top bar */}
        <div className="layout-topbar">
          {/* category chips */}
          {chipReady ? (
            <div className="chip-row" role="tablist" aria-label="Categories">
              {chipNames.map((name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={name === selectedCategory}
                  className={`chip ${
                    name === selectedCategory ? "active" : ""
                  }`}
                  onClick={() => setSelectedCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <ChipsSkeleton />
          )}

          {/* right controls */}
          <div className="topbar-actions">
            {openBills.length > 0 && (
              <button
                className="icon-btn"
                aria-label="Open Bills"
                title={`${openBills.length} Open Bill${
                  openBills.length > 1 ? "s" : ""
                }`}
                onClick={() => setShowOpenBills(true)}
                style={{ position: "relative" }}
              >
                <i className="fas fa-file-invoice" />
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    background: "#ef4444",
                    color: "white",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                  }}
                >
                  {openBills.length}
                </span>
              </button>
            )}
            <button
              className="icon-btn"
              aria-label="Refresh data"
              title="Refresh (Shift+R)"
              onClick={refreshData}
              disabled={isRefreshing}
            >
              <i
                className={`fas ${
                  isRefreshing ? "fa-circle-notch fa-spin" : "fa-sync"
                }`}
              />
            </button>

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
                    className="user-menu__item danger"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleHardReset();
                    }}
                    title="Clear local settings & reload"
                  >
                    <i className="fas fa-bolt"></i> Hard reset
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
          <h2 className="visually-hidden">{selectedCategory || "All"} Menu</h2>
          {loadingProducts ? (
            <SkeletonGrid count={12} />
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">🍽️</div>
              <h3>No products in “{selectedCategory || "All"}”</h3>
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
                      <div style={{ marginTop: 6 }}>
                        <button
                          className="link-btn"
                          onClick={() => openNoteModal(item)}
                          type="button"
                          style={{ fontSize: 12 }}
                        >
                          {item.note ? "Edit note" : "Add note"}
                        </button>
                      </div>
                      {item.note ? (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontStyle: "italic",
                            opacity: 0.8,
                          }}
                        >
                          “{item.note}”
                        </div>
                      ) : null}
                    </div>

                    <div
                      className="cart-item-right"
                      style={{
                        display: "flex",
                        gap: 10,
                        flexDirection: "column",
                        alignItems: "flex-end",
                        marginLeft: 8,
                      }}
                    >
                      <p>
                        {formatIDR(Number(item.price ?? 0), {
                          withDecimals: true,
                        })}
                      </p>

                      <div
                        className="stepper"
                        role="group"
                        aria-label="Quantity"
                      >
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => handleDecreaseQty(item.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                          aria-label="Decrease quantity"
                        >
                          –
                        </button>
                        <span className="stepper-qty" aria-live="polite">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => handleIncreaseQty(item.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cart-summary">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>{formatIDR(sub, { withDecimals: true })}</span>
                </div>
                {taxEnabled && (
                  <div className="summary-row">
                    <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                    <span>{formatIDR(tx, { withDecimals: true })}</span>
                  </div>
                )}
                {serviceEnabled && (
                  <div className="summary-row">
                    <span>
                      Service Charge ({(serviceRate * 100).toFixed(0)}%)
                    </span>
                    <span>{formatIDR(svc, { withDecimals: true })}</span>
                  </div>
                )}
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
            {editingOpenBill ? (
              <>
                Editing: Order #{editingOpenBill}
                <span style={{ fontSize: 12, color: "#3b82f6", marginLeft: 8 }}>
                  (Add more items)
                </span>
              </>
            ) : (
              <>Order #{orderNumber ? orderNumber : "Pending"}</>
            )}
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
                <div style={{ marginTop: 6 }}>
                  <button
                    className="link-btn"
                    onClick={() => openNoteModal(item)}
                    type="button"
                    style={{ fontSize: 12 }}
                  >
                    {item.note ? "Edit note" : "Add note"}
                  </button>
                </div>
                {item.note ? (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontStyle: "italic",
                      opacity: 0.8,
                    }}
                  >
                    “{item.note}”
                  </div>
                ) : null}
              </div>

              <div
                className="cart-item-right"
                style={{
                  display: "flex",
                  gap: 10,
                  flexDirection: "column",
                  alignItems: "flex-end",
                  marginLeft: 8,
                }}
              >
                <p>
                  {formatIDR(Number(item.price ?? 0), { withDecimals: true })}
                </p>

                <div className="stepper" role="group" aria-label="Quantity">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => handleDecreaseQty(item.id)}
                    aria-label="Decrease quantity"
                  >
                    –
                  </button>
                  <span className="stepper-qty" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => handleIncreaseQty(item.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
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
          {taxEnabled && (
            <div className="summary-row">
              <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
              <span>{formatIDR(tx, { withDecimals: true })}</span>
            </div>
          )}
          {serviceEnabled && (
            <div className="summary-row">
              <span>Service Charge ({(serviceRate * 100).toFixed(0)}%)</span>
              <span>{formatIDR(svc, { withDecimals: true })}</span>
            </div>
          )}
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

      {/* Customer Name Dialog */}
      {showCustomerNameDialog && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-name-title"
          onClick={() => setShowCustomerNameDialog(false)}
        >
          <div
            className="paymodal__dialog"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3 id="customer-name-title">Customer Name</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={() => setShowCustomerNameDialog(false)}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <label
                className="register-label"
                style={{ display: "block", marginBottom: 6 }}
              >
                Enter customer name
              </label>
              <input
                type="text"
                className="register-input"
                value={checkoutCustomerName}
                onChange={(e) => setCheckoutCustomerName(e.target.value)}
                placeholder="Customer name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && checkoutCustomerName.trim()) {
                    handleCustomerNameConfirm();
                  }
                }}
              />
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={handleCustomerNameConfirm}
                disabled={!checkoutCustomerName.trim()}
              >
                Continue to Payment
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowCustomerNameDialog(false)}
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

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
                  { k: "Open Bill", i: "📋" },
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

      {/* NEW: Post-Payment Print Options Modal */}
      {printDialog.open && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-print-title"
          onClick={() => {}}
        >
          <div
            className="paymodal__dialog"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="paymodal__head">
              <h3 id="post-print-title">Print Options</h3>
              {/* Intentionally no auto-close; user must click Close */}
            </header>

            <div className="paymodal__body">
              <p style={{ marginTop: 0 }}>
                Order <strong>#{printDialog.orderNumber}</strong> has been
                created. Choose what to print:
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handlePrintKitchen(printDialog.kotText)}
                  disabled={printBusy === "kitchen"}
                  title="Print Kitchen Ticket"
                >
                  {printBusy === "kitchen" ? "Printing…" : "Print Kitchen"}
                </button>

                <button
                  className="btn btn-primary"
                  onClick={() =>
                    handlePrintReceipt(
                      printDialog.receiptText,
                      printDialog.logoDataUrl
                    )
                  }
                  disabled={printBusy === "receipt"}
                  title="Print Customer Receipt"
                >
                  {printBusy === "receipt" ? "Printing…" : "Print Receipt"}
                </button>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                You can print either or both. This window will remain open until
                you close it.
              </p>
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-ghost"
                onClick={closePostPrintDialog}
                disabled={!!printBusy}
              >
                Close
              </button>
            </footer>
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

      {/* Add Category Modal */}
      <AddCategoryModal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onCreated={(newCat) => {
          reloadCategories().then(() => {
            if (newCat?.name) setSelectedCategory(newCat.name);
          });
        }}
      />

      {/* Open Bills Modal */}
      {showOpenBills && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="open-bills-title"
          onClick={() => setShowOpenBills(false)}
        >
          <div
            className="paymodal__dialog"
            style={{ maxWidth: "600px", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3 id="open-bills-title">Open Bills ({openBills.length})</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={() => setShowOpenBills(false)}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              {openBills.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#666",
                  }}
                >
                  No open bills
                </p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {openBills.map((bill) => (
                    <div
                      key={bill.orderNumber}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 16,
                        background: "#f9fafb",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <strong>Order #{bill.orderNumber}</strong>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#666",
                              marginTop: 4,
                              fontWeight: 500,
                            }}
                          >
                            Customer: {bill.customerName || "No name"}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#999",
                              marginTop: 2,
                            }}
                          >
                            {new Date(bill.createdAt).toLocaleString()}
                            {bill.updatedAt && (
                              <span
                                style={{ marginLeft: 8, fontStyle: "italic" }}
                              >
                                (Updated:{" "}
                                {new Date(bill.updatedAt).toLocaleString()})
                              </span>
                            )}
                          </div>
                          {editingOpenBill === bill.orderNumber && (
                            <div
                              style={{
                                fontSize: 12,
                                color: "#3b82f6",
                                marginTop: 4,
                                fontWeight: 500,
                              }}
                            >
                              Currently editing...
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ fontSize: 18 }}>
                            {formatIDR(bill.orderData.totalAmount, {
                              withDecimals: true,
                            })}
                          </strong>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 12,
                        }}
                      >
                        <button
                          className="btn btn-primary"
                          style={{
                            fontSize: 12,
                            padding: "6px 12px",
                            fontWeight: 600,
                          }}
                          onClick={() => handleLoadOpenBillToCart(bill)}
                          disabled={
                            !!editingOpenBill &&
                            editingOpenBill !== bill.orderNumber
                          }
                          title="Load this order to cart and add more items"
                        >
                          {editingOpenBill === bill.orderNumber
                            ? "Currently Editing"
                            : "Add Items"}
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                          onClick={() => handleReprintKitchen(bill)}
                          disabled={printBusy === "kitchen"}
                        >
                          {printBusy === "kitchen" ? "Printing…" : "Print KOT"}
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                          onClick={() => handleReprintReceipt(bill)}
                          disabled={printBusy === "receipt"}
                        >
                          {printBusy === "receipt"
                            ? "Printing…"
                            : "Print Receipt"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete order #${bill.orderNumber}? This cannot be undone.`
                              )
                            ) {
                              handleDeleteOpenBill(bill.orderNumber);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-ghost"
                onClick={() => setShowOpenBills(false)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
