// routes/products.js
import express from "npm:express@4.22.3";
const router = express.Router();

import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";
import * as ctrl from "../controllers/productController.js";

router.get("/", ctrl.getProducts);
router.get("/:id", ctrl.getProductById);

router.post("/", auth, requireAdmin, ctrl.createProduct);
router.put("/:id", auth, requireAdmin, ctrl.updateProduct);
router.delete("/:id", auth, requireAdmin, ctrl.deleteProduct);

export default router;
