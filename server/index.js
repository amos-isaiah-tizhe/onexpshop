// ============================================================
// server/index.js  –  OneXpShop Express Server
// Production-hardened: helmet, rate limiting, CSRF, secure sessions
// ============================================================

"use strict";

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ── Optional security packages (install with: npm i helmet express-rate-limit) ──
let helmet, rateLimit;
try { helmet = require("helmet"); } catch { }
try { rateLimit = require("express-rate-limit"); } catch { }

const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const categoriesRoutes = require("./routes/categories");
const productsRoutes = require("./routes/products");
const ordersRoutes = require("./routes/orders");
const uploadRoutes = require("./routes/upload");
const { setupDatabase } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Render (and most PaaS) terminate TLS at a proxy. Without this, `secure`
// cookies are never sent and express-rate-limit sees the proxy IP for everyone.
if (IS_PROD) app.set("trust proxy", 1);

// ── Uploads folder ────────────────────────────────────────────
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Security headers (Helmet) ─────────────────────────────────
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co"],  // inline scripts in pages
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        connectSrc: ["'self'", "https://api.paystack.co"],
frameSrc:   ["'self'", "https://js.paystack.co"],
      },
    },
    crossOriginEmbedderPolicy: false,  // allow external fonts/icons
  }));
} else {
  // Manual fallback headers if helmet isn't installed
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
}

// ── Request body parsing ──────────────────────────────────────
app.use(express.json({ limit: "2mb" }));   // tightened from 10mb
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── Sessions ──────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && IS_PROD) {
  console.error("❌ SESSION_SECRET environment variable is not set! Set it in production.");
  process.exit(1);
}

app.use(session({
  secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  name: "__onexp_sid",         // don't expose default "connect.sid"
  cookie: {
    secure: IS_PROD,                      // HTTPS-only in production
    httpOnly: true,                         // not accessible via JS
    sameSite: "lax",                        // CSRF mitigation
    maxAge: 1000 * 60 * 60 * 24 * 7,     // 1 week
  },
}));

// ── CSRF token middleware ─────────────────────────────────────
// Generates a per-session CSRF token; validates it on state-changing requests.
app.use((req, res, next) => {
  // Generate token once per session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  // Expose token on all HTML responses via a readable meta-tag mechanism:
  // The token is sent via the /api/auth/csrf endpoint
  next();
});

// CSRF validation for mutating API calls (skip GET, HEAD, OPTIONS)
app.use("/api", (req, res, next) => {
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (SAFE_METHODS.has(req.method)) return next();

  // Allow login/register without a token (user doesn't have session yet)
  // NOTE: inside app.use("/api", ...), req.path is relative — e.g. "/auth/login" not "/api/auth/login"
  if (["/auth/login", "/auth/logout", "/auth/register", "/auth/csrf"].includes(req.path)) return next();

  const tokenFromHeader = req.headers["x-csrf-token"];
  const tokenFromSession = req.session?.csrfToken;

  if (!tokenFromSession || !tokenFromHeader) {
    return res.status(403).json({ error: "CSRF token missing." });
  }

  // Use timingSafeEqual to prevent timing attacks
  const a = Buffer.from(tokenFromHeader);
  const b = Buffer.from(tokenFromSession);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }
  next();
});

// ── Rate limiting ─────────────────────────────────────────────

if (rateLimit) {
  // General API limiter
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max:      200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: "Too many requests. Please try again later." },
  }));

  // Stricter limit on auth endpoints to prevent brute force
  app.use("/api/auth/login", rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      10,
    message: { error: "Too many login attempts. Please wait 15 minutes." },
  }));

  app.use("/api/auth/register", rateLimit({
    windowMs: 60 * 60 * 1000,
    max:      5,
    message: { error: "Too many registration attempts." },
  }));
}

