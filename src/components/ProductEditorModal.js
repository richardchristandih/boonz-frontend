import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { uploadImage } from "../utils/uploadImages";
import "./ProductEditorModal.css";

const MAX_FILE_MB = 5;
const ACCEPTED_TYPES = /image\/(png|jpe?g|webp|gif)/i;

export default function ProductEditorModal({
  open,
  product,
  onClose,
  onSaved,
}) {
  // ----- form state -----
  const [form, setForm] = useState({
    name: "",
    sku: "",
    price: "",
    quantity: "",
    category: "",
    description: "",
    imageUrl: "",
  });

  // ----- ui state -----
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef(null);

  // freeze background scroll
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.classList.add("pemodal-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      document.documentElement.style.overscrollBehavior = "";
      window.scrollTo(0, scrollY);
      document.body.classList.remove("pemodal-open");
    };
  }, [open]);

  // initialize when editing
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: product.price ?? "",
      quantity: product.quantity ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      imageUrl: product.imageUrl || product.image || "",
    });
    setErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [product]);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isCreate = useMemo(
    () => !product?._id && !product?.id && !product?.sku,
    [product]
  );

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
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
      const url = await uploadImage(file);
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
      const sku = String(form.sku || "").trim();
      const quantityNum = Number(form.quantity);
      const priceNum = Number(form.price);
      const category = String(form.category || "").trim();
      const description = String(form.description || "").trim();
      const imageUrl = String(form.imageUrl || "").trim();

      if (!name) return setErr("Product name is required.");
      if (!sku) return setErr("SKU is required.");
      if (!Number.isFinite(priceNum) || priceNum < 0)
        return setErr("Price must be a valid non-negative number.");
      if (!Number.isFinite(quantityNum) || quantityNum < 0)
        return setErr("Quantity must be a valid non-negative number.");

      setSaving(true);
      const payload = {
        name,
        sku,
        price: priceNum,
        quantity: quantityNum,
        category,
        description,
        imageUrl,
      };

      const updated = isCreate
        ? (await api.post("/products", payload)).data
        : (
            await api.put(
              `/products/${product._id || product.id || product.sku}`,
              payload
            )
          ).data;

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

  return createPortal(
    <div className="pemodal" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="pemodal__dialog"
        onClick={(e) => e.stopPropagation()}
        role="document"
        tabIndex={-1}
      >
        <header className="pemodal__head">
          <strong>{isCreate ? "Add Product" : `Edit Product`}</strong>
          <button
            className="pemodal__close"
            aria-label="Close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </header>

        <div className="pemodal__body">
          {err && (
            <div className="pemodal__error" role="alert">
              {err}
            </div>
          )}

          <label>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Iced Latte"
          />

          <div className="pemodal__grid2">
            <div>
              <label>SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setField("sku", e.target.value)}
                placeholder="e.g. LAT-001"
              />
            </div>
            <div>
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setField("quantity", e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
          </div>

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

          <label>Image</label>
          <div className="pemodal__thumbRow">
            <button
              type="button"
              className={`pemodal__thumb${form.imageUrl ? " has-img" : ""}`}
              onClick={() => form.imageUrl && setPreviewOpen(true)}
              disabled={!form.imageUrl}
            >
              {form.imageUrl ? (
                <img
                  src={form.imageUrl}
                  alt="thumbnail"
                  className="pemodal__thumbImg"
                  onError={() => setImgOk(false)}
                  onLoad={() => setImgOk(true)}
                />
              ) : (
                <span className="pemodal__thumbPlaceholder">+</span>
              )}
            </button>
            <div className="pemodal__thumbHelp">
              Click square to preview (after selecting or pasting an image).
            </div>
          </div>

          <div className="pemodal__fileRow">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
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
    </div>,
    document.body
  );
}
