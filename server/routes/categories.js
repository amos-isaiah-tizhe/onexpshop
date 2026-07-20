// server/routes/categories.js
const express = require("express");
const { listCategories, getCategory, createCategory, updateCategory, deleteCategory } = require("../db");
const { requireAdmin } = require("./middleware");

const router = express.Router();

// GET /api/categories  –  list all categories (public)
router.get("/", (req, res) => {
  res.json(listCategories());
});

// GET /api/categories/:id  –  get one category (public)
router.get("/:id", (req, res) => {
  const category = getCategory(parseInt(req.params.id));
  if (!category) return res.status(404).json({ error: "Not found" });
  res.json(category);
});

// POST /api/categories  –  create category (admin only)
router.post("/", requireAdmin, (req, res) => {
  const { name, slug, description, displayOrder } = req.body;
  if (!name || !slug) return res.status(400).json({ error: "Name and slug are required" });

  try {
    const id = createCategory({ name, slug, description, displayOrder });
    res.status(201).json({ id, ...req.body });
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Slug already exists" });
    }
    res.status(500).json({ error: "Failed to create category" });
  }
});

// PUT /api/categories/:id  –  update category (admin only)
router.put("/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  updateCategory(id, req.body);
  res.json(getCategory(id));
});

// DELETE /api/categories/:id  –  delete category (admin only)
router.delete("/:id", requireAdmin, (req, res) => {
  deleteCategory(parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
