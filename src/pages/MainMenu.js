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
import { formatIDR } from "../utils/money";
import AddCategoryModal from "../components/AddCategoryModal";

/* ---------------- Constants ---------------- */
const TAX_ENABLED = localStorage.getItem("settings.taxEnabled") === "true";
const SERVICE_ENABLED =
  localStorage.getItem("settings.serviceEnabled") === "true";
const TAX_RATE = Number(localStorage.getItem("settings.taxRate")) / 100 || 0.1;
const SERVICE_CHARGE_RATE =
  Number(localStorage.getItem("settings.serviceRate")) / 100 || 0.05;
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
  if (!w) return alert("Pop-up blocked. Please allow pop-ups and try again.");
  w.document.open();
  w.document.write(html);
  w.document.close();
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
  });
  const openCustomize = useCallback((product) => {
    setCustomize({
      open: true,
      product,
      sugar: "Full",
      ice: "Normal",
      toppings: [],
    });
  }, []);
  const cancelCustomize = useCallback(() => {
    setCustomize((s) => ({ ...s, open: false, product: null }));
  }, []);

  const applyCustomize = useCallback(() => {
    const { product, sugar, ice, toppings } = customize;
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

    const note = `Sugar: ${sugar} | Ice: ${ice}${chosenToppings}`;
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
          ice,
          toppings: Array.from(toppings || []),
          toppingUnitAddOn: TOPPING_PRICE_IDR,
        },
      },
    ]);

    setCustomize({
      open: false,
      product: null,
      sugar: "Normal",
      ice: "Normal",
      toppings: [],
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
    if (!orderNumber) return alert("Place an order first.");
    if (!email) return alert("Enter an email address.");
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
  useEffect(() => {
    if (!mobileCartOpen) return;
    rowRefs.current.forEach?.((el) => {
      if (el) el.style.transform = "translateX(0)";
    });
  }, [mobileCartOpen]);

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
    const confirmed = window.confirm(
      "This will clear local settings (printers, logo, email cooldowns, UI prefs) and reload.\n\nYour login will stay signed in.\n\nContinue?"
    );
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
  const tx = useMemo(() => (TAX_ENABLED ? sub * TAX_RATE : 0), [sub]);
  const svc = useMemo(
    () => (SERVICE_ENABLED ? sub * SERVICE_CHARGE_RATE : 0),
    [sub]
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
      if (
        DRINK_CATEGORIES.some((c) => c.toLowerCase() === category.toLowerCase())
      ) {
        openCustomize(product);
        return;
      }

      // 2) Fries -> flavor modal
      if (isFries(product)) {
        openFriesCustomize(product);
        return;
      }

      // 3) Default path (no customization)
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
    [openCustomize, openFriesCustomize]
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

  /* ---------- Swipe-to-delete ---------- */
  const rowRefs = useRef(new Map());
  const pointerStartX = useRef(0);
  const pointerDeltaX = useRef({});
  const activePointerById = useRef({});
  const isDraggingById = useRef({});
  const SWIPE_THRESHOLD = 60; // px
  const MAX_LEFT = -120;

  const handlePointerDown = useCallback((e, id) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = rowRefs.current.get(id);
    if (!el) return;

    activePointerById.current[id] = e.pointerId;
    isDraggingById.current[id] = false;
    pointerStartX.current = e.clientX ?? 0;
    pointerDeltaX.current[id] = 0;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {}
    el.classList.add("swiping");
  }, []);

  const handlePointerMove = useCallback((e, id) => {
    const el = rowRefs.current.get(id);
    if (!el) return;
    const expectedPid = activePointerById.current[id];
    if (expectedPid == null || e.pointerId !== expectedPid) return;

    const x = e.clientX ?? 0;
    const delta = Math.min(0, x - pointerStartX.current);
    pointerDeltaX.current[id] = delta;
    if (!isDraggingById.current[id] && Math.abs(delta) > 3) {
      isDraggingById.current[id] = true;
    }
    const clamped = Math.max(delta, MAX_LEFT);
    el.style.transform = `translateX(${clamped}px)`;
  }, []);

  const snapBack = (el) => {
    el.style.transition = "transform .18s ease";
    el.style.transform = "translateX(0)";
    const clean = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", clean);
    };
    el.addEventListener("transitionend", clean);
  };

  const slideOutAndRemove = (el, id, removeCb) => {
    el.style.transition = "transform .18s ease";
    el.style.transform = "translateX(-100%)";
    const after = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", after);
      removeCb(id);
    };
    el.addEventListener("transitionend", after);
  };

  const handlePointerUpOrCancel = useCallback((id, removeCb) => {
    const el = rowRefs.current.get(id);
    if (!el) return;

    const delta = pointerDeltaX.current[id] || 0;
    const wasDragging = !!isDraggingById.current[id];

    delete activePointerById.current[id];
    delete isDraggingById.current[id];
    el.classList.remove("swiping");
    try {
      el.releasePointerCapture?.();
    } catch {}

    if (wasDragging && Math.abs(delta) > SWIPE_THRESHOLD) {
      slideOutAndRemove(el, id, removeCb);
    } else if (wasDragging) {
      snapBack(el);
    }
  }, []);

  const getSwipeHandlers = (id) => ({
    ref: (el) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    onPointerDown: (e) => handlePointerDown(e, id),
    onPointerMove: (e) => handlePointerMove(e, id),
    onPointerUp: () => handlePointerUpOrCancel(id, handleRemoveItem),
    onPointerCancel: () => handlePointerUpOrCancel(id, handleRemoveItem),
    style: { touchAction: "pan-y" },
  });

  /* ---------- Checkout ---------- */
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) {
      window.alert("Your cart is empty!");
      return;
    }
    setShowPaymentModal(true);
  }, [cart.length]);

  const finishOrder = (newOrderNumber) => {
    setShowPaymentModal(false);
    setMobileCartOpen(false);
    setCart([]);
    setSelectedPromoId("");
    setDiscountMode("promo");
    setDiscountValue("0");
    setDiscountNote("");
    setDiscountType("flat");
    setSelectedPaymentMethod("");
    window.alert(
      `Order placed successfully! Your order number is ${newOrderNumber}`
    );
  };

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
        note: normalizeNote(item.note) || undefined,
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

      try {
        const { receiptCopies, kitchenCopies } = getPrinterPrefs();
        const dateStr = new Date().toLocaleString();

        const printedCustomerName =
          (wantEmailReceipt && (customerName || "").trim()) || user?.name || "";

        const kotText = buildKitchenTicket({
          orderNumber: newOrderNumber || "N/A",
          dateStr,
          orderType: orderData.orderType,
          items: orderData.products,
          customer: { name: printedCustomerName || user?.name },
        });

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
          showTax: TAX_ENABLED,
          showService: SERVICE_ENABLED,
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

        if (isAndroidBridge()) {
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
          for (let i = 0; i < kitchenCopies; i++) {
            await androidPrintWithRetry(kotText, {
              address: kitchenTarget,
              nameLike: kitchenTarget,
              copies: 1,
              tries: 3,
              baseDelay: 3000,
            });
          }
          await sleep(PAUSE_AFTER_KOT_MS);
          for (let i = 0; i < receiptCopies; i++) {
            const printedWithLogo = androidPrintLogoAndText(
              logoDataUrl,
              receiptText,
              { address: receiptTarget, nameLike: receiptTarget }
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
              await sleep(700);
            }
          }
          finishOrder(newOrderNumber);
          return;
        }

        if (isAndroidChrome()) {
          const html = buildReceiptHtml({
            address: "Jl. Mekar Utama No. 61, Bandung",
            orderNumber: newOrderNumber || "N/A",
            dateStr,
            items: orderData.products,
            subtotal: orderData.subtotal,
            tax: orderData.tax,
            service: orderData.serviceCharge,
            showTax: TAX_ENABLED,
            showService: SERVICE_ENABLED,
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
    PAUSE_AFTER_KOT_MS,
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
      window.location.reload();
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
                      {...getSwipeHandlers(item.id)}
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
                {TAX_ENABLED && (
                  <div className="summary-row">
                    <span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
                    <span>{formatIDR(tx, { withDecimals: true })}</span>
                  </div>
                )}
                {SERVICE_ENABLED && (
                  <div className="summary-row">
                    <span>
                      Service Charge ({(SERVICE_CHARGE_RATE * 100).toFixed(0)}%)
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
            <div
              key={item.id}
              className="cart-item"
              {...getSwipeHandlers(item.id)}
            >
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
          {TAX_ENABLED && (
            <div className="summary-row">
              <span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
              <span>{formatIDR(tx, { withDecimals: true })}</span>
            </div>
          )}
          {SERVICE_ENABLED && (
            <div className="summary-row">
              <span>
                Service Charge ({(SERVICE_CHARGE_RATE * 100).toFixed(0)}%)
              </span>
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
              <div style={{ marginBottom: 12 }}>
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
    </div>
  );
}
