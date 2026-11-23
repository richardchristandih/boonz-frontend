// routes/orders.js
import express from "npm:express@4.22.3";
const router = express.Router();

import {
  createOrder,
  getOrders,
  updateOrderStatus,
  sendEmailReceipt,
} from "../controllers/orderController.js";

// Auth middleware (make sure this attaches req.user with a role)
import auth from "../middleware/authMiddleware.js";

/**
 * POST /orders
 * Create a new order
 */
router.post("/", auth, createOrder);

/**
 * GET /orders
 * List orders (optionally filter in controller via query params)
 */
router.get("/", auth, getOrders);

/**
 * PATCH /orders/:id
 * Update order status
 * - Non-admin: may only set status to "done"
 * - Admin: may set "pending" | "done" | "cancelled" | "refunded"
 */
router.patch("/:id", auth, updateOrderStatus);

/**
 * POST /orders/:orderId/send-email
 * (Re)send the receipt email for an order
 */
router.post("/:orderId/send-email", auth, sendEmailReceipt);

export default router;
