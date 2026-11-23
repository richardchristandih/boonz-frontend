export default function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === "23505") {
    const messages = {
      user_email: "Email is already in use.",
      category_name: "Category already exists.",
      category_slug: "Category already exists.",
      product_sku: "SKU is already in use.",
    };
    return res.status(409).json({ message: messages[error.constraint] || "Record already exists." });
  }
  const status = error.statusCode || error.status;
  if (status >= 400 && status < 500) {
    const message = error.type === "entity.parse.failed" ? "Invalid JSON." : error.message;
    return res.status(status).json({ message });
  }
  console.error("POS API error", error.code || error.message);
  res.status(500).json({ message: "Internal server error." });
}
