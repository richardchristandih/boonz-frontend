import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import "./PublicMenu.css";
import { FiRefreshCw, FiSearch, FiShoppingBag, FiX } from "react-icons/fi";
import SafeImage from "../components/SafeImage";
import api from "../services/api";
import { getImageSrc } from "../utils/productImage";
import { listCategories } from "../services/categories";
import { formatIDR } from "../utils/money";
import appLogo from "../images/login-logo.png"; // your brand logo

/* ---------------- Constants ---------------- */
const DEFAULT_CATEGORY = "All";


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
export default function PublicMenu() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const reloadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setLoadError("");
    try {
      const { data } = await api.get("/products");
      const list = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(list)) throw new Error("Unexpected catalog response");
      setProducts(list);
    } catch {
      setLoadError("Couldn’t load the menu.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);
  useEffect(() => { reloadProducts(); }, [reloadProducts]);

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
    if (chipReady && !includesCI(chipNames, selectedCategory)) setSelectedCategory("All");
  }, [chipReady, chipNames, selectedCategory]);

  const term = searchTerm.trim().toLowerCase();
  const filteredProducts = useMemo(() => products.filter((product) => {
    const category = (product.category || "").trim().toLowerCase();
    if (term) return [product.name, category, product.description].some((value) => String(value || "").toLowerCase().includes(term));
    return selectedCategory === "All" || category === selectedCategory.toLowerCase();
  }), [products, term, selectedCategory]);

  const refreshData = () => Promise.all([reloadProducts(), reloadCategories()]);

  const isRefreshing = loadingProducts || categoriesLoading;

  return (
    <div className="boonz-register public-menu-page">
      <main className="public-menu-main">
        <header className="register-masthead">
          <div><img src={appLogo} alt="Boonz" className="public-menu-wordmark" /><h1>Menu</h1></div>
        </header>
        <div className="public-menu-tools">
          <div className="search-wrap">
            <FiSearch size={18} aria-hidden="true" />
            <input type="search" className="search-input" aria-label="Search the menu" placeholder="Search the menu"
              value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            {searchTerm && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setSearchTerm("")}><FiX aria-hidden="true" /></button>}
          </div>
          <button type="button" className="icon-btn" aria-label="Refresh menu" onClick={refreshData} disabled={isRefreshing}><FiRefreshCw aria-hidden="true" /></button>
        </div>
        {chipReady ? (
          <div className="chip-row" role="group" aria-label="Menu categories">
            {chipNames.map((name) => <button key={name} type="button"
              aria-pressed={name === selectedCategory && !term} className={`chip ${name === selectedCategory && !term ? "active" : ""}`}
              onClick={() => { setSelectedCategory(name); setSearchTerm(""); }}>{name === "All" ? "All items" : name}</button>)}
          </div>
        ) : <ChipsSkeleton />}
        <div className="register-catalog-heading"><h2>{term ? "Search results" : selectedCategory === "All" ? "All items" : selectedCategory}</h2>
          {!loadingProducts && !loadError && <span role="status">{filteredProducts.length} items</span>}</div>
        {loadingProducts ? <SkeletonGrid count={8} /> : loadError ? (
          <div className="empty-state" role="alert"><h3>{loadError}</h3><button type="button" className="empty-cta" onClick={refreshData}>Try again</button></div>
        ) : filteredProducts.length ? (
          <div className="product-grid">
            {filteredProducts.map((product) => {
              const image = getImageSrc(product);
              return (
                <article key={product._id || product.id || product.sku || product.name} className="product-card public-menu-card">
                  <div className="register-product-image">
                    {image ? <SafeImage className="product-image" src={image} alt="" loading="lazy" />
                      : <FiShoppingBag size={35} className="register-product-placeholder" aria-hidden="true" />}
                  </div>
                  <div className="register-product-info">
                    <h3 className="product-name">{product.name}</h3>
                    {product.description && <p className="public-item-description">{product.description}</p>}
                    <div className="register-product-meta"><span>{product.category}</span><strong className="product-price">{formatIDR(product.price)}</strong></div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><h3>No menu items found</h3>
            <button type="button" className="empty-cta" onClick={() => { setSearchTerm(""); setSelectedCategory("All"); }}>Show all items</button>
          </div>
        )}
      </main>
    </div>
  );
}
