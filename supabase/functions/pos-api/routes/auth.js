// routes/auth.js
import express from "npm:express@4.22.3";
const router = express.Router();

import {
  register,
  login,
  refreshToken,
} from "../controllers/userController.js";
import { sendAdminPin } from "../controllers/adminPinController.js";
import requireAdminPin from "../middleware/requireAdminPin.js";

// Send a one-time Admin PIN to the configured ADMIN_EMAIL
// POST /auth/admin-pin/send
router.post("/admin-pin/send", sendAdminPin);

// Register a new user
// If role === "admin", a valid adminPin in the body is required
router.post("/register", requireAdminPin, register);

// Login
router.post("/login", login);

// Refresh access token
router.post("/refresh", refreshToken);

export default router;
