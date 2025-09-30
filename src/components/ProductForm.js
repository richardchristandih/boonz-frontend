// src/components/ProductForm.jsx
import React, { useRef, useState } from "react";
import api from "../services/api";
import { uploadImage } from "../utils/uploadImages";
import { normalizeImageUrl } from "../utils/driveUrl"; // <-- make sure this file exists (see note below)
import "./ProductForm.css";

const CATEGORY_OPTIONS = [
  "Coffee",
  "Drink",
  "Burger",
  "Beer",
  "Patisserie",
  "Matcha",
];

const MAX_FILE_MB = 5;
const ACCEPTED_TYPES = /image\/(png|jpe?g|webp|gif)/i;

/**
 * ProductForm
 * @param {Function} onSuccess  - callback after successful create
 * @param {boolean}  showTitle  - render internal <h2>; default false
 */
export default function ProductForm({ onSuccess, showTitle = false }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Coffee");

  // image handling
  const [imageUrl, setImageUrl] = useState(""); // can be uploaded URL or pasted URL
  const [uploading, setUploading] = useState(false);

  // ui state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // quick validations
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
      const url = await uploadImage(file); // POST /uploads/image -> { url }
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

    // Guard numeric parsing (avoid NaN)
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
      sku: sku.trim(),
      price: Number.isFinite(priceNum) ? priceNum : 0,
      quantity: Number.isFinite(qtyNum) ? qtyNum : 0,
      description: description.trim(),
      category,
      imageUrl: normalizeImageUrl(imageUrl.trim()),
    };

    try {
      setSaving(true);
      await api.post("/products", productData);
      onSuccess?.();

      // Reset form
      setName("");
      setSku("");
      setPrice("");
      setQuantity("");
      setDescription("");
      setCategory("Coffee");
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
        {error && <div className="error">{error}</div>}

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

        {/* Image upload + URL (both supported) */}
        <label>Image</label>
        {imageUrl && (
          <img src={imageUrl} alt="preview" className="image-preview" />
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

        <label htmlFor="pf-cat">Category:</label>
        <select
          id="pf-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          {CATEGORY_OPTIONS.map((opt) => (
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
