// routes/promotions.js
import express from "npm:express@4.22.3";
const router = express.Router();

import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";
import * as ctrl from "../controllers/promotionController.js";

// Public read (if you want it protected, add `auth` here too)
router.get("/", ctrl.listPromotions);

// Admin create/update/delete (protected)
router.post("/", auth, requireAdmin, ctrl.createPromotion);
router.patch("/:id", auth, requireAdmin, ctrl.updatePromotion);
router.delete("/:id", auth, requireAdmin, ctrl.deletePromotion);
export default router;
