// server/routes/settings.js
const express = require("express");
const { getSiteSettings, updateSiteSettings } = require("../db");
const { requireAdmin } = require("./middleware");

const router = express.Router();

// GET /api/settings  –  public (needed for logo, colours, title)
router.get("/", (req, res) => {
  const s = getSiteSettings();
  res.json(s || {
    siteTitle:       "OneXpShop",
    siteDescription: "Premium e-commerce platform",
    headerText:      "Welcome to OneXpShop",
    footerText:      "© 2026 OneXpShop. All rights reserved.",
    theme:           "light",
    primaryColor:    "#8063cc",
  });
});

// POST /api/settings  –  admin only (used by admin settings page)
router.post("/", requireAdmin, (req, res) => {
  try { res.json(updateSiteSettings(req.body)); }
  catch (err) { console.error(err); res.status(500).json({ error: "Failed to save settings." }); }
});

// PUT /api/settings  –  also supported for backwards compatibility
router.put("/", requireAdmin, (req, res) => {
  try { res.json(updateSiteSettings(req.body)); }
  catch (err) { console.error(err); res.status(500).json({ error: "Failed to save settings." }); }
});

module.exports = router;
