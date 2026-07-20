// public/js/components.js
// Shared HTML components injected at runtime
"use strict";

function renderHeader(activePage = "") {
  const pages = [
    { href: "/shop", label: "Shop", icon: "fa-store" },
    { href: "/my-account", label: "Account", icon: "fa-user" },
  ];
  return `
<header class="site-header">
  <div class="container header-inner">

    <!-- Left: Logo -->
    <a href="/" class="logo">
      <span class="logo-icon">
        <img src="/uploads/favicon.png" alt="OneXpShop logo">
      </span>
      OneXp<span class="logo-accent">Shop</span>
    </a>

    <!-- Right: actions -->
    <div class="header-actions">
      <button id="theme-toggle" class="theme-toggle" data-action="toggle-theme" aria-label="Toggle dark mode">
        <i class="fa-solid fa-moon"></i><i class="fa-solid fa-sun"></i>
      </button>
      <a href="/cart" class="cart-btn" aria-label="Cart">
        <i class="fa-solid fa-bag-shopping"></i> Cart
        <span class="cart-badge">0</span>
      </a>
      <button class="mobile-menu-btn" id="mobile-menu-btn"
        data-action="toggle-nav" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>

    <!-- Nav -->
    <nav class="site-nav" id="site-nav" aria-label="Main navigation">
      ${pages.map(p => `<a href="${p.href}" ${activePage === p.href ? 'class="active"' : ''}><i class="fa-solid ${p.icon}"></i> ${p.label}</a>`).join("")}
    </nav>

  </div>
</header>`;
}

function renderFooter() {
  return `
<footer class="site-footer">
  <div class="container">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="footer-brand-name">OneXpShop</div>
          <p class="footer-tagline">Premium products curated just for you. Shop with confidence and style.</p>
        </div>
        <div>
          <h3 class="footer-col-title">Shop</h3>
          <nav class="footer-links">
            <a href="/shop">All Products</a>
            <a href="/shop">New Arrivals</a>
          </nav>
        </div>
        <div>
          <h3 class="footer-col-title">Account</h3>
          <nav class="footer-links">
            <a href="/my-account">My Account</a>
            <a href="/login">Sign In</a>
          </nav>
        </div>
        <div>
          <h3 class="footer-col-title">Support</h3>
          <nav class="footer-links">
            <a href="#">FAQ</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </nav>
        </div>
      </div>
      <div class="footer-bottom">
        <p class="footer-copy" id="footer-text">© ${new Date().getFullYear()} OneXpShop · OneXportal Enterprise · BN: RC 8130634</p>
        <p class="footer-copy" style="opacity:.6">Built by Amos Isaiah Tizhe</p>
      </div>
    </div>
  </div>
</footer>`;
}

function renderAdminSidebar(activePage = "") {
  const navItems = [
    { href: "/admin", label: "Dashboard", icon: "fa-chart-line" },
    { href: "/admin/products", label: "Products", icon: "fa-box" },
    { href: "/admin/categories", label: "Categories", icon: "fa-tags" },
    { href: "/admin/orders", label: "Orders", icon: "fa-receipt" },
    { href: "/admin/settings", label: "Settings", icon: "fa-gear" },
  ];
  return `
<aside class="admin-sidebar" id="admin-sidebar" aria-label="Admin navigation">
  <div class="sidebar-header">
    <div class="sidebar-logo">
      <img src="/uploads/favicon.png" alt="OneXpShop logo" class="sidebar-logo-img">
      <span>OneXpShop</span>
    </div>
    <div class="sidebar-subtitle">OneXpShop Control</div>
  </div>
  <nav class="sidebar-nav" aria-label="Admin pages">
    ${navItems.map(n => `
      <a href="${n.href}" ${activePage === n.href ? 'class="active"' : ''}>
        <i class="fa-solid ${n.icon} nav-icon"></i> ${n.label}
      </a>`).join("")}
    <div class="sidebar-divider"></div>
    <a href="/" style="margin-top:auto">
      <i class="fa-solid fa-arrow-left nav-icon"></i> View Store
    </a>
  </nav>
  <div class="sidebar-footer">
    <div class="sidebar-user">
      <div class="sidebar-avatar" id="sidebar-avatar">A</div>
      <div class="sidebar-user-info">
        <div class="sidebar-username" id="sidebar-username">Admin</div>
        <div class="sidebar-user-role">Administrator</div>
      </div>
    </div>
    <button class="sidebar-logout" data-action="logout" style="margin-top:.75rem;display:flex;align-items:center;gap:.5rem;font-family:var(--font-body)">
      <i class="fa-solid fa-right-from-bracket"></i> Sign out
    </button>
  </div>
</aside>`;
}
