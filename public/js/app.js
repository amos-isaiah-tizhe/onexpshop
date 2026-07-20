// public/js/app.js – OneXpShop  |  place just before </body> on every page
"use strict";

/* ============================================================
   SECURITY HELPERS
   ============================================================ */

function safe(str) {
  if (str == null) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function safeUrl(url) {
  if (!url) return "";
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) || s.startsWith("/") ? s : "";
}

/* ============================================================
   CSRF TOKEN
   ============================================================ */

let _csrfToken = null;

async function ensureCsrfToken() {
  if (_csrfToken) return _csrfToken;
  try {
    const r = await fetch("/api/auth/csrf", { credentials: "include" });
    const d = await r.json();
    _csrfToken = d.csrfToken || null;
  } catch { _csrfToken = null; }
  return _csrfToken;
}

async function refreshCsrfToken() {
  _csrfToken = null;
  return ensureCsrfToken();
}

/* ============================================================
   API
   ============================================================ */

const CSRF_EXEMPT = new Set(["/api/auth/login","/api/auth/logout","/api/auth/register"]);

const api = {
  async _req(method, url, body) {
    const h = { "Content-Type": "application/json" };
    const mutate = ["POST","PUT","DELETE","PATCH"].includes(method);
    if (mutate && !CSRF_EXEMPT.has(url)) {
      const t = await ensureCsrfToken();
      if (t) h["X-CSRF-Token"] = t;
    }
    const opts = { method, headers: h, credentials: "include" };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try { res = await fetch(url, opts); }
    catch { throw new Error("Network error – check your connection."); }
    if (res.status === 401) {
      window.location.href = "/login?redirect=" + encodeURIComponent(location.pathname);
      throw new Error("Session expired.");
    }
    const ct = res.headers.get("Content-Type") || "";
    const data = ct.includes("application/json") ? await res.json() : { message: await res.text() };
    if (!res.ok) throw new Error(data.error || data.message || "Request failed: " + res.status);
    return data;
  },
  get:    (url)       => api._req("GET",    url),
  post:   (url, body) => api._req("POST",   url, body),
  put:    (url, body) => api._req("PUT",    url, body),
  patch:  (url, body) => api._req("PATCH",  url, body),
  delete: (url)       => api._req("DELETE", url),
};

/* ============================================================
   TOAST
   ============================================================ */

function _getToastEl() {
  let c = document.getElementById("toast-container");
  if (!c) {
    c = document.createElement("div");
    c.id = "toast-container";
    c.setAttribute("role","alert");
    c.setAttribute("aria-live","polite");
    document.body.appendChild(c);
  }
  return c;
}

function _toast(msg, type, dur) {
  const icons = { success:"✓", error:"✕", info:"ℹ" };
  const c  = _getToastEl();
  const el = document.createElement("div");
  el.className = "toast " + (type||"info");
  el.innerHTML = `<span class="toast-icon">${icons[type]||"i"}</span><span>${safe(msg)}</span>`;
  c.appendChild(el);
  const t = setTimeout(() => {
    el.style.cssText += ";opacity:0;transform:translateX(110%);transition:all .3s";
    setTimeout(() => el.remove(), 320);
  }, dur||3500);
  el.addEventListener("click", () => { clearTimeout(t); el.remove(); });
}

const toast = {
  success: m => _toast(m, "success"),
  error:   m => _toast(m, "error"),
  info:    m => _toast(m, "info"),
};

/* ============================================================
   CART
   ============================================================ */

