// ============================================================
// server/db.js  –  Database layer using sql.js
// ============================================================

"use strict";

const path   = require("path");
const fs     = require("fs");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "shop.db");
try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}

let db  = null;
let SQL = null;

function saveToDisk() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function getDb() {
  if (!db) throw new Error("Database not initialised. Call setupDatabase() first.");
  return db;
}

function run(sql, params = []) {
  getDb().run(sql, params);
  saveToDisk();
}

function get(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getLastInsertId() {
  const row = get("SELECT last_insert_rowid() as id");
  return row ? row.id : null;
}

// ── Migration helper ──────────────────────────────────────────
// Safely adds a column if it doesn't already exist.
// SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS,
// so we check the existing columns first.
function addColumnIfMissing(table, column, definition) {
  try {
    const cols = all(`PRAGMA table_info(${table})`);
    const exists = cols.some(c => c.name === column);
    if (!exists) {
      getDb().run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      saveToDisk();
      console.log(`  ✅ Migration: added ${table}.${column}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  Migration warning for ${table}.${column}:`, err.message);
  }
}

async function setupDatabase() {
  const initSqlJs = require("sql.js");
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log("✅ Database loaded from:", DB_PATH);
  } else {
    db = new SQL.Database();
    console.log("✅ New database created:", DB_PATH);
  }

  db.run("PRAGMA foreign_keys = ON;");

  // ── Users ─────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Site Settings ─────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      site_title       TEXT NOT NULL DEFAULT 'OneXpShop',
      site_description TEXT,
      logo_url         TEXT,
      favicon_url      TEXT,
      header_text      TEXT,
      footer_text      TEXT DEFAULT '© 2026 OneXpShop. All rights reserved.',
      theme            TEXT NOT NULL DEFAULT 'light',
      primary_color    TEXT NOT NULL DEFAULT '#403166',
      accent_color     TEXT NOT NULL DEFAULT '#906fe5',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Categories ────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Products ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      description   TEXT,
      price         REAL NOT NULL,
      category_id   INTEGER,
      image_urls    TEXT NOT NULL DEFAULT '[]',
      stock         INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Orders ────────────────────────────────────────────────
  // payment_method: "paystack" | "whatsapp"
  // payment_status: "pending" | "paid" | "failed" | "whatsapp_pending"
  // paystack_reference: the reference from Paystack after payment
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number        TEXT NOT NULL UNIQUE,
      customer_name       TEXT NOT NULL,
      customer_email      TEXT NOT NULL,
      customer_phone      TEXT,
      customer_address    TEXT NOT NULL,
      total_amount        REAL NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending',
      payment_method      TEXT NOT NULL DEFAULT 'whatsapp',
      payment_status      TEXT NOT NULL DEFAULT 'pending',
      paystack_reference  TEXT,
      notes               TEXT,
      user_id             INTEGER,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Order Items ───────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id       INTEGER NOT NULL,
      product_id     INTEGER NOT NULL,
      product_name   TEXT NOT NULL,
      quantity       INTEGER NOT NULL,
      price_per_unit REAL NOT NULL,
      subtotal       REAL NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  saveToDisk();

  // ── Migrations for existing databases ────────────────────
  // These run safely even if the DB already exists — they only
  // add columns that are missing (no data loss).
  console.log("🔄 Running migrations…");
  addColumnIfMissing("orders", "payment_method",     "TEXT NOT NULL DEFAULT 'whatsapp'");
  addColumnIfMissing("orders", "payment_status",     "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing("orders", "paystack_reference", "TEXT");

  // ── Seed admin ────────────────────────────────────────────
  const userCount = get("SELECT COUNT(*) as count FROM users");
  if (!userCount || userCount.count === 0) {
    const hash = bcrypt.hashSync("admin123", 10);
    db.run(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      ["Admin", "admin@shop.com", hash, "admin"]
    );
    saveToDisk();
    console.log("✅ Default admin created: admin@shop.com / admin123");
  }

  // ── Seed settings ─────────────────────────────────────────
  const settingsCount = get("SELECT COUNT(*) as count FROM site_settings");
  if (!settingsCount || settingsCount.count === 0) {
    db.run(
      "INSERT INTO site_settings (site_title, site_description, header_text) VALUES (?, ?, ?)",
      ["OneXpShop", "Premium e-commerce platform", "Welcome to OneXpShop"]
    );
    saveToDisk();
  }

  console.log("✅ Database ready");
}

// ── parseProduct ──────────────────────────────────────────────
function parseProduct(row) {
  if (!row) return null;
  return {
    ...row,
    category_id: row.category_id != null ? Number(row.category_id) : null,
    imageUrls:   (() => { try { return JSON.parse(row.image_urls || "[]"); } catch { return []; } })(),
    isActive:    row.is_active === 1 || row.is_active === true,
    is_active:   row.is_active === 1 || row.is_active === true,
  };
}

// ============================================================
// USER QUERIES
// ============================================================
function getUserByEmail(email) {
  return get("SELECT * FROM users WHERE email = ?", [email]);
}
function getUserById(id) {
  return get("SELECT id, name, email, role, created_at FROM users WHERE id = ?", [id]);
}
function getUserPasswordHash(id) {
  const row = get("SELECT password FROM users WHERE id = ?", [id]);
  return row ? row.password : null;
}
function updateUserPassword(id, hashedPassword) {
  run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, id]);
}

