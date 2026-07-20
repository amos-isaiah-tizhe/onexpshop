// server/routes/middleware.js – Production-hardened middleware
"use strict";

const { getUserById } = require("../db");

// requireLogin: rejects the request if the user isn't logged in
function requireLogin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Login required." });
  }
  // Double-check the user still exists in DB (handles deleted accounts)
  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Session invalid." });
  }
  req.user = user;
  next();
}

// requireAdmin: rejects if user isn't an admin
function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Login required." });
  }
  const user = getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Session invalid." });
  }
  // Check BOTH session role AND database role (prevents role escalation via session tampering)
  if (req.session.role !== "admin" || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  req.user = user;
  next();
}

// sanitiseId: ensures :id param is a valid positive integer
function sanitiseId(req, res, next) {
  const id = parseInt(req.params.id);
  if (!id || id <= 0 || !Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid ID." });
  }
  req.params.id = id;
  next();
}

module.exports = { requireLogin, requireAdmin, sanitiseId };
