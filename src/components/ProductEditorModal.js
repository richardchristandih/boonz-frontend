import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { uploadImage } from "../utils/uploadImages";
import "./ProductEditorModal.css";

const MAX_FILE_MB = 5;
const ACCEPTED_TYPES = /image\/(png|jpe?g|webp|gif)/i;

export default function ProductEditorModal({
  open,
  product, // object to edit
  onClose, // () => void
  onSaved, // (updatedProduct) => void
}) {
  // form state
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
    imageUrl: "", // canonical field we’ll save
  });

  // ui state
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const fileInputRef = useRef(null);

  // Pre-fill when opening / product changes
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? "",
      price: product.price ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      // prefer imageUrl, fall back to legacy image
      imageUrl: product.imageUrl || product.image || "",
    });
    setErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [product]);

  const isCreate = useMemo(
    () => !product?._id && !product?.id && !product?.sku,
    [product]
  );

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // validations
    if (!ACCEPTED_TYPES.test(file.type)) {
      setErr("Please choose a PNG, JPG, WEBP, or GIF image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setErr(`Image is too large. Max ${MAX_FILE_MB} MB.`);
      e.target.value = "";
      return;
    }

    setErr("");
    setUploading(true);
    try {
      const url = await uploadImage(file); // -> backend /uploads/image
      setField("imageUrl", url);
    } catch (error) {
      console.error("Upload failed:", error);
      setErr("Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    try {
      setErr("");

      const name = String(form.name || "").trim();
      const priceNum = Number(form.price);
      const category = String(form.category || "").trim();
      const description = String(form.description || "").trim();
      const imageUrl = String(form.imageUrl || "").trim();

      if (!name) return setErr("Product name is required.");
      if (!Number.isFinite(priceNum) || priceNum < 0)
        return setErr("Price must be a valid non-negative number.");

      setSaving(true);

      // Send canonical field imageUrl; backend controller supports it
      const payload = {
        name,
        price: priceNum,
        category,
        description,
        imageUrl,
      };

      let updated;
      if (isCreate) {
        const res = await api.post("/products", payload);
        updated = res.data;
      } else {
        const id = product._id || product.id || product.sku;
        const res = await api.put(`/products/${id}`, payload);
        updated = res.data;
      }

      onSaved?.(updated);
      onClose?.();
    } catch (e) {
      console.error("Save failed:", e);
      setErr(
        e?.response?.data?.message || e?.message || "Failed to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="pemodal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pemodal__dialog" onClick={(e) => e.stopPropagation()}>
        <header className="pemodal__head">
          <strong>
            {isCreate ? "Add Product" : `Edit: ${product?.name ?? ""}`}
          </strong>
          <button
            className="pemodal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="pemodal__body">
          {err && <div className="pemodal__error">{err}</div>}

          <label>Product Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Iced Latte"
          />

          <div className="pemodal__grid2">
            <div>
              <label>Price (Rp.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setField("price", e.target.value)}
                placeholder="e.g. 25000"
              />
            </div>
            <div>
              <label>Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="e.g. Coffee"
                list="pemodal-categories"
              />
              <datalist id="pemodal-categories">
                <option value="Coffee" />
                <option value="Drink" />
                <option value="Burger" />
                <option value="Beer" />
                <option value="Patisserie" />
                <option value="Matcha" />
              </datalist>
            </div>
          </div>

          <label>Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Optional description..."
          />

          {/* Image upload & URL */}
          <label>Image</label>
          {form.imageUrl ? (
            <img
              src={form.imageUrl}
              alt="preview"
              className="pemodal__preview"
            />
          ) : (
            <div className="pemodal__preview --empty" aria-hidden="true" />
          )}

          <div className="pemodal__fileRow">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              aria-label="Choose image to upload"
              disabled={uploading || saving}
            />
            {uploading && <span className="muted">Uploading…</span>}
          </div>

          <label>Or paste Image URL</label>
          <input
            type="url"
            value={form.imageUrl}
            onChange={(e) => setField("imageUrl", e.target.value)}
            placeholder="https://your-backend/static/coffee.jpg"
          />

          <div className="pemodal__hint">
            You can either upload a file (recommended) or paste an absolute URL.
            Uploaded files are served from your backend at{" "}
            <code>/static/&lt;filename&gt;</code>.
          </div>
        </div>

        <footer className="pemodal__actions">
          <button
            className="btn outline"
            onClick={onClose}
            disabled={saving || uploading}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleSave}
            disabled={saving || uploading}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
