# OneXpShop — Production Workflow

Full-stack e-commerce app (HTML/CSS/JS frontend, Node + Express backend, embedded SQLite via `sql.js`). Hardened for production deployment on **Render**.

> Built by **Amos Isaiah Tizhe** · OneXportal Enterprise

---

## 1. What changed in this audit

### v2.2.0 — Frontend architecture refactor (matches the [Refactor Workflow Guide](docs/REFACTOR-WORKFLOW.md))

| # | Issue | Fix |
|---|-------|-----|
| 1 | Inline `onclick` / `onchange` / `oninput` handlers across 8 files (CSP-hostile, leaks memory, blocks React migration). | All removed. Every clickable element now uses `data-action="…"` and is dispatched by **one** delegated handler in `public/js/app.js`. |
| 2 | Product card HTML was duplicated in `index.html`, `shop.html` (and partially in `product.html`). | Extracted to a single `renderProductCard(p)` helper in `app.js`. Pages now call `products.map(renderProductCard).join("")`. |
| 3 | Each page redefined `addToCart`, `updateQty`, `removeItem`, `switchImage`, etc. | Replaced with shared actions: `add-to-cart`, `cart-inc`, `cart-dec`, `cart-remove`, `nav`, `switch-image` (page-scoped). |
| 4 | No way for pages to extend the global delegation cleanly. | Added `registerActions({ name(val, el, e){…} })` registry. Pages register only their page-specific actions; the global switch in `app.js` handles the rest. |
| 5 | Custom `role="button"` / `tabindex="0"` elements weren't keyboard-activatable. | Global `keydown` listener triggers `Enter` / `Space` on any non-button element carrying `data-action`. |
| 6 | `change` / `input` events still required inline handlers. | Added `data-action-change` and `data-action-input` delegation. |

### v2.1.0 — Production hardening (Render)

| # | Issue (v2.0.0) | Severity | Fix |
|---|----------------|----------|-----|
| 1 | `dotenv` used via `node -r dotenv/config` but **missing from `dependencies`** — `npm ci` on Render would crash on boot. | High | Added `dotenv` to `package.json`. |
| 2 | No `app.set("trust proxy", 1)`. Behind Render's TLS proxy, `secure` session cookies are dropped and `express-rate-limit` keys every request to the same proxy IP. | High | Trust proxy enabled when `NODE_ENV=production`. |
| 3 | No health-check endpoint. Render marks the service unhealthy and recycles it. | High | Added `GET /healthz`. |
| 4 | No persistent disk config. SQLite file (`shop.db`) and `/uploads` get wiped on every deploy. | Critical | `render.yaml` mounts a 1 GB disk at `/var/data`; `DB_PATH` / `UPLOADS_DIR` wired through `db.js`, `index.js`, `routes/upload.js`. |
| 5 | A real `SESSION_SECRET` was committed inside `.env`. | Critical | `.env` removed; Render generates the secret via `generateValue: true`. |
| 6 | CSP allowed `imgSrc: http:` — mixed-content vector once deployed over HTTPS. | Medium | Removed `http:` from `imgSrc`. |
| 7 | Uploaded images on the persistent disk weren't served at `/uploads/*`. | Medium | Added dedicated `app.use("/uploads", express.static(uploadsDir, …))`. |

What was already correct and **not** changed: bcrypt hashing, CSRF middleware with `timingSafeEqual`, session regeneration on login, server-side recompute of order totals, parameterised SQL throughout, `requireAdmin` cross-checking session role against DB role, multer file-type/size limits, helmet headers, login rate limiting, output escaping in `app.js` (`safe()` / `safeUrl()`).

---

## 1a. Frontend architecture rules (read before editing)

These rules are enforced across the codebase and documented in [docs/REFACTOR-WORKFLOW.md](docs/REFACTOR-WORKFLOW.md).

1. **`public/js/app.js` is infrastructure.** Don't duplicate its helpers in pages. Don't bloat it with page logic.
2. **Never use raw `fetch()`** — go through `api.get/post/put/patch/delete` so CSRF, auth-redirect and error handling stay centralized.
3. **Never use `alert()`** — use `toast.success/error/info`.
4. **Never use inline `onclick` / `onchange` / `oninput` / `onsubmit`.** Use:
   - `data-action="<name>"` for clicks (and Enter/Space on focusable non-buttons),
   - `data-action-change="<name>"` for `change` events on selects/inputs,
   - `data-action-input="<name>"` for `input` events.
   - Add `data-stop="1"` to swallow event bubbling (replaces `event.stopPropagation()`).
