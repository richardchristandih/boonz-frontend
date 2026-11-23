import express from "npm:express@4.22.3";
import cors from "npm:cors@2.8.5";
import { query } from "./database.js";
import auth from "./middleware/authMiddleware.js";
import errorHandler from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import dashboardRoutes from "./routes/dashboard.js";
import inventoryRoutes from "./routes/inventory.js";
import memberRoutes from "./routes/members.js";
import orderRoutes from "./routes/orders.js";
import productRoutes from "./routes/products.js";
import promotionRoutes from "./routes/promotions.js";
import settingRoutes from "./routes/settings.js";
import uploadRoutes from "./routes/uploads.js";
import userRoutes from "./routes/users.js";

export const app = express();
const api = express.Router();
const allowedOrigins = (Deno.env.get("FRONTEND_ORIGIN") || "*").split(",").map((origin) => origin.trim());

app.disable("x-powered-by");
app.use(cors({
  origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "apikey", "x-access-token"],
}));
app.use(express.json({ limit: "100kb" }));

api.get("/", (_req, res) => res.json({ message: "POS App Backend API" }));
api.get("/health", async (_req, res, next) => {
  try {
    await query("select 1 from pos_private.settings limit 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
api.use("/auth", authRoutes);
api.use("/categories", categoryRoutes);
api.use("/inventory", inventoryRoutes);
api.use("/members", memberRoutes);
api.use("/orders", orderRoutes);
api.use("/products", productRoutes);
api.use("/promotions", promotionRoutes);
api.use("/settings", settingRoutes);
api.use("/uploads", uploadRoutes);
api.use("/users", userRoutes);
api.use("/dashboard", auth, dashboardRoutes);

api.post("/qz/sign", auth, express.text({ type: "text/plain", limit: "16kb" }), async (req, res, next) => {
  try {
    const signer = Deno.env.get("POS_QZ_SIGNER_URL");
    if (!signer) return res.status(503).json({ message: "QZ signing is not configured." });
    if (typeof req.body !== "string" || !req.body) {
      return res.status(400).json({ message: "Signing payload is required." });
    }
    const response = await fetch(signer, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: req.body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return res.status(502).json({ message: "QZ signer failed." });
    }
    res.type("text/plain").send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use("/pos-api", api);
app.use((_req, res) => res.status(404).json({ message: "Route not found." }));
app.use(errorHandler);
