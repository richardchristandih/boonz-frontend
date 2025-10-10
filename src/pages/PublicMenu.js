import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import "./PublicMenu.css"; // reuse your existing styles
import SafeImage from "../components/SafeImage";
import api from "../services/api";
import { normalizeImageUrl } from "../utils/driveUrl";
import { listCategories } from "../services/categories";
import { formatIDR } from "../utils/money";
import appLogo from "../images/login-logo.png"; // your brand logo

/* ---------------- Constants ---------------- */
const MOBILE_BP = 1024;
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

/* ---------------- Helpers ---------------- */
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
export default function PublicMenu() {
  const isMobile = useIsMobile();
  const initRef = useRef(true);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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

  const reloadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const cats = await listCategories();
      setCategories(Array.isArray(cats) ? cats : []);
    } catch {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);
  useEffect(() => {
    reloadCategories();
  }, [reloadCategories]);

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

  const refreshData = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const [prodRes] = await Promise.all([
        api.get("/products").catch(() => ({ data: [] })),
        reloadCategories(),
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
  }, [reloadCategories]);

  const isRefreshing = loadingProducts || categoriesLoading;

  return (
    <div className="layout-container">
      <main className="layout-main">
        {/* Brand Header */}
        <header className="public-header" role="banner">
          <a href="/menu" aria-label="Home">
            <img src={appLogo} alt="Your Brand Logo" className="public-logo" />
          </a>
          {/* optional title */}
          {/* <div className="public-title">
            <strong>Your Café</strong>
            <small>Menu</small>
          </div> */}
        </header>

        {/* Top bar (chips + search) */}
        <div className="layout-topbar">
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
              aria-label="Search"
              onClick={() => setShowSearchBar((s) => !s)}
            >
              <i className="fas fa-search" />
            </button>

            {showSearchBar && (
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

            <button
              className="icon-btn"
              aria-label="Refresh data"
              title="Refresh"
              onClick={refreshData}
              disabled={isRefreshing}
            >
              <i
                className={`fas ${
                  isRefreshing ? "fa-circle-notch fa-spin" : "fa-sync"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Products */}
        <div className="products-area">
          {loadingProducts ? (
            <SkeletonGrid count={12} />
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-art">🍽️</div>
              <h3>No products in “{selectedCategory || "All"}”</h3>
              <p>Try another category or use search above.</p>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