5. **Globally available actions** (handled by `app.js`): `nav`, `toggle-theme`, `open-modal`, `close-modal`, `logout`, `toggle-sidebar`, `toggle-nav`, `add-to-cart`, `cart-inc`, `cart-dec`, `cart-remove`.
6. **Page-specific actions** register through `registerActions({ "my-action": (val, el, e) => { … } })`.
7. **Reusable renderers** live in `app.js`. Today: `renderProductCard(p)`. Add new ones (e.g. admin table row) before duplicating markup.
8. **Cart state** goes through the `cart` object only — never read/write `localStorage["onexp_cart"]` directly.

---

## 2. Architecture

```
┌──────────────┐   HTTPS   ┌─────────────────────────────────────┐
│  Browser     │──────────▶│  Render Web Service (Node 18+)      │
│ (HTML/CSS/JS)│           │                                     │
│              │           │  Express                            │
│  · CSRF token│           │   ├─ helmet (CSP, headers)         │
│  · cookie    │           │   ├─ express-session (cookie)      │
│  · /uploads/*│◀──────────│   ├─ express-rate-limit            │
└──────────────┘           │   ├─ /api/auth   (bcrypt + CSRF)   │
                           │   ├─ /api/products / categories    │
                           │   ├─ /api/orders / settings        │
                           │   └─ /api/upload (multer, 5 MB)    │
                           │                                     │
                           │  sql.js  ◀──── /var/data/shop.db   │  ← Render Persistent Disk
                           │  multer  ◀──── /var/data/uploads   │     (1 GB, survives deploys)
                           └─────────────────────────────────────┘
```

---

## 3. Deploy to Render (Blueprint, recommended)

This repo ships a `render.yaml` so Render can provision everything in one click.

1. **Push the project to GitHub** (public or private).
2. In Render dashboard → **New +** → **Blueprint**.
3. Select your repo. Render reads `render.yaml` and shows the plan: 1 web service + 1 disk + auto-generated `SESSION_SECRET`.
4. Click **Apply**.
5. First boot logs should show:
   ```
   ✅ New database created: /var/data/shop.db
   ✅ Default admin created: admin@shop.com / admin123
   ✅ OneXpShop running in PRODUCTION mode
   ```
6. Open the generated `https://onexpshop-xxxx.onrender.com/healthz` → must return `{"status":"ok",...}`.
7. **Log in immediately** at `/login` with `admin@shop.com / admin123` and change the password from **Admin → Settings**.

### Manual deploy (without `render.yaml`)

If you'd rather configure by hand:

| Setting | Value |
|---------|-------|
| Environment | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Disk | 1 GB mounted at `/var/data` |
| Env `NODE_ENV` | `production` |
| Env `SESSION_SECRET` | (Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| Env `DB_PATH` | `/var/data/shop.db` |
| Env `UPLOADS_DIR` | `/var/data/uploads` |

---

## 4. Local development

```bash
npm install
cp .env.example .env
# edit .env, set SESSION_SECRET to a long random string
npm run dev          # auto-restarts on file changes
# → http://localhost:3000
```

Default admin: `admin@shop.com / admin123` (change it after first login).

The dev DB is `server/shop.db` and uploads go to `public/uploads/`. Both are gitignored.

---

## 5. Production checklist

Before you announce the URL, verify each box:

- [ ] `SESSION_SECRET` is set on Render and is **not** the example value.
- [ ] `NODE_ENV=production` is set on Render.
- [ ] `DB_PATH` and `UPLOADS_DIR` point inside `/var/data` (the persistent disk).
- [ ] `/healthz` returns 200.
- [ ] You signed in once and **changed the admin password**.
- [ ] You created at least one category and one product through `/admin`.
- [ ] You placed a test order at `/checkout` and saw it appear in `/admin/orders`.
- [ ] You uploaded an image and confirmed it loads at `/uploads/<file>` after a redeploy (proves the disk is wired).
- [ ] Browser DevTools → Application → Cookies shows `__onexp_sid` with `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] Try POSTing to `/api/products` from `curl` without a CSRF header → must return `403`.
- [ ] Try logging in 11 times with a wrong password → 11th attempt must return `429`.

---

## 6. Project layout

```
onexpshop/
├── render.yaml                ← Render Blueprint
├── package.json
├── .env.example
├── server/
│   ├── index.js               ← Express bootstrap, helmet, CSRF, rate-limit, static, /healthz
│   ├── db.js                  ← sql.js setup + all queries (honors DB_PATH)
│   └── routes/
│       ├── auth.js            ← /login /logout /me /change-password
│       ├── middleware.js      ← requireLogin, requireAdmin, sanitiseId
│       ├── categories.js
│       ├── products.js        ← input validation, admin-only mutations
│       ├── orders.js          ← server-side total recompute, ownership checks
│       ├── settings.js
│       └── upload.js          ← multer (image only, 5 MB), honors UPLOADS_DIR
└── public/
    ├── index.html             ← landing
    ├── css/design-system.css
    ├── js/{app.js, components.js}
    ├── pages/{shop,product,cart,checkout,thank-you,login,my-account,404}.html
    └── admin/{index,products,categories,orders,settings}.html
```

---

## 7. API reference

All mutating endpoints require `X-CSRF-Token` header (fetched from `GET /api/auth/csrf`). All admin endpoints additionally require an authenticated admin session cookie.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET    | `/healthz`                  | —      | Liveness |
| GET    | `/api/auth/csrf`            | —      | Issue CSRF token |
| POST   | `/api/auth/login`           | —      | Login (rate-limited 10 / 15min) |
| POST   | `/api/auth/logout`          | —      | Destroy session |
| GET    | `/api/auth/me`              | —      | Current user or `null` |
| POST   | `/api/auth/change-password` | login  | Rotate own password |
| GET    | `/api/settings`             | —      | Public site settings |
| POST/PUT | `/api/settings`           | admin  | Update settings |
| GET    | `/api/categories`           | —      | List |
| POST   | `/api/categories`           | admin  | Create |
| PUT    | `/api/categories/:id`       | admin  | Update |
| DELETE | `/api/categories/:id`       | admin  | Delete |
| GET    | `/api/products[?categoryId]`| —      | List |
| GET    | `/api/products/:id`         | —      | One |
| POST   | `/api/products`             | admin  | Create |
| PUT    | `/api/products/:id`         | admin  | Update |
| DELETE | `/api/products/:id`         | admin  | Delete |
| POST   | `/api/orders`               | —      | Place order (total recomputed server-side) |
| GET    | `/api/orders`               | admin  | All orders |
| GET    | `/api/orders/my`            | login  | Own orders |
| GET    | `/api/orders/:id`           | admin or owner | Detail |
| PATCH  | `/api/orders/:id/status`    | admin  | `pending\|processing\|completed\|cancelled` |
| POST   | `/api/upload/image`         | admin  | multipart `image` field, ≤ 5 MB, jpg/png/gif/webp |

---

## 8. Security model summary

| Concern | Mitigation |
|---------|------------|
| Password storage | bcrypt (cost 10 for seed, 12 for new) |
| Session fixation | `req.session.regenerate()` on login & on password change |
| Session theft | `httpOnly`, `secure` (prod), `sameSite=lax`, custom cookie name `__onexp_sid` |
| CSRF | Per-session token via `/api/auth/csrf`, validated with `crypto.timingSafeEqual`; only `GET/HEAD/OPTIONS` and the auth endpoints are exempt |
| Brute force | `express-rate-limit`: 10 logins / 15 min, 200 API / 15 min |
| Email enumeration | Login always runs bcrypt against a dummy hash if the email is unknown |
| Privilege escalation | `requireAdmin` cross-checks session role against the live DB role on every call |
| SQL injection | All queries use parameter binding (`?`) via `sql.js` `prepare/bind` |
| XSS | `safe()` HTML-escapes user content in the DOM; CSP forbids cross-origin scripts |
| Image uploads | Whitelist of extensions, 5 MB cap, random filenames, served from a dedicated `/uploads` mount |
| Order tampering | Server recomputes the total from line items; client total is logged but not trusted |
| Stack-trace leaks | Error handler returns a generic message in production |

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Error: Cannot find module 'dotenv'` on Render | Built from a stale lockfile that pre-dated v2.1.0 | Delete `package-lock.json`, redeploy with **Clear build cache & deploy** |
| All login attempts return 401, even with the right password | `secure` cookie not sent because `trust proxy` is off | Make sure `NODE_ENV=production` is set; v2.1.0 enables trust proxy automatically |
| Rate limiter blocks every visitor at the same time | Same as above — every request looks like the proxy IP | Same fix |
| Products / orders disappear after a deploy | Service has no persistent disk; SQLite file lives on ephemeral FS | Use the supplied `render.yaml`, or attach a disk and set `DB_PATH=/var/data/shop.db` |
| Uploaded images return 404 after a redeploy | `UPLOADS_DIR` not pointing at the disk | Set `UPLOADS_DIR=/var/data/uploads` |
| `403 CSRF token missing` on admin actions | Frontend code didn't call `/api/auth/csrf` first | Use the bundled `api.*` helpers in `public/js/app.js` — they fetch and cache the token automatically |

---

## 10. License & attribution

© 2026 Amos Isaiah Tizhe / OneXportal Enterprise. All rights reserved.
