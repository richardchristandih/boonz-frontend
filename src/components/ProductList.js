import React, { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import ProductEditorModal from "./ProductEditorModal";
import SafeImage from "../components/SafeImage";
import { normalizeImageUrl } from "../utils/driveUrl";
import "./ProductList.css";

function fmtRp(v) {
  const n = Number(v);
  const safe = Number.isFinite(n) ? n : 0;
  return `Rp.${safe.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getThumbSrc(p) {
  const raw = p?.imageUrl || p?.image || "";
  return raw ? normalizeImageUrl(raw) : "";
}

function SkeletonRow() {
  return (
    <li className="product-list-item is-skeleton">
      <div className="product-thumb skeleton-block" />
      <div className="product-info">
        <div className="product-main">
          <span className="skeleton-line w-40" />
          <span className="skeleton-line w-20" />
        </div>
        <div className="product-actions">
          <span className="skeleton-btn" />
          <span className="skeleton-btn" />
        </div>
      </div>
    </li>
  );
}

export default function ProductList({ showTitle = false, scroll = false }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemoving] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState(null);

  // User
  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const isAdmin =
    (user?.role && String(user.role).toLowerCase() === "admin") ||
    user?.isAdmin === true;

  async function load() {
    try {
      setLoading(true);
      const res = await api.get("/products");
      setProducts(Array.isArray(res.data) ? res.data : res.data?.items || []);
      setError("");
    } catch (err) {
      console.error("Error fetching products:", err);
      setError("Failed to load products.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openEditor(product) {
    if (!isAdmin || !product) return;
    setEditorProduct(product);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorProduct(null);
  }

  function applySaved(updated) {
    const id = updated?._id || updated?.id || updated?.sku;
    if (!id) return closeEditor();
    setProducts((prev) =>
      prev.map((p) =>
        (p?._id || p?.id || p?.sku) === id ? { ...p, ...updated } : p
      )
    );
    closeEditor();
  }

  async function handleRemove(productId) {
    if (!isAdmin || !productId) return;
    const ok = window.confirm("Remove this product? This cannot be undone.");
    if (!ok) return;

    try {
      setRemoving(productId);
      await api.delete(`/products/${productId}`);
      setProducts((prev) =>
        prev.filter((p) => (p?._id || p?.id || p?.sku) !== productId)
      );
    } catch (err) {
      console.error("Delete failed:", err);
      window.alert("Failed to remove product.");
    } finally {
      setRemoving(null);
    }
  }

  // Extract unique categories
  const categories = useMemo(() => {
    const all = products
      .map((p) => (p?.category ? String(p.category).trim() : ""))
      .filter(Boolean);
    return ["all", ...Array.from(new Set(all))];
  }, [products]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const name = p?.name?.toLowerCase() || "";
      const cat = String(p?.category || "").toLowerCase();
      const matchSearch = !q || name.includes(q) || cat.includes(q);
      const matchCategory =
        category === "all" || cat === category.toLowerCase();
      return matchSearch && matchCategory;
    });
  }, [products, search, category]);

  const containerClass = `product-list-container${
    showTitle ? "" : " no-title"
  }${scroll ? " list-scroll" : ""}`;

  return (
    <div className={containerClass} role="region" aria-label="Product list">
      {showTitle && <h2 className="product-list-title">Product List</h2>}

      {/* Filter controls */}
      {!loading && !error && products.length > 0 && (
        <div className="product-filters">
          <input
            type="text"
            className="product-search"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="product-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Categories" : c}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <ul className="product-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {!loading && error && (
        <p className="product-list-status error">{error}</p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="product-list-empty">No products found.</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="product-list">
          {filtered.map((p, idx) => {
            const realId = p?._id || p?.id || p?.sku;
            const key = realId || `row-${idx}`;
            const name = p?.name ?? "(Untitled)";
            const price = fmtRp(p?.price);
            const thumb = getThumbSrc(p);
            const tag = p?.category ? String(p.category) : "";

            return (
              <li key={key} className="product-list-item">
                <div className="product-thumb">
                  <SafeImage
                    className="product-thumb-img"
                    src={thumb}
                    alt={name}
                  />
                </div>

                <div className="product-info">
                  <div className="product-main">
                    <span className="product-name" title={name}>
                      {name}
                    </span>
                    {tag && <span className="product-tag">{tag}</span>}
                    <span className="product-price">{price}</span>
                  </div>

                  {isAdmin && (
                    <div className="product-actions">
                      <button
                        className="product-edit-btn"
                        onClick={() => openEditor(p)}
                        disabled={!realId}
                        title={!realId ? "Cannot edit (no id)" : "Edit product"}
                      >
                        Edit
                      </button>
                      <button
                        className="product-remove-btn"
                        onClick={() => handleRemove(realId)}
                        disabled={!realId || removingId === realId}
                        title={
                          !realId ? "Cannot remove (no id)" : "Remove product"
                        }
                      >
                        {removingId === realId ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ProductEditorModal
        open={editorOpen}
        product={editorProduct}
        onClose={closeEditor}
        onSaved={applySaved}
      />
    </div>
  );
}
