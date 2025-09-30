// src/utils/money.js
export function formatIDR(value, { withDecimals = true } = {}) {
  const opts = {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  };
  return new Intl.NumberFormat("id-ID", opts).format(Number(value || 0));
}