const cart = {
  KEY: "onexp_cart",
  get() {
    try { const r=JSON.parse(localStorage.getItem(this.KEY)||"[]"); return Array.isArray(r)?r:[]; }
    catch { return []; }
  },
  save(items) {
    localStorage.setItem(this.KEY, JSON.stringify(
      items.filter(i => Number.isInteger(i.productId)
        && typeof i.productName==="string"
        && Number.isFinite(parseFloat(i.price))
        && i.quantity>0)
    ));
    this._badge();
  },
  add(p, qty=1) {
    if (!p?.id||!p?.name) { toast.error("Invalid product."); return; }
    qty = Math.max(1,Math.min(99,parseInt(qty)||1));
    const items=this.get(), ex=items.find(i=>i.productId===p.id);
    if (ex) { ex.quantity=Math.min(99,ex.quantity+qty); }
    else items.push({ productId:p.id, productName:String(p.name).slice(0,200),
      price:String(parseFloat(p.price)||0), quantity:qty,
      imageUrl:safeUrl(p.imageUrls?.[0]||"") });
    this.save(items);
    toast.success(`"${p.name}" added to cart!`);
  },
  remove(id)        { this.save(this.get().filter(i=>i.productId!==id)); },
  updateQty(id,qty) {
    qty=parseInt(qty);
    if(!qty||qty<=0){this.remove(id);return;}
    const items=this.get(),it=items.find(i=>i.productId===id);
    if(it){it.quantity=Math.min(99,qty);this.save(items);}
  },
  clear()   { localStorage.removeItem(this.KEY); this._badge(); },
  total()   { return this.get().reduce((s,i)=>s+parseFloat(i.price)*i.quantity,0); },
  count()   { return this.get().reduce((s,i)=>s+i.quantity,0); },
  _badge()  {
    const b=document.querySelector(".cart-badge");
    if(b){const c=this.count();b.textContent=c;b.style.display=c>0?"flex":"none";}
  },
};

/* ============================================================
   FORMAT
   ============================================================ */

function formatPrice(n) {
  n=parseFloat(n);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-US",{style:"currency",currency:"NGN"}).format(n) : "₦0.00";
}

function formatDate(s) {
  const d=new Date(s);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
}

/* ============================================================
   AUTH
   ============================================================ */

let currentUser = null;

async function loadCurrentUser() {
  try   { currentUser = await api.get("/api/auth/me"); }
  catch { currentUser = null; }
  return currentUser;
}

async function logout() {
  try { await api.post("/api/auth/logout"); } catch {}
  _csrfToken=null; cart.clear();
  window.location.href="/login";
}

async function requireAdmin() {
  const u = await loadCurrentUser();
  if (!u||u.role!=="admin") {
    window.location.href="/login?redirect="+encodeURIComponent(location.pathname);
    return null;
  }
  return u;
}

/* ============================================================
   SITE SETTINGS
   ============================================================ */

async function applySiteSettings() {
  try {
    const s = await api.get("/api/settings");
    if (s.siteTitle) {
      document.title = document.title.replace("OneXpShop", s.siteTitle);
      document.querySelectorAll(".logo,.site-logo-text").forEach(el=>el.textContent=s.siteTitle);
    }
    if (s.primaryColor && /^#[0-9a-fA-F]{6}$/.test(s.primaryColor))
      document.documentElement.style.setProperty("--primary", s.primaryColor);
  } catch {}
}

/* ============================================================
   THEME  (dark / light)
   ============================================================ */

function _applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("onexp_theme", theme);
  // CSS in design-system.css handles the icon swap via [data-theme="dark"] selectors.
  // No inline style manipulation needed — the attribute change triggers CSS automatically.
}

function initTheme() {
  const saved  = localStorage.getItem("onexp_theme");
  const prefer = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  _applyTheme(saved || prefer);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  _applyTheme(cur==="dark" ? "light" : "dark");
}

/* ============================================================
   MODALS
   ============================================================ */

function openModal(id) {
  // Close any other open modal first so they never stack
  document.querySelectorAll(".modal-overlay.open").forEach(m => {
    if (m.id !== id) m.classList.remove("open");
  });
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("open");
  const f = m.querySelectorAll("button,[href],input,select,textarea");
  if (f.length) f[0].focus();
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
}

/* ============================================================
   VALIDATION
   ============================================================ */

const validate = {
  email:    s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()),
  required: s => String(s||"").trim().length>0,
  price:    v => { const n=parseFloat(v); return Number.isFinite(n)&&n>=0; },
};

/* ============================================================
   PAGE ACTION REGISTRY
   Pages register their own data-action handlers here so app.js stays
   the single event delegation surface (CSP-friendly, no inline JS).
   ============================================================ */

const pageActions = {};
function registerActions(map) { Object.assign(pageActions, map || {}); }

/* ============================================================
   REUSABLE RENDERERS
   ============================================================ */

