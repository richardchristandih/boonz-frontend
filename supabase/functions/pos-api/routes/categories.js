// routes/categories.js
import express from "npm:express@4.22.3";
const router = express.Router();

import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";
import * as ctrl from "../controllers/categoryController.js";

// Public list (you can switch to auth if you prefer)
router.get("/", ctrl.listCategories);

// Admin create/update/delete
router.post("/", auth, requireAdmin, ctrl.createCategory);
router.patch("/:id", auth, requireAdmin, ctrl.updateCategory);
router.delete("/:id", auth, requireAdmin, ctrl.deleteCategory);

export default router;
