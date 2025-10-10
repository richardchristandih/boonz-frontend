// src/pages/Categories.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

import {
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from "../services/categories";
import "./Categories.css";

/* ---------- Lightweight skeletons ---------- */
function AddFormSkeleton() {
  return (
    <div className="card add-form" aria-hidden="true">
      <label className="label">New Category</label>
      <div className="row">
        <span className="skel skel-input skel-anim" />
        <span className="skel skel-btn skel-anim" />
      </div>
    </div>
  );
}
function CatListSkeleton({ rows = 8 }) {
  return (
    <ul className="cat-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="cat-item">
          <span className="skel skel-line skel-anim" style={{ width: 200 }} />
          <div className="cat-actions">
            <span className="skel skel-chip skel-anim" />
            <span className="skel skel-chip skel-anim" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Inline Prompt dialog (to avoid native prompt 'hostname says') ---------- */
function PromptDialog({
  open,
  title = "Rename",
  message = "Enter a new value:",
  defaultValue = "",
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);

  // keep input in sync when dialog is reopened with a different default
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter") onConfirm(value);
  };

  return (
    <div
      className="paymodal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
      onClick={onCancel}
    >
      <div
        className="paymodal__dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="paymodal__head">
          <h3 id="prompt-title">{title}</h3>
          <button
            className="paymodal__close"
            aria-label="Close"
            onClick={onCancel}
          >
            ✕
          </button>
        </header>
        <div className="paymodal__body">
          <p className="muted" style={{ marginBottom: 8 }}>
            {message}
          </p>
          <input
            type="text"
            className="register-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
        </div>
        <footer className="paymodal__actions">
          <button className="btn btn-primary" onClick={() => onConfirm(value)}>
            OK
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const confirm = useConfirm();

  // simple admin gate (same behavior as before)
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  if (!user || user.role !== "admin") {
    return <div className="page-container">Access denied. Admins only.</div>;
  }

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");

  // rename modal state
  const [renameModal, setRenameModal] = useState({
    open: false,
    id: null,
    oldName: "",
  });

  async function refresh() {
    try {
      setLoading(true);
      setErr("");
      const data = await listCategories();
      setCats(
        (Array.isArray(data) ? data : []).sort((a, b) =>
          (a?.name || "").localeCompare(b?.name || "")
        )
      );
    } catch (e) {
      console.error(e);
      setErr("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onAdd(e) {
    e.preventDefault();
    const name = (newName || "").trim();
    if (!name) {
      show("Please enter a category name.", { type: "info" });
      return;
    }
    try {
      await createCategory(name);
      setNewName("");
      await refresh();
      show("Category added.", { type: "success" });
    } catch (e) {
      show(e?.response?.data?.message || "Failed to create category.", {
        type: "error",
      });
    }
  }

  function onRename(id, oldName) {
    // open custom prompt instead of window.prompt
    setRenameModal({ open: true, id, oldName });
  }

  async function handleConfirmRename(nextName) {
    const trimmed = (nextName || "").trim();
    if (!trimmed || trimmed === renameModal.oldName) {
      setRenameModal({ open: false, id: null, oldName: "" });
      return;
    }
    try {
      await renameCategory(renameModal.id, trimmed);
      await refresh();
      show("Category renamed.", { type: "success" });
    } catch (e) {
      show(e?.response?.data?.message || "Failed to rename category.", {
        type: "error",
      });
    } finally {
      setRenameModal({ open: false, id: null, oldName: "" });
    }
  }

  async function onDelete(id) {
    const ok = await confirm({
      title: "Delete category?",
      message:
        "Products will keep the text name set previously. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteCategory(id);
      await refresh();
      show("Category deleted.", { type: "success" });
    } catch (e) {
      show(e?.response?.data?.message || "Failed to delete category.", {
        type: "error",
      });
    }
  }

  const firstLoad = loading && cats.length === 0 && !err;

  return (
    <div className="page-container">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="page-title">Categories</h1>

      {firstLoad ? (
        <AddFormSkeleton />
      ) : (
        <form className="card add-form" onSubmit={onAdd}>
          <label className="label">New Category</label>
          <div className="row">
            <input
              type="text"
              className="input"
              placeholder="e.g. Coffee"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              Add
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">All Categories</h2>
        </div>
        <div className="card__body">
          {loading ? (
            <CatListSkeleton rows={8} />
          ) : err ? (
            <p className="danger">{err}</p>
          ) : cats.length === 0 ? (
            <p className="muted">No categories yet.</p>
          ) : (
            <ul className="cat-list">
              {cats.map((c) => (
                <li key={c._id} className="cat-item">
                  <span className="cat-name">{c.name}</span>
                  <div className="cat-actions">
                    <button
                      className="btn sm"
                      onClick={() => onRename(c._id, c.name)}
                    >
                      Rename
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={() => onDelete(c._id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Rename Prompt */}
      <PromptDialog
        open={renameModal.open}
        title="Rename Category"
        message="Enter a new category name:"
        defaultValue={renameModal.oldName}
        onConfirm={handleConfirmRename}
        onCancel={() => setRenameModal({ open: false, id: null, oldName: "" })}
      />
    </div>
  );
}
