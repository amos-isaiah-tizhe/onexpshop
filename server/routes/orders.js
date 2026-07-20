// server/routes/orders.js
"use strict";

const express = require("express");
const crypto  = require("crypto");
const https   = require("https");

const {
  createOrder, listOrders, getOrder,
  updateOrderStatus, markOrderPaid, markOrderPaymentFailed,
} = require("../db");
const { requireLogin, requireAdmin, sanitiseId } = require("./middleware");

const router = express.Router();

const VALID_STATUSES  = new Set(["pending","processing","completed","cancelled"]);
const VALID_PAYMENT_METHODS = new Set(["paystack","whatsapp"]);

function isValidEmail(str) {
  return typeof str === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) && str.length <= 254;
}

// ── Paystack verification (no axios needed) ───────────────────
function paystackVerify(reference) {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return reject(new Error("PAYSTACK_SECRET_KEY not set in .env"));

    const opts = {
      hostname: "api.paystack.co",
      path:     `/transaction/verify/${encodeURIComponent(reference)}`,
      method:   "GET",
      headers:  { Authorization: `Bearer ${secretKey}` },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid Paystack response")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── POST /api/orders  ─  place an order ──────────────────────
router.post("/", (req, res) => {
  const {
    customer_name, customer_email, customer_phone,
    shipping_address, items, total_amount, payment_method,
    // legacy names
    customerName, customerEmail, customerPhone, customerAddress,
  } = req.body;

  const name    = (customer_name    || customerName    || "").toString().trim();
  const email   = (customer_email   || customerEmail   || "").toString().trim();
  const phone   = (customer_phone   || customerPhone   || "").toString().trim();
  const address = (shipping_address || customerAddress || "").toString().trim();
  const method  = (payment_method   || "whatsapp").toString().trim().toLowerCase();
  const orderItems = items || [];

  // Validate
  if (!name)                    return res.status(400).json({ error: "Customer name is required." });
  if (!email)                   return res.status(400).json({ error: "Customer email is required." });
  if (!isValidEmail(email))     return res.status(400).json({ error: "Invalid email address." });
  if (!address)                 return res.status(400).json({ error: "Shipping address is required." });
  if (!VALID_PAYMENT_METHODS.has(method))
    return res.status(400).json({ error: "Payment method must be 'paystack' or 'whatsapp'." });
  if (!Array.isArray(orderItems) || orderItems.length === 0)
    return res.status(400).json({ error: "Order must contain at least one item." });
  if (orderItems.length > 100)
    return res.status(400).json({ error: "Too many items in one order." });

  for (const item of orderItems) {
    const price = parseFloat(item.price);
    const qty   = parseInt(item.quantity);
    if (!item.productId || !Number.isInteger(Number(item.productId)))
      return res.status(400).json({ error: "Invalid product ID in order items." });
    if (!Number.isFinite(price) || price < 0)
      return res.status(400).json({ error: "Invalid item price." });
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99)
      return res.status(400).json({ error: "Invalid item quantity." });
  }

  // Recompute total server-side
  const computedTotal = orderItems.reduce((s, i) => s + parseFloat(i.price) * parseInt(i.quantity), 0);
  const clientTotal   = parseFloat(total_amount || 0);
  if (Math.abs(computedTotal - clientTotal) > 0.01) {
    console.warn(`Order total mismatch: client=${clientTotal} server=${computedTotal}`);
  }

  try {
    const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const orderId = createOrder(
      {
        orderNumber,
        customerName:     name,
        customerEmail:    email,
        customerPhone:    phone,
        customerAddress:  address,
        totalAmount:      computedTotal.toFixed(2),
        paymentMethod:    method,
        userId:           req.session?.userId || null,
      },
      orderItems
    );
    res.status(201).json({ id: orderId, order_number: orderNumber, payment_method: method });
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({ error: "Failed to create order." });
  }
});

// ── POST /api/orders/:id/verify-payment  ─  Paystack callback ─
// Frontend calls this after Paystack popup closes successfully.
// We verify with Paystack's API server-side (never trust the client).
router.post("/:id/verify-payment", sanitiseId, async (req, res) => {
  const { reference } = req.body;

  if (!reference || typeof reference !== "string" || reference.length > 200) {
    return res.status(400).json({ error: "Invalid Paystack reference." });
  }

  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.payment_method !== "paystack") {
    return res.status(400).json({ error: "This order is not a Paystack order." });
  }
  if (order.payment_status === "paid") {
    return res.json({ success: true, message: "Already paid." });
  }

  try {
    const result = await paystackVerify(reference);

    if (result.data?.status === "success") {
      // Double-check the amount matches (prevents partial-payment attacks)
      const paidKobo    = result.data.amount;            // Paystack uses kobo (₦ × 100)
      const expectedKobo = Math.round(parseFloat(order.total_amount) * 100);
      if (Math.abs(paidKobo - expectedKobo) > 1) {
        console.warn(`Amount mismatch on order ${order.id}: paid=${paidKobo} expected=${expectedKobo}`);
        markOrderPaymentFailed(order.id);
        return res.status(400).json({ error: "Payment amount does not match order total." });
      }
      markOrderPaid(order.id, reference);
      return res.json({ success: true, message: "Payment verified. Order confirmed!" });
    } else {
      markOrderPaymentFailed(order.id);
      return res.status(400).json({ error: "Paystack reports payment was not successful." });
    }
  } catch (err) {
    console.error("Paystack verify error:", err.message);
    return res.status(500).json({ error: "Could not verify payment. Please contact support." });
  }
});

// ── GET /api/orders  ─  list all (admin) ─────────────────────
router.get("/", requireAdmin, (req, res) => {
  res.json(listOrders());
});

// ── GET /api/orders/my  ─  list for logged-in user ───────────
router.get("/my", requireLogin, (req, res) => {
  res.json(listOrders(req.session.userId));
});

// ── GET /api/orders/:id  ─  get one ──────────────────────────
router.get("/:id", sanitiseId, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const isAdmin = req.session?.role === "admin";
  const isOwner = req.session?.userId && order.user_id === req.session.userId;
  if (!isAdmin && !isOwner) return res.status(403).json({ error: "Access denied." });
  res.json(order);
});

// ── PATCH /api/orders/:id/status  ─  update status (admin) ───
router.patch("/:id/status", requireAdmin, sanitiseId, (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Status must be one of: ${[...VALID_STATUSES].join(", ")}.` });
  }
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  updateOrderStatus(req.params.id, status);
  res.json(getOrder(req.params.id));
});

// Legacy PUT
router.put("/:id/status", requireAdmin, sanitiseId, (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Status must be one of: ${[...VALID_STATUSES].join(", ")}.` });
  }
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  updateOrderStatus(req.params.id, status);
  res.json(getOrder(req.params.id));
});

module.exports = router;