// ============================================================
// SITE SETTINGS QUERIES
// ============================================================
function getSiteSettings() {
  const row = get("SELECT * FROM site_settings LIMIT 1");
  if (!row) return null;
  return {
    ...row,
    siteTitle:       row.site_title,
    siteDescription: row.site_description,
    logoUrl:         row.logo_url,
    faviconUrl:      row.favicon_url,
    headerText:      row.header_text,
    footerText:      row.footer_text,
    primaryColor:    row.primary_color,
    accentColor:     row.accent_color,
  };
}

function updateSiteSettings(data) {
  const existing = getSiteSettings();
  const colMap = {
    siteTitle:       "site_title",
    siteDescription: "site_description",
    logoUrl:         "logo_url",
    faviconUrl:      "favicon_url",
    headerText:      "header_text",
    footerText:      "footer_text",
    theme:           "theme",
    primaryColor:    "primary_color",
    accentColor:     "accent_color",
  };
  const fields = [], values = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
  }
  if (fields.length === 0) return getSiteSettings();
  if (!existing) { db.run("INSERT INTO site_settings DEFAULT VALUES"); saveToDisk(); }
  const id = existing ? existing.id : getLastInsertId();
  fields.push("updated_at = datetime('now')");
  values.push(id);
  run(`UPDATE site_settings SET ${fields.join(", ")} WHERE id = ?`, values);
  return getSiteSettings();
}

// ============================================================
// CATEGORY QUERIES
// ============================================================
function listCategories() {
  return all("SELECT * FROM categories ORDER BY display_order ASC, id ASC");
}
function getCategory(id) {
  return get("SELECT * FROM categories WHERE id = ?", [id]);
}
function createCategory(data) {
  run(
    "INSERT INTO categories (name, slug, description, display_order) VALUES (?, ?, ?, ?)",
    [data.name, data.slug, data.description || null, data.displayOrder || 0]
  );
  return getLastInsertId();
}
function updateCategory(id, data) {
  if (data.name         !== undefined) run("UPDATE categories SET name = ?, updated_at = datetime('now') WHERE id = ?",         [data.name, id]);
  if (data.slug         !== undefined) run("UPDATE categories SET slug = ?, updated_at = datetime('now') WHERE id = ?",         [data.slug, id]);
  if (data.description  !== undefined) run("UPDATE categories SET description = ?, updated_at = datetime('now') WHERE id = ?",  [data.description, id]);
  if (data.displayOrder !== undefined) run("UPDATE categories SET display_order = ?, updated_at = datetime('now') WHERE id = ?", [data.displayOrder, id]);
}
function deleteCategory(id) {
  run("DELETE FROM categories WHERE id = ?", [id]);
}

