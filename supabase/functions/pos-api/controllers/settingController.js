import { Setting } from "../repositories.js";

/** Normalize incoming numbers: accept 10 or 0.10; return decimals (0.10). */
function normalizePercentToDecimal(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return x > 1 ? x / 100 : x;
}

const DEFAULTS = {
  taxEnabled: false,
  taxRate: 0, // decimal (0.10 = 10%)
  serviceEnabled: false,
  serviceRate: 0, // decimal
};

async function getOrderCharges(req, res, next) {
  try {
    const data = { ...DEFAULTS, ...await Setting.get("order-charges") };
    // harden types
    data.taxEnabled = !!data.taxEnabled;
    data.serviceEnabled = !!data.serviceEnabled;
    data.taxRate = Number(data.taxRate) || 0;
    data.serviceRate = Number(data.serviceRate) || 0;
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

async function updateOrderCharges(req, res, next) {
  try {
    const {
      taxEnabled,
      taxRate, // may be 10 or 0.10
      serviceEnabled,
      serviceRate, // may be 5 or 0.05
    } = req.body || {};

    const nextData = {
      taxEnabled: !!taxEnabled,
      taxRate: normalizePercentToDecimal(taxRate),
      serviceEnabled: !!serviceEnabled,
      serviceRate: normalizePercentToDecimal(serviceRate),
    };

    // basic guards
    if (nextData.taxRate < 0 || nextData.taxRate > 1) {
      return res
        .status(400)
        .json({ message: "taxRate must be 0–1 (decimal) or 0–100 (%)" });
    }
    if (nextData.serviceRate < 0 || nextData.serviceRate > 1) {
      return res
        .status(400)
        .json({ message: "serviceRate must be 0–1 (decimal) or 0–100 (%)" });
    }

    return res.json(await Setting.set("order-charges", nextData));
  } catch (err) {
    next(err);
  }
}

export {
  getOrderCharges,
  updateOrderCharges,
};
