// src/services/categories.js
import api from "./api";

// attach Authorization header when we have a token
const authConfig = () => {
  const token = localStorage.getItem("token");
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
};

export async function listCategories(params = {}) {
  const { data } = await api.get("/categories", { params });
  return Array.isArray(data) ? data : [];
}

export async function createCategory(name, color) {
  const payload = { name: String(name).trim() };
  if (color && String(color).trim()) payload.color = String(color).trim();
  const { data } = await api.post("/categories", payload, authConfig());
  return data; // created category doc
}

// generic patch (aligns with routes/categories.js -> router.patch("/:id"))
export async function updateCategory(id, patch) {
  const { data } = await api.patch(`/categories/${id}`, patch, authConfig());
  return data;
}

// convenience rename helper
export async function renameCategory(id, name) {
  const { data } = await api.patch(`/categories/${id}`, { name });
  return data;
}

export async function deleteCategory(id) {
  const { data } = await api.delete(`/categories/${id}`, authConfig());
  return data;
}
