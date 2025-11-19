// src/services/inventory.js
import api from "./api";

export async function listInventoryItems(params = {}) {
  const { data } = await api.get("/inventory", { params });
  return Array.isArray(data) ? data : [];
}

export async function getInventoryItem(id) {
  const { data } = await api.get(`/inventory/${id}`);
  return data;
}

export async function createInventoryItem(item) {
  const { data } = await api.post("/inventory", item);
  return data;
}

export async function updateInventoryItem(id, updates) {
  const { data } = await api.patch(`/inventory/${id}`, updates);
  return data;
}

export async function deleteInventoryItem(id) {
  const { data } = await api.delete(`/inventory/${id}`);
  return data;
}

export async function updateInventoryQuantity(id, quantity, note = "") {
  const { data } = await api.patch(`/inventory/${id}/quantity`, {
    quantity: Number(quantity),
    note: note || undefined,
  });
  return data;
}

