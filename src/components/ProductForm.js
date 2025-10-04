// src/components/ProductForm.js
import React, { useRef, useState, useEffect, useCallback } from "react";
import api from "../services/api";
import { uploadImage } from "../utils/uploadImages";
import { normalizeImageUrl } from "../utils/driveUrl";
import { listCategories } from "../services/categories";
import "./ProductForm.css";

const SEED_CATEGORIES = [
  "Coffee",
  "Drink",
  "Burger",
  "Beer",
  "Patisserie",
  "Matcha",
];
const PREFERRED_ORDER_FIRST = ["Coffee", "Burger"];

const MAX_FILE_MB = 5;
const ACCEPTED_TYPES = /image\/(png|jpe?g|webp|gif)/i;

function sortAndMergeCategories(seed = [], fromApi = []) {
  const merged = Array.from(new Set([...seed, ...fromApi.filter(Boolean)]));
  const preferred = PREFERRED_ORDER_FIRST.filter((n) => merged.includes(n));
  const rest = merged
    .filter((n) => !preferred.includes(n))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

const RefreshIcon = ({ spinning = false }) => (
  <svg
    className={spinning ? "pf-icn spin" : "pf-icn"}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      d="M20 12a8 8 0 10-2.34 5.66M20 4v6h-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ProductForm({ onSuccess, showTitle = false }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Coffee"); // default

  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imgReady, setImgReady] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [catOptions, setCatOptions] = useState(SEED_CATEGORIES);
  const [catsLoading, setCatsLoading] = useState(true);

  const fileInputRef = useRef(null);

  const loadCategories = useCallback(async () => {
    try {
      setCatsLoading(true);
      const cats = await listCategories(); // [{_id,name}]
      const fromApi = (Array.isArray(cats) ? cats : [])
        .map((c) => c?.name)
        .filter(Boolean);
      const merged = sortAndMergeCategories(SEED_CATEGORIES, fromApi);
      setCatOptions(merged);

      // keep selection valid; prefer Coffee if available
      if (!merged.includes(category)) {
        setCategory(
          merged.includes("Coffee") ? "Coffee" : merged[0] || "Coffee"
        );
      }
    } catch (e) {
      console.error("Failed to load categories in ProductForm:", e);
      setCatOptions(SEED_CATEGORIES);
      if (!SEED_CATEGORIES.includes(category)) setCategory("Coffee");
    } finally {
      setCatsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    setImgReady(false);
  }, [imageUrl]);

  function handleImgError() {
    setImgReady(false);
  }
  function handleImgLoad() {
    setImgReady(true);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.test(file.type)) {
      setError("Please select a PNG, JPG, WEBP, or GIF image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Image is too large. Max ${MAX_FILE_MB} MB.`);
      e.target.value = "";
      return;
    }

    setError("");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
    } catch (err) {
      console.error(err);
      setError("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || uploading) return;

    setError("");
    const priceNum = Number.parseFloat(price || "0");
    const qtyNum = Number.parseInt(quantity || "0", 10);

    if (!name.trim()) return setError("Name is required.");
    if (!sku.trim()) return setError("SKU is required.");
    if (!Number.isFinite(priceNum) || priceNum < 0)
      return setError("Price must be a non-negative number.");
    if (!Number.isFinite(qtyNum) || qtyNum < 0)
      return setError("Quantity must be a non-negative integer.");

    const productData = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      price: priceNum,
      quantity: qtyNum,
      description: description.trim(),
      category,
      imageUrl: normalizeImageUrl(imageUrl.trim()),
    };

    try {
      setSaving(true);
      await api.post("/products", productData);
      onSuccess?.();

      // Reset form (keep Coffee default if available)
      setName("");
      setSku("");
      setPrice("");
      setQuantity("");
      setDescription("");
      setCategory(
        catOptions.includes("Coffee") ? "Coffee" : catOptions[0] || "Coffee"
      );
      setImageUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Error creating product:", err);
      setError(
        err?.response?.data?.message ||
          "Failed to create product. Please check the inputs and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`product-form-container${showTitle ? "" : " no-title"}`}>
      {showTitle && <h2>Product Form</h2>}

      <form onSubmit={handleSubmit} className="product-form" autoComplete="off">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="pf-name">Name:</label>
        <input
          id="pf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Americano"
        />

        <label htmlFor="pf-sku">SKU:</label>
        <input
          id="pf-sku"
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          placeholder="AMR-001"
          autoCapitalize="characters"
        />

        <label htmlFor="pf-price">Price:</label>
        <input
          id="pf-price"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          placeholder="20000"
        />

        <label htmlFor="pf-qty">Quantity:</label>
        <input
          id="pf-qty"
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          placeholder="100"
        />

        <label htmlFor="pf-desc">Description:</label>
        <textarea
          id="pf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="(Optional) Short description..."
        />

        <label>Image</label>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="preview"
            className={`image-preview${imgReady ? " is-ready" : ""}`}
            onLoad={handleImgLoad}
            onError={handleImgError}
            style={{ display: imgReady ? "block" : "none" }}
          />
        )}

        <div className="file-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-label="Choose image to upload"
          />
          {uploading && (
            <span className="muted" aria-live="polite">
              Uploading...
            </span>
          )}
        </div>

        <label htmlFor="pf-img">Or paste Image URL:</label>
        <input
          id="pf-img"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.jpg (optional)"
        />

        <div className="cat-label-row">
          <label htmlFor="pf-cat" style={{ marginBottom: 0 }}>
            Category:
          </label>
          <button
            type="button"
            className="pf-refresh-btn"
            onClick={loadCategories}
            disabled={catsLoading}
            aria-label="Reload categories"
            title="Reload categories"
          >
            <RefreshIcon spinning={catsLoading} />
            {catsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <select
          id="pf-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          {catOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="create-button"
          disabled={saving || uploading}
        >
          {saving ? "Creating..." : "Create"}
        </button>
      </form>
    </div>
  );
}
