import api from "./api";

/** Shape we use everywhere:
 * { taxEnabled: boolean, taxRate: number, serviceEnabled: boolean, serviceRate: number }
 */

/** GET current settings from server */
export async function fetchOrderCharges() {
  const { data } = await api.get("/settings/order-charges");
  // tolerate different shapes / missing fields
  return {
    taxEnabled: !!data?.taxEnabled,
    taxRate: Number(data?.taxRate ?? 0) / (data?.taxRate > 1 ? 100 : 1), // accept 10 or 0.10
    serviceEnabled: !!data?.serviceEnabled,
    serviceRate:
      Number(data?.serviceRate ?? 0) / (data?.serviceRate > 1 ? 100 : 1),
  };
}

/** SAVE (PATCH) to server.
 * Accepts either 0.10 style or 10 style; we send percentage numbers (e.g., 10).
 */
export async function saveOrderCharges({
  taxEnabled,
  taxRate,
  serviceEnabled,
  serviceRate,
}) {
  const payload = {
    taxEnabled: !!taxEnabled,
    taxRate:
      Math.round(Number(taxRate) * 100) >= 1
        ? Number(taxRate)
        : Number(taxRate) * 100,
    serviceEnabled: !!serviceEnabled,
    serviceRate:
      Math.round(Number(serviceRate) * 100) >= 1
        ? Number(serviceRate)
        : Number(serviceRate) * 100,
  };
  const { data } = await api.patch("/settings/order-charges", payload);
  return data;
}