// Reusable product card markup. Use this everywhere a product card is
// rendered (home, shop, related products, etc.) — never duplicate the HTML.
function renderProductCard(p) {
  const id  = safe(String(p.id));
  const out = p.stock <= 0;
  const img = p.imageUrls?.[0]
    ? `<img src="${safeUrl(p.imageUrls[0])}" alt="${safe(p.name)}" loading="lazy">`
    : `<div class="product-card__image-placeholder"><i class="fa-solid fa-image"></i></div>`;
  return `
    <article class="card product-card" data-action="nav" data-val="/product/${id}" role="link" tabindex="0">
      <div class="product-card__image">
        ${img}
        ${out ? `<span class="product-card__badge badge-out">Out of Stock</span>` : ""}
      </div>
      <div class="product-card__body">
        <div class="product-card__name">${safe(p.name)}</div>
        <div class="product-card__desc">${safe(p.description || "")}</div>
        <div class="product-card__footer">
          <span class="product-card__price">${formatPrice(p.price)}</span>
          <button class="btn btn-primary btn-sm"
            data-action="add-to-cart" data-val="${id}" data-stop="1"
            ${out ? "disabled" : ""}>
            <i class="fa-solid fa-cart-plus"></i> ${out ? "Sold Out" : "Add"}
          </button>
        </div>
      </div>
    </article>`;
}

/* ============================================================
   GLOBAL EVENT DELEGATION
   One handler catches every data-action on every page. Pages add new
   actions via registerActions({ name(val, el, e) { ... } }).
   ============================================================ */

// Cache of products fetched on demand by add-to-cart action.
const _productCache = {};
async function _addToCartById(id) {
  try {
    const pid = parseInt(id);
    if (!pid) return;
    if (!_productCache[pid]) _productCache[pid] = await api.get(`/api/products/${pid}`);
    cart.add(_productCache[pid]);
  } catch { toast.error("Could not add to cart"); }
}

document.addEventListener("click", function(e) {
  // Close modal when clicking the dark overlay behind it
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("open");
    return;
  }

  const el = e.target.closest("[data-action]");
  if (!el) return;

  // Honor data-stop to swallow bubbling (replaces inline event.stopPropagation)
  if (el.dataset.stop) e.stopPropagation();

  const action = el.dataset.action;
  const val    = el.dataset.val || "";

  switch (action) {
    case "nav":           if (val) window.location.href = val;        return;
    case "toggle-theme":  toggleTheme();                              return;
    case "open-modal":    openModal(val);                             return;
    case "close-modal":   closeModal(val);                            return;
    case "logout":        logout();                                   return;
    case "toggle-sidebar":
      document.querySelector(".admin-sidebar")?.classList.toggle("open"); return;
    case "toggle-nav":
      document.getElementById("site-nav")?.classList.toggle("open");  return;
    case "add-to-cart":   _addToCartById(val);                        return;
    case "cart-inc":      cart.updateQty(+val, (cart.get().find(i=>i.productId===+val)?.quantity||0)+1); return;
    case "cart-dec":      cart.updateQty(+val, (cart.get().find(i=>i.productId===+val)?.quantity||0)-1); return;
    case "cart-remove":   cart.remove(+val);                          return;
    case "prod-edit": {
      const id = parseInt(el.dataset.val);
      if (typeof editProduct === "function") editProduct(id);
      break;
    }
    case "prod-delete": {
      const id = parseInt(el.dataset.val);
      const name = el.dataset.name || "";
      if (typeof promptDelete === "function") promptDelete(id, name);
      break;
    }
  }

  // Fall through to per-page handlers
  if (typeof pageActions[action] === "function") {
    pageActions[action](val, el, e);
  }
});

// Keyboard activation for non-button elements that carry data-action
document.addEventListener("keydown", function(e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
  e.preventDefault();
  el.click();
});

// Delegated change handler — for selects/inputs (e.g. status filters, qty inputs)
document.addEventListener("change", function(e) {
  const el = e.target.closest("[data-action-change]");
  if (!el) return;
  const action = el.dataset.actionChange;
  const val    = el.dataset.val || el.value || "";
  if (typeof pageActions[action] === "function") pageActions[action](val, el, e);
});

document.addEventListener("input", function(e) {
  const el = e.target.closest("[data-action-input]");
  if (!el) return;
  const action = el.dataset.actionInput;
  if (typeof pageActions[action] === "function") pageActions[action](el.value, el, e);
});

// Close modals on Escape
document.addEventListener("keydown", e => {
  if (e.key==="Escape")
    document.querySelectorAll(".modal-overlay.open").forEach(m=>m.classList.remove("open"));
});

/* ============================================================
   MOBILE NAV  (hamburger button)
   ============================================================ */

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  applySiteSettings();
  cart._badge();
  
  // Pre-warm CSRF token on all pages except login
  if (!location.pathname.includes("login")) ensureCsrfToken();
});