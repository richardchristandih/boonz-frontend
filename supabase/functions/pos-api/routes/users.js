import express from "npm:express@4.22.3";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import * as userController from "../controllers/userController.js";

router.patch("/me", auth, userController.updateMe);

export default router;
