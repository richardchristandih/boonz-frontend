import { Promotion } from "../repositories.js";

function promotionFields(body, creating = false) {
  const fields = [
    "name", "type", "value", "active", "description", "minSubtotal", "maxDiscount", "startsAt", "endsAt",
  ];
  const data = Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field))
    .map((field) => [field, body[field]]));

  if (creating) {
    data.active ??= true;
    data.description ??= "";
    data.minSubtotal ??= 0;
    if (data.name == null || data.type == null || data.value == null) {
      throw Object.assign(new Error("A name, promotion type, and numeric value are required."), { status: 400 });
    }
  }

  for (const field of ["value", "minSubtotal", "maxDiscount"]) {
    if (data[field] != null) data[field] = Number(data[field]);
  }
  for (const field of ["startsAt", "endsAt"]) {
    if (Object.hasOwn(data, field)) data[field] = data[field] ? new Date(data[field]) : null;
  }

  const valid = {
    name: (value) => typeof value === "string" && value.trim(),
    type: (value) => ["percentage", "flat"].includes(value),
    value: Number.isFinite,
    active: (value) => typeof value === "boolean",
    description: (value) => typeof value === "string",
    minSubtotal: Number.isFinite,
    maxDiscount: (value) => value === null || Number.isFinite(value),
    startsAt: (value) => value === null || Number.isFinite(value.getTime()),
    endsAt: (value) => value === null || Number.isFinite(value.getTime()),
  };
  for (const [field, value] of Object.entries(data)) {
    if (!valid[field](value)) {
      throw Object.assign(new Error(`Invalid promotion ${field}.`), { status: 400 });
    }
  }
  return data;
}

export const createPromotion = async (req, res, next) => {
  try {
    const fields = promotionFields(req.body, true);
    const promotion = await Promotion.create({ ...fields, createdBy: req.user.userId });
    res.status(201).json(promotion);
  } catch (error) {
    next(error);
  }
};

export const listPromotions = async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = active === undefined ? null : String(active).toLowerCase() === "true";
    res.json(await Promotion.list(filter));
  } catch (error) {
    next(error);
  }
};

export const updatePromotion = async (req, res, next) => {
  try {
    const promotion = await Promotion.update(req.params.id, promotionFields(req.body));
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });
    res.json(promotion);
  } catch (error) {
    next(error);
  }
};

export const deletePromotion = async (req, res, next) => {
  try {
    const promotion = await Promotion.remove(req.params.id);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
