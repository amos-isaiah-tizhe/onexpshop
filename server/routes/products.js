// server/routes/products.js – Input-validated, security-hardened
"use strict";

const express = require("express");
const { listProducts, getProduct, createProduct, updateProduct, deleteProduct } = require("../db");
const { requireAdmin, sanitiseId } = require("./middleware");

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────
function validateProductBody(body) {
  const errors = [];
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) errors.push("Name is required.");
  if (body.name?.length > 200) errors.push("Name too long (max 200 chars).");
  if (body.price === undefined || body.price === null) errors.push("Price is required.");
  const price = parseFloat(body.price);
  if (!Number.isFinite(price) || price < 0) errors.push("Price must be a non-negative number.");
  if (price > 1_000_000) errors.push("Price seems unreasonably large.");
  if (body.stock !== undefined) {
    const stock = parseInt(body.stock);
    if (!Number.isInteger(stock) || stock < 0) errors.push("Stock must be a non-negative integer.");
    if (stock > 1_000_000) errors.push("Stock value too large.");
  }
  // category_id / categoryId is optional — null means uncategorised
  // Validate image URLs — accept http, https, or relative paths starting with /
  const urls = body.imageUrls || body.image_urls;
  if (urls) {
    if (!Array.isArray(urls)) errors.push("imageUrls must be an array.");
    else if (urls.some(u => typeof u !== "string" || (!/^https?:\/\//i.test(u) && !u.startsWith("/")))) {
      errors.push("All image URLs must start with http:// or https://");
    }
  }
  return errors;
}

// GET /api/products  – list (public)
router.get("/", (req, res) => {
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : undefined;
  if (req.query.categoryId && (isNaN(categoryId) || categoryId <= 0)) {
    return res.status(400).json({ error: "Invalid categoryId." });
  }
  res.json(listProducts(categoryId));
});

// GET /api/products/:id  – get one (public)
router.get("/:id", sanitiseId, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(product);
});

// POST /api/products  – create (admin only)
router.post("/", requireAdmin, (req, res) => {
  const errors = validateProductBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  try {
    const id = createProduct(req.body);
    res.status(201).json(getProduct(id));
  } catch (err) {
    console.error("createProduct error:", err);
    res.status(500).json({ error: "Failed to create product." });
  }
});

// PUT /api/products/:id  – update (admin only)
router.put("/:id", requireAdmin, sanitiseId, (req, res) => {
  const errors = validateProductBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  try {
    updateProduct(req.params.id, req.body);
    res.json(getProduct(req.params.id));
  } catch (err) {
    console.error("updateProduct error:", err);
    res.status(500).json({ error: "Failed to update product." });
  }
});

// DELETE /api/products/:id  – delete (admin only)
router.delete("/:id", requireAdmin, sanitiseId, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  try {
    deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("deleteProduct error:", err);
    res.status(500).json({ error: "Failed to delete product." });
  }
});

module.exports = router;