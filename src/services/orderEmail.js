// src/services/orderEmail.js
import api from "../services/api";

export const EMAIL_COOLDOWN_SEC = 60;

export async function sendOrderEmail(orderId, to, extra = {}) {
  if (!orderId) throw new Error("sendOrderEmail: Missing orderId");
  if (!to) throw new Error("sendOrderEmail: Missing 'to' email");
  await api.post(`/orders/${orderId}/send-email`, { to, ...extra });
}
