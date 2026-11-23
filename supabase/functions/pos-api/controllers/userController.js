// controllers/userController.js
import bcrypt from "npm:bcryptjs@3.0.2";
import jwt from "npm:jsonwebtoken@9.0.2";
import { User } from "../repositories.js";

/* ----------------------------- REGISTER ----------------------------- */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const role = String(req.body.role || "user").toLowerCase();
    if (typeof name !== "string" || !name.trim() || typeof email !== "string" ||
        !email.trim() || typeof password !== "string" || !password || bcrypt.truncates(password)) {
      return res.status(400).json({ message: "Name, email, and a password of up to 72 bytes are required." });
    }

    const existingUser = await User.byEmail(email);
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await User.create({ name, email, password: hashedPassword, role });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------- LOGIN ----------------------------- */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const user = await User.byEmail(email);
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const accessToken = jwt.sign(
      { sub: user._id, role: user.role, email: user.email, name: user.name },
      Deno.env.get("ACCESS_TOKEN_SECRET"),
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { sub: user._id, role: user.role },
      Deno.env.get("REFRESH_TOKEN_SECRET"),
      { expiresIn: "30d" }
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* --------------------------- REFRESH TOKEN -------------------------- */
export const refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ message: "Missing refresh token" });

  let payload;
  try {
    payload = jwt.verify(refreshToken, Deno.env.get("REFRESH_TOKEN_SECRET"), {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  try {
    const user = typeof payload.sub === "string" ? await User.get(payload.sub) : null;
    if (!user) return res.status(401).json({ message: "Invalid refresh token" });

    const accessToken = jwt.sign(
      { sub: user._id, role: user.role, email: user.email, name: user.name },
      Deno.env.get("ACCESS_TOKEN_SECRET"),
      { expiresIn: "15m" }
    );
    return res.json({ accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------- UPDATE ME ---------------------------- */
/**
 * PATCH /api/users/me
 * Body: { name?: string, email?: string, currentPassword?: string, newPassword?: string }
 * In our UI we only use { name } for now.
 */
export const updateMe = async (req, res, next) => {
  try {
    const userId = req.user?.userId; // set by authMiddleware
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { name, email, currentPassword, newPassword } = req.body || {};
    const user = await User.get(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const changes = {};

    // Update display name
    if (typeof name === "string" && name.trim()) {
      changes.name = name.trim();
    }

    // (Optional) allow email change later (not used by UI now)
    if (email && email !== user.email) {
      const exists = await User.byEmail(email);
      if (exists)
        return res.status(400).json({ message: "Email is already in use." });
      changes.email = String(email).trim().toLowerCase();
    }

    // (Optional) password change (not used by UI now)
    if (newPassword) {
      if (!currentPassword) {
        return res
          .status(400)
          .json({ message: "Current password is required." });
      }
      const ok = await bcrypt.compare(currentPassword, user.password || "");
      if (!ok)
        return res
          .status(400)
          .json({ message: "Current password is incorrect." });

      const salt = await bcrypt.genSalt(10);
      changes.password = await bcrypt.hash(newPassword, salt);
    }

    const updated = await User.update(userId, changes);
    if (!updated) return res.status(404).json({ message: "User not found" });

    const safe = {
      _id: updated._id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    };
    res.json(safe);
  } catch (err) {
    next(err);
  }
};
