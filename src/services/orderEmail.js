// src/services/orderEmail.js
import api from "./api";
export const EMAIL_COOLDOWN_SEC = 15;

export async function sendOrderEmail(orderId, to, logoUrl) {
  const id = encodeURIComponent(orderId);
  const res = await api.post(`/orders/${id}/email`, { to, logoUrl });
  return res.data;
}
