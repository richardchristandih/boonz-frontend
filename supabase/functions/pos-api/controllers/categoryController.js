// controllers/categoryController.js
import { Category } from "../repositories.js";

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function cleanName(s = "") {
  return s.toString().trim();
}

/** GET /api/categories */
export const listCategories = async (req, res, next) => {
  try {
    const items = await Category.list();
    res.json(items);
  } catch (e) {
    next(e);
  }
};

/** POST /api/categories  { name, color?, order? }  (admin only) */
export const createCategory = async (req, res, next) => {
  try {
    const name = cleanName(req.body.name || "");
    if (!name) return res.status(400).json({ message: "Name is required" });

    const doc = await Category.create({
      name,
      slug: slugify(name),
      active: true,
      color: req.body.color || null,
      order: Number.isFinite(+req.body.order) ? +req.body.order : 0,
      createdBy: req.user?.userId,
    });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/categories/:id */
export const updateCategory = async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.name === "string" && req.body.name.trim()) {
      update.name = cleanName(req.body.name);
      update.slug = slugify(update.name);
    }
    if (typeof req.body.color === "string")
      update.color = req.body.color || null;
    if (req.body.order !== undefined)
      update.order = Number(req.body.order) || 0;
    if (req.body.active !== undefined) update.active = !!req.body.active;

    const doc = await Category.update(req.params.id, update);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/categories/:id */
export const deleteCategory = async (req, res, next) => {
  try {
    const r = await Category.remove(req.params.id);
    if (!r) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
