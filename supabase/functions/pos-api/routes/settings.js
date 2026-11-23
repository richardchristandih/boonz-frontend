import express from "npm:express@4.22.3";
const router = express.Router();

import {
  getOrderCharges,
  updateOrderCharges,
} from "../controllers/settingController.js";
import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";

// Anyone logged-in can read current charges (so POS can fetch)
router.get("/order-charges", auth, getOrderCharges);

// Only admins can modify
router.patch("/order-charges", auth, requireAdmin, updateOrderCharges);

export default router;
