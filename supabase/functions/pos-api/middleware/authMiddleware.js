// middleware/authMiddleware.js
import jwt from "npm:jsonwebtoken@9.0.2";

function authMiddleware(req, res, next) {
  // Accept both "Authorization: Bearer <token>" and "x-access-token"
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-access-token"] || "").toString();

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  // Try current and legacy secrets (backward compatible)
  const secrets = [
    Deno.env.get("ACCESS_TOKEN_SECRET"),
    Deno.env.get("JWT_SECRET"),
  ].filter(Boolean);

  if (secrets.length === 0) {
    console.error(
      "[auth] No JWT secret configured (ACCESS_TOKEN_SECRET / JWT_SECRET)"
    );
    return res.status(500).json({ message: "Auth misconfigured on server" });
  }

  let decoded = null;
  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
      break; // success
    } catch {
      // try next secret
    }
  }

  if (!decoded) {
    return res.status(401).json({ message: "Token is not valid" });
  }

  // Normalize common JWT shapes
  const userId = decoded.sub || decoded.userId || decoded.id || decoded._id;

  if (typeof userId !== "string" || !/^[a-f0-9]{24}$/.test(userId)) {
    return res.status(401).json({ message: "Token is not valid" });
  }

  req.user = {
    userId,
    role: decoded.role || "user",
    email: decoded.email,
    name: decoded.name,
  };

  return next();
}

export default authMiddleware;
