import { normalizeImageUrl } from "./driveUrl";

const productImages = require.context(
  "../images",
  true,
  /\.(png|jpe?g|gif|webp)$/
);

export function getImageSrc(product) {
  const raw = product?.imageUrl || product?.image || "";
  if (!raw) return null;
  const normalized = normalizeImageUrl(raw);
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) {
    return normalized;
  }
  try {
    return productImages("./" + normalized);
  } catch {
    return normalized;
  }
}
