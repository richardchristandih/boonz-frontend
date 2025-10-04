// src/pages/Categories.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function CategoriesPage() {
  const navigate = useNavigate();

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
    if (!name) return;
    try {
      await createCategory(name);
      setNewName("");
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to create category.");
    }
  }

  async function onRename(id, oldName) {
    const name = prompt("Rename category to:", oldName);
    if (!name || name.trim() === oldName) return;
    try {
      await renameCategory(id, name.trim());
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to rename category.");
    }
  }

  async function onDelete(id) {
    if (
      !window.confirm(
        "Delete this category? Products will keep the text name set previously."
      )
    )
      return;
    try {
      await deleteCategory(id);
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to delete category.");
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
    </div>
  );
}