// ── Static files (with cache headers) ────────────────────────
const staticOpts = {
  setHeaders(res, filePath) {
    if (/\.(css|js|woff2?|ttf|eot|svg)$/.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (/\.html$/.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
};
// Serve uploaded images from the (possibly external) uploads dir
app.use("/uploads", express.static(uploadsDir, { maxAge: "30d", immutable: true }));
app.get(["/favicon.png", "/favicon.ico"], (_, res) => {
  res.sendFile(path.join(uploadsDir, "favicon.png"));
});
// Then the rest of the public site
app.use(express.static(path.join(__dirname, "../public"), staticOpts));

// ── CSRF token endpoint ───────────────────────────────────────
app.get("/api/auth/csrf", (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use('/api/upload', uploadRoutes);

// ── Page routing helper ───────────────────────────────────────
// Injects env vars as window globals so frontend JS can read them
// without ever exposing the SECRET key (only PUBLIC key goes to browser).
function getConfigScript() {
  return '<script>\n'
    + 'window.__PAYSTACK_KEY__ = ' + JSON.stringify(process.env.PAYSTACK_PUBLIC_KEY || '') + ';\n'
    + 'window.__WA_NUMBER__    = ' + JSON.stringify(process.env.WHATSAPP_NUMBER     || '') + ';\n'
    + '</script>';
}

function sendPage(res, filePath) {
  const fullPath = path.join(__dirname, "../public", filePath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).sendFile(path.join(__dirname, "../public/pages/404.html"));
  }

  // For HTML pages, inject the config script before </head>
  // so window.__PAYSTACK_KEY__ and window.__WA_NUMBER__ are available everywhere
  let html;
  try { html = fs.readFileSync(fullPath, "utf8"); } catch {
    return res.status(500).json({ error: "Could not read page." });
  }

  if (html.includes("</head>")) {
    html = html.replace("</head>", getConfigScript() + "\n</head>");
  }

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

// ── Health check (for Render & uptime monitors) ──────────────
app.get("/healthz", (_, res) => res.status(200).json({ status: "ok", uptime: process.uptime() }));

// ── HTML Page Routes ──────────────────────────────────────────
app.get("/", (_, res) => sendPage(res, "index.html"));
app.get("/shop", (_, res) => sendPage(res, "pages/shop.html"));
app.get("/cart", (_, res) => sendPage(res, "pages/cart.html"));
app.get("/checkout", (_, res) => sendPage(res, "pages/checkout.html"));
app.get("/thank-you", (_, res) => sendPage(res, "pages/thank-you.html"));
app.get("/product/:id", (req, res) => {
  // Validate that :id is a numeric integer to prevent path traversal
  if (!/^\d+$/.test(req.params.id)) return res.redirect("/shop");
  sendPage(res, "pages/product.html");
});
app.get("/my-account", (_, res) => sendPage(res, "pages/my-account.html"));
app.get("/login", (_, res) => sendPage(res, "pages/login.html"));

// Admin routes
app.get("/admin", (_, res) => sendPage(res, "admin/index.html"));
app.get("/admin/products", (_, res) => sendPage(res, "admin/products.html"));
app.get("/admin/categories", (_, res) => sendPage(res, "admin/categories.html"));
app.get("/admin/orders", (_, res) => sendPage(res, "admin/orders.html"));
app.get("/admin/settings", (_, res) => sendPage(res, "admin/settings.html"));

// ── 404 fallback ──────────────────────────────────────────────
app.use((_, res) => {
  res.status(404).sendFile(path.join(__dirname, "../public/pages/404.html"));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  // Never leak stack traces to the client in production
  const msg = IS_PROD ? "An internal error occurred." : err.message;
  res.status(500).json({ error: msg });
});

// ── Start ─────────────────────────────────────────────────────
async function start() {
  await setupDatabase();
  // Listen on 0.0.0.0 so Render (and local network) can reach the server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n✅ OneXpShop running in ${IS_PROD ? "PRODUCTION" : "development"} mode`);
    console.log(`   Store: http://localhost:${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin`);
    if (!IS_PROD) console.log(`   Login: admin@shop.com / admin123\n`);
  });
}

start().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
