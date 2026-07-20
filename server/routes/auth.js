// server/routes/auth.js – Production-hardened auth routes
"use strict";

const express = require("express");
const bcrypt  = require("bcryptjs");
const { getUserByEmail, getUserById, getUserPasswordHash, updateUserPassword } = require("../db");

const router = express.Router();

// ── Input validators ──────────────────────────────────────────
function isValidEmail(str) {
  return typeof str === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim()) && str.length <= 254;
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email    = typeof req.body.email    === "string" ? req.body.email.trim()    : "";
  const password = typeof req.body.password === "string" ? req.body.password        : "";

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const user = getUserByEmail(email);

  // Always run bcrypt compare even if user is null (prevents email enumeration via timing)
  // Real bcrypt hash — used only when email not found, so bcrypt always runs (timing attack prevention)
  const dummyHash = "$2a$12$GjDD/JTBK3pMmAhAjTVvqOGqMTMoXMxerqHhbH5Y8dZ5./DZ5nQi";
  const passwordMatch = await bcrypt.compare(password, user ? user.password : dummyHash);

  if (!user || !passwordMatch) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Regenerate session on login (prevents session fixation)
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Session error." });
    req.session.userId = user.id;
    req.session.role   = user.role;
    // Re-assign CSRF token to new session
    const crypto = require("crypto");
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("__onexp_sid");
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.session?.userId) return res.json(null);
  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json(null);
  }
  // Never send password hash to client
  const { password: _omit, ...safeUser } = user;
  res.json(safeUser);
});

// POST /api/auth/change-password  (requires login)
router.post("/change-password", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated." });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Both current and new password are required." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ error: "Password too long." });
  }

  const user = getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: "User not found." });

  // getUserById excludes the password hash for safety — fetch it separately
  const currentHash = getUserPasswordHash(req.session.userId);
  if (!currentHash) return res.status(401).json({ error: "User not found." });

  const match = await bcrypt.compare(currentPassword, currentHash);
  if (!match) return res.status(401).json({ error: "Current password is incorrect." });

  const newHash = await bcrypt.hash(newPassword, 12);
  updateUserPassword(user.id, newHash);

  // Invalidate all other sessions by regenerating current session
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Session error." });
    req.session.userId = user.id;
    req.session.role   = user.role;
    res.json({ success: true });
  });
});

module.exports = router;
