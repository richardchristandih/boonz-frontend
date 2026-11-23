// controllers/productController.js
import { Product } from "../repositories.js";
import { Category } from "../repositories.js";

/* ----------------------------- helpers ----------------------------- */

function toNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function looksLikeUrl(u = "") {
  if (!isNonEmptyString(u)) return false;
  return /^https?:\/\//i.test(u) || u.startsWith("data:");
}

/**
 * Convert Google Drive sharing links to a direct "view" URL that <img> can render.
 * Supports:
 *  - https://drive.google.com/file/d/<ID>/view?usp=sharing
 *  - https://drive.google.com/open?id=<ID>
 *  - https://drive.google.com/uc?id=<ID>&export=download
 */
function driveShareToDirect(url = "") {
  if (!url) return "";
  try {
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    m = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    return url;
  } catch {
    return url;
  }
}

/**
 * Normalize image fields coming from client. Accepts either "imageUrl" or "image".
 * - Converts Google Drive share links to direct view URLs.
 * - Allows clearing by sending empty string.
 * Returns an object with { imageUrl, image } (both kept in sync).
 */
function normalizeImageFields(body = {}) {
  const raw = ((body.imageUrl ?? body.image) || "").trim();
  if (!raw) {
    return { imageUrl: "", image: "" };
  }
  const direct = driveShareToDirect(raw);
  return { imageUrl: direct, image: direct };
}

/** Whitelist & normalize incoming payload (excluding categoryId mapping) */
function pickProductPayload(body = {}) {
  const out = {};

  // name
  if ("name" in body && isNonEmptyString(body.name)) {
    out.name = String(body.name).trim();
  }

  // sku (optional)
  if ("sku" in body && isNonEmptyString(body.sku)) {
    out.sku = String(body.sku).trim();
  }

  // price
  if ("price" in body) {
    const price = toNumber(body.price, NaN);
    if (!Number.isNaN(price)) out.price = Math.max(0, price);
  }

  // quantity (optional)
  if ("quantity" in body) {
    const qty = Math.max(0, Math.trunc(toNumber(body.quantity, NaN)));
    if (Number.isFinite(qty)) out.quantity = qty;
  }

  // category (string form)
  if ("category" in body && isNonEmptyString(body.category)) {
    out.category = String(body.category).trim();
  }

  // description
  if ("description" in body) {
    out.description = String(body.description || "");
  }

  // image fields
  if ("imageUrl" in body || "image" in body) {
    const { imageUrl, image } = normalizeImageFields(body);
    if (!imageUrl || looksLikeUrl(imageUrl)) {
      out.imageUrl = imageUrl;
      out.image = image; // keep legacy in sync if model has "image"
    }
  }

  return out;
}

/**
 * Resolve a category name given { categoryId, category }.
 * - If categoryId is provided, it must exist; returns its .name.
 * - Else if category string provided, returns trimmed string.
 * - Else returns null (caller decides if required).
 */
async function resolveCategoryName({ categoryId, category }) {
  if (isNonEmptyString(categoryId)) {
    const cat = await Category.get(categoryId);
    if (!cat) {
      const err = new Error("Invalid categoryId");
      err.statusCode = 400;
      throw err;
    }
    return cat.name;
  }
  if (isNonEmptyString(category)) return String(category).trim();
  return null;
}

/* ------------------------------- CRUD ------------------------------ */

// GET /api/products?category=Coffee&categoryId=<id>&q=americano&page=1&limit=20
async function getProducts(req, res, next) {
  try {
    const { category, categoryId, q, page, limit } = req.query;

    const categoryName = await resolveCategoryName({ categoryId, category });
    const filters = { category: categoryName, search: isNonEmptyString(q) ? q.trim() : null };

    if (!("page" in req.query || "limit" in req.query)) {
      return res.json(await Product.list(filters));
    }

    const pageNum = Math.max(1, Math.trunc(toNumber(page, 1)));
    const lim = Math.min(200, Math.max(1, Math.trunc(toNumber(limit, 50))));
    const skip = (pageNum - 1) * lim;
    if (!Number.isSafeInteger(skip)) return res.status(400).json({ message: "Page is too large." });

    const { items, total } = await Product.list({ ...filters, limit: lim, offset: skip });
    return res.json({
      items,
      total,
      page: pageNum,
      limit: lim,
      hasMore: skip + items.length < total,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/products/:id
async function getProductById(req, res, next) {
  try {
    const item = await Product.get(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

// POST /api/products
// Body: { name, price, category? (string), categoryId? (ObjectId),
//         description?, sku?, quantity?, imageUrl?|image? }
async function createProduct(req, res, next) {
  try {
    const payload = pickProductPayload(req.body);

    // Resolve/require category
    const resolvedCategory = await resolveCategoryName({
      categoryId: req.body?.categoryId,
      category: payload.category,
    });
    if (!resolvedCategory) {
      return res.status(400).json({ message: "Category is required." });
    }
    payload.category = resolvedCategory;

    if (!payload.sku) return res.status(400).json({ message: "SKU is required." });

    // minimal validation
    if (!isNonEmptyString(payload.name)) {
      return res.status(400).json({ message: "Name is required." });
    }
    if (!("price" in payload)) {
      return res.status(400).json({ message: "Price is required." });
    }
    if (
      "imageUrl" in payload &&
      payload.imageUrl &&
      !looksLikeUrl(payload.imageUrl)
    ) {
      return res
        .status(400)
        .json({ message: "imageUrl must be an http(s) URL or data URI." });
    }

    const created = await Product.create({
      description: "",
      imageUrl: "",
      image: "",
      quantity: 0,
      ...payload,
    });

    res.status(201).json(created);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status !== 500)
      return res.status(status).json({ message: err.message });
    next(err);
  }
}

// PUT /api/products/:id
// Body: any subset of { name, price, category, categoryId, description, sku, quantity, imageUrl|image }
async function updateProduct(req, res, next) {
  try {
    const payload = pickProductPayload(req.body);

    // If categoryId provided (and explicit string category not provided),
    // map it to the category name so we keep the schema unchanged.
    if (req.body?.categoryId && !payload.category) {
      const cat = await Category.get(req.body.categoryId);
      if (!cat) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }
      payload.category = cat.name;
    }

    if (
      "imageUrl" in payload &&
      payload.imageUrl &&
      !looksLikeUrl(payload.imageUrl)
    ) {
      return res
        .status(400)
        .json({ message: "imageUrl must be an http(s) URL or data URI." });
    }

    const updated = await Product.update(req.params.id, payload);

    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/products/:id
async function deleteProduct(req, res, next) {
  try {
    const removed = await Product.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
