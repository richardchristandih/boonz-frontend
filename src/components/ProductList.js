import React, { useEffect, useState, useMemo } from "react";
import api from "../services/api";
import ProductEditorModal from "./ProductEditorModal";
import SafeImage from "../components/SafeImage";
import { normalizeImageUrl } from "../utils/driveUrl";
import "./ProductList.css";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

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
  const [sort, setSort] = useState("name");

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState(null);

  const { show } = useToast();
  const confirm = useConfirm();

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

  // ← refresh after save
  function applySaved(updated) {
    const id = updated?._id || updated?.id || updated?.sku;
    if (!id) {
      closeEditor();
      return;
    }

    // 1) Optimistic local merge (instant UI feedback)
    setProducts((prev) =>
      prev.map((p) =>
        (p?._id || p?.id || p?.sku) === id ? { ...p, ...updated } : p
      )
    );

    // 2) Close the modal
    closeEditor();

    // 3) Pull fresh list from server (ensures derived fields/images/prices are right)
    //    No need to await; the list will update when finished.
    load();
  }

  async function handleRemove(productId) {
    if (!isAdmin || !productId) return;
    const ok = await confirm({ title: "Remove product?", message: "This removes the product from the menu.", confirmText: "Remove" });
    if (!ok) return;

    try {
      setRemoving(productId);
      await api.delete(`/products/${productId}`);
      setProducts((prev) =>
        prev.filter((p) => (p?._id || p?.id || p?.sku) !== productId)
      );
    } catch (err) {
      console.error("Delete failed:", err);
      show("Failed to remove product.", { type: "error" });
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
      const matchSearch = !q || name.includes(q) || cat.includes(q) || String(p?.sku || "").toLowerCase().includes(q);
      const matchCategory =
        category === "all" || cat === category.toLowerCase();
      return matchSearch && matchCategory;
    }).sort((a, b) => {
      if (sort === "price") return Number(a.price) - Number(b.price) || a.name.localeCompare(b.name);
      if (sort === "quantity") return Number(a.quantity ?? 0) - Number(b.quantity ?? 0) || a.name.localeCompare(b.name);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [products, search, category, sort]);

  const containerClass = `product-list-container${
    showTitle ? "" : " no-title"
  }${scroll ? " list-scroll" : ""}`;

  return (
    <div className={containerClass} role="region" aria-label="Product list">
      {showTitle && <h2 className="product-list-title">Product List</h2>}

      {/* Filter controls */}
      {!loading && !error && products.length > 0 && (
        <>
          <div className="product-filters workspace-tools">
            <label>Search products<input type="search" className="product-search" placeholder="Name, SKU, or category"
              value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>Category<select aria-label="Category" className="product-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : item}</option>)}
            </select></label>
            <label>Sort by<select aria-label="Sort by" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="name">Name</option><option value="price">Price, low to high</option><option value="quantity">Quantity, low to high</option>
            </select></label>
            {(search || category !== "all" || sort !== "name") && <button type="button" className="workspace-button"
              onClick={() => { setSearch(""); setCategory("all"); setSort("name"); }}>Reset filters</button>}
          </div>
          <p className="workspace-muted" role="status">{filtered.length} of {products.length} products</p>
        </>
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
        <div role="alert"><p className="product-list-status error">{error}</p><button className="workspace-button" type="button" onClick={load}>Try again</button></div>
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
                    <span className="product-row-meta">{p.sku && <>SKU {p.sku} · </>}Quantity {p.quantity ?? 0}</span>
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
        onSaved={applySaved} // ← ensures list refresh after save
      />
    </div>
  );
}
