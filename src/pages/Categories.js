// src/pages/Categories.jsx
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import WorkspacePage from "../components/WorkspacePage";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";

import {
  listCategories,
  createCategory,
  renameCategory,
  updateCategory,
  deleteCategory,
} from "../services/categories";
import "./Categories.css";

/* ---------- Lightweight skeletons ---------- */
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
            aria-label={title}
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
  const [params, setParams] = useSearchParams();
  const adding = params.get("view") === "add";
  const { show } = useToast();
  const confirm = useConfirm();

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [positionCategory, setPositionCategory] = useState(null);

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
      setCats(data);
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
    if (creating) return;
    const name = newName.trim();
    if (!name) {
      show("Please enter a category name.", { type: "info" });
      return;
    }
    if (cats.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      show("A category with that name already exists.", { type: "error" });
      return;
    }
    try {
      setCreating(true);
      await createCategory(name);
      setNewName("");
      setQuery("");
      await refresh();
      setParams({}, { replace: true });
      show("Category added.", { type: "success" });
    } catch (e) {
      show(e?.response?.data?.message || "Failed to create category.", { type: "error" });
    } finally {
      setCreating(false);
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

  async function onSetPosition(value) {
    const order = Number(value);
    if (!value.trim() || !Number.isSafeInteger(order) || order < 0) {
      show("Enter a whole number of zero or more.", { type: "error" });
      return;
    }
    try {
      await updateCategory(positionCategory._id, { order });
      setPositionCategory(null);
      await refresh();
      show("Category position saved.", { type: "success" });
    } catch (error) {
      show(error.response?.data?.message || "Couldn’t save the category position.", { type: "error" });
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

  const matching = cats.filter((category) => category.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <WorkspacePage title={adding ? "Add category" : "Categories"}
      description={adding ? "Give the category a name staff will recognize in the register." : "Organize the register menu and control which categories appear first."}
      className="workspace-categories"
      actions={adding ? <Link className="workspace-button" to="/admin/categories">View categories</Link> : <>
        <Link className="workspace-button" to="/product-page">Products</Link>
        <Link className="workspace-button primary" to="/admin/categories?view=add"><FiPlus aria-hidden="true" /> Add category</Link>
      </>}>
      {adding ? (
        <form className="workspace-section category-create" onSubmit={onAdd}>
          <div className="workspace-tools">
            <label>Category name<input type="text" required value={newName} disabled={creating}
              onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Coffee" /></label>
            <button className="workspace-button primary" type="submit" disabled={creating}>{creating ? "Adding…" : "Add category"}</button>
          </div>
        </form>
      ) : (
        <section className="workspace-section" aria-label="Menu categories">
          <div className="workspace-tools">
            <label>Search categories<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Category name" /></label>
          </div>
          {loading ? <CatListSkeleton rows={5} /> : err ? (
            <div role="alert"><p>{err}</p><button className="workspace-button" type="button" onClick={refresh}>Try again</button></div>
          ) : matching.length ? <>
            <p className="workspace-muted" role="status">{matching.length} of {cats.length} categories</p>
            <ul className="cat-list">
              {matching.map((category) => (
                <li key={category._id} className="cat-item">
                  <span className="cat-name"><strong>{category.name}</strong><small className="category-position">Position {category.order ?? 0}</small></span>
                  <div className="cat-actions">
                    <button type="button" className="workspace-button" onClick={() => setPositionCategory(category)}
                      aria-label={`Set position for ${category.name}`}>Position</button>
                    <button type="button" className="workspace-button" onClick={() => onRename(category._id, category.name)}>Rename</button>
                    <button type="button" className="workspace-button workspace-danger" onClick={() => onDelete(category._id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </> : <p className="workspace-muted">{query ? "No categories match your search." : "No categories yet."}</p>}
        </section>
      )}

      {positionCategory && <PromptDialog
        open
        title={`Set position for ${positionCategory.name}`}
        message="Lower numbers appear first in the register menu."
        defaultValue={String(positionCategory.order ?? 0)}
        onConfirm={onSetPosition}
        onCancel={() => setPositionCategory(null)}
      />}

      <PromptDialog
        open={renameModal.open}
        title="Rename Category"
        message="Enter a new category name:"
        defaultValue={renameModal.oldName}
        onConfirm={handleConfirmRename}
        onCancel={() => setRenameModal({ open: false, id: null, oldName: "" })}
      />
    </WorkspacePage>
  );
}
