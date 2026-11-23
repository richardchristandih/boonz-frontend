// middleware/requireAdminPin.js
import { verifyAndConsume } from "../utils/adminPin.js";

export default async function requireAdminPin(req, res, next) {
  try {
    const role = String(req.body?.role || "user").toLowerCase();
    if (role === "user") return next();
    if (role !== "admin") return res.status(400).json({ message: "Invalid registration role." });

    const adminPin = req.body?.adminPin;
    if (!adminPin) {
      return res.status(403).json({ message: "Admin PIN is required." });
    }
    const { ok, reason } = await verifyAndConsume(adminPin);
    if (!ok) {
      const why =
        reason === "expired"
          ? "Admin PIN expired. Request a new one."
          : reason === "too-many-attempts"
          ? "Too many attempts. Request a new PIN."
          : "Invalid PIN.";
      return res.status(403).json({ message: why });
    }
    // PIN verified — proceed to normal register controller
    next();
  } catch (err) {
    next(err);
  }
};
