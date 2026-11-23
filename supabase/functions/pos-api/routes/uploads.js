import express from "npm:express@4.22.3";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";

const bucket = "pos-product-images";
const router = express.Router();
const maxImageBytes = 5 * 1024 * 1024;
const multipart = express.raw({ type: "multipart/form-data", limit: maxImageBytes + 8192 });

function imageType(buffer) {
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return ["png", "image/png"];
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return ["jpg", "image/jpeg"];
  if (["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return ["gif", "image/gif"];
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return ["webp", "image/webp"];
  }
  return [];
}

router.post("/image", auth, requireAdmin, multipart, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "An image is required." });
    let form;
    try {
      form = await new Response(req.body, { headers: { "Content-Type": req.get("Content-Type") } }).formData();
    } catch {
      return res.status(400).json({ message: "Invalid image upload." });
    }
    const image = form.get("image");
    if (!(image instanceof File) || [...form.keys()].length !== 1) {
      return res.status(400).json({ message: "Upload one image." });
    }
    if (image.size > maxImageBytes) return res.status(413).json({ message: "Image exceeds 5 MB." });
    const buffer = Buffer.from(await image.arrayBuffer());
    const [extension, contentType] = imageType(buffer);
    if (!extension) return res.status(400).json({ message: "Choose a PNG, JPEG, GIF, or WebP image." });

    const baseUrl = Deno.env.get("SUPABASE_URL");
    const key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !key) throw new Error("Product image storage is not configured.");

    const object = `${bucket}/${randomUUID()}.${extension}`;
    const response = await fetch(`${baseUrl}/storage/v1/object/${object}`, {
      method: "POST",
      headers: {
        apikey: key,
        ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }),
        "Content-Type": contentType,
      },
      body: buffer,
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Storage returned HTTP ${response.status}`);

    const publicUrl = Deno.env.get("POS_PUBLIC_URL") || baseUrl;
    res.json({ url: `${publicUrl}/storage/v1/object/public/${object}` });
  } catch (error) {
    next(error);
  }
});

export default router;