// ============================================================
// PRODUCT QUERIES
// ============================================================
function listProducts(categoryId) {
  if (categoryId) {
    return all("SELECT * FROM products WHERE category_id = ? ORDER BY display_order ASC, id ASC", [categoryId]).map(parseProduct);
  }
  return all("SELECT * FROM products ORDER BY display_order ASC, id ASC").map(parseProduct);
}
function getProduct(id) {
  return parseProduct(get("SELECT * FROM products WHERE id = ?", [id]));
}
function createProduct(data) {
  const categoryId = data.categoryId ?? data.category_id ?? null;
  run(
    "INSERT INTO products (name, description, price, category_id, image_urls, stock, is_active, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      data.name,
      data.description || null,
      parseFloat(data.price),
      categoryId,
      JSON.stringify(data.imageUrls || data.image_urls || []),
      parseInt(data.stock) || 0,
      data.is_active === false || data.isActive === false ? 0 : 1,
      data.displayOrder || data.display_order || 0,
    ]
  );
  return getLastInsertId();
}
function updateProduct(id, data) {
  const fields = [], values = [];
  if (data.name        !== undefined) { fields.push("name = ?");          values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?");   values.push(data.description); }
  if (data.price       !== undefined) { fields.push("price = ?");         values.push(parseFloat(data.price)); }
  const catId = data.categoryId ?? data.category_id;
  if (catId            !== undefined) { fields.push("category_id = ?");   values.push(catId); }
  if (data.imageUrls   !== undefined) { fields.push("image_urls = ?");    values.push(JSON.stringify(data.imageUrls)); }
  if (data.stock       !== undefined) { fields.push("stock = ?");         values.push(parseInt(data.stock) || 0); }
  const isActiveVal = data.isActive ?? data.is_active;
  if (isActiveVal      !== undefined) { fields.push("is_active = ?");     values.push(isActiveVal ? 1 : 0); }
  if (data.displayOrder!== undefined) { fields.push("display_order = ?"); values.push(data.displayOrder); }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  run(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
}
function deleteProduct(id) {
  run("DELETE FROM products WHERE id = ?", [id]);
}

// ============================================================
// ORDER QUERIES
// ============================================================
function createOrder(orderData, items) {
  run(
    `INSERT INTO orders
       (order_number, customer_name, customer_email, customer_phone,
        customer_address, total_amount, status,
        payment_method, payment_status, user_id)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 'pending', ?)`,
    [
      orderData.orderNumber,
      orderData.customerName,
      orderData.customerEmail,
      orderData.customerPhone  || null,
      orderData.customerAddress,
      parseFloat(orderData.totalAmount),
      orderData.paymentMethod  || "whatsapp",   // "paystack" or "whatsapp"
      orderData.userId         || null,
    ]
  );
  const orderId = getLastInsertId();

  for (const item of items) {
    run(
      "INSERT INTO order_items (order_id, product_id, product_name, quantity, price_per_unit, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
      [
        orderId,
        item.productId,
        item.productName || item.name || "Product",
        parseInt(item.quantity) || 1,
        parseFloat(item.pricePerUnit || item.price || 0),
        parseFloat(item.subtotal || (parseFloat(item.price || 0) * (parseInt(item.quantity) || 1))),
      ]
    );
  }

  return orderId;
}

function listOrders(userId) {
  if (userId) return all("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return all("SELECT * FROM orders ORDER BY created_at DESC");
}

function getOrder(id) {
  const order = get("SELECT * FROM orders WHERE id = ?", [id]);
  if (!order) return null;
  return { ...order, items: all("SELECT * FROM order_items WHERE order_id = ?", [id]) };
}

function updateOrderStatus(id, status) {
  run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
}

// Called after Paystack confirms payment
function markOrderPaid(id, paystackReference) {
  run(
    "UPDATE orders SET payment_status = 'paid', paystack_reference = ?, status = 'processing', updated_at = datetime('now') WHERE id = ?",
    [paystackReference, id]
  );
}

// Called when payment fails
function markOrderPaymentFailed(id) {
  run(
    "UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?",
    [id]
  );
}

module.exports = {
  setupDatabase,
  getDb,
  getUserByEmail,
  getUserById,
  getUserPasswordHash,
  updateUserPassword,
  getSiteSettings,
  updateSiteSettings,
  listCategories, getCategory, createCategory, updateCategory, deleteCategory,
  listProducts,   getProduct,  createProduct,  updateProduct,  deleteProduct,
  createOrder,    listOrders,  getOrder,       updateOrderStatus,
  markOrderPaid,  markOrderPaymentFailed,
};
