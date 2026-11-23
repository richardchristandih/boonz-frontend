// routes/inventory.js
import express from "npm:express@4.22.3";
const router = express.Router();

import auth from "../middleware/authMiddleware.js";
import * as ctrl from "../controllers/inventoryController.js";

// All inventory routes require authentication
// But accessible to all users (not just admin)

// Get all inventory items (optionally filtered by category)
router.get("/", auth, ctrl.getInventoryItems);

// Get single inventory item
router.get("/:id", auth, ctrl.getInventoryItem);

// Create inventory item
router.post("/", auth, ctrl.createInventoryItem);

// Update inventory item
router.patch("/:id", auth, ctrl.updateInventoryItem);

// Update inventory quantity (special endpoint for quantity changes)
router.patch("/:id/quantity", auth, ctrl.updateInventoryQuantity);

// Delete inventory item
router.delete("/:id", auth, ctrl.deleteInventoryItem);

export default router;
