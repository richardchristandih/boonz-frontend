import React, { useState } from "react";
import { createCategory } from "../services/categories";

/**
 * Reuses your existing paymodal / register-input / btn styles.
 */
export default function AddCategoryModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSave() {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      setError("Please enter a category name.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const cat = await createCategory(trimmed);
      setName("");
      onCreated?.(cat); // notify parent so it can refresh chips
      onClose?.();
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Failed to create category.";
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="paymodal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="addcat-title"
      onClick={() => !saving && onClose?.()}
    >
      <div
        className="paymodal__dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="paymodal__head">
          <h3 id="addcat-title">Add Category</h3>
          <button
            className="paymodal__close"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </header>

        <div className="paymodal__body">
          <label className="register-label">Category Name</label>
          <input
            className="register-input"
            type="text"
            placeholder="e.g. Beer"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {error && (
            <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 14 }}>
              {error}
            </p>
          )}
        </div>

        <footer className="paymodal__actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
