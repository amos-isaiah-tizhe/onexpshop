
# OneXpShop Refactor Workflow Guide

## Project Overview

OneXpShop is a server-rendered full stack e-commerce application using:

- Node.js
- Express.js
- Vanilla JavaScript
- SQLite/PostgreSQL style API architecture
- HTML pages
- Shared frontend utility layer (`public/js/app.js`)
- Central design system (`public/css/design-system.css`)

The frontend architecture is based on:
- reusable utility functions
- centralized API handling
- event delegation
- localStorage cart state
- modal helpers
- theme management
- shared UI components

---

# Project Structure

```txt
onexpshop/
│
├── server/
│   ├── index.js
│   ├── db.js
│   └── routes/
│       ├── auth.js
│       ├── products.js
│       ├── categories.js
│       ├── orders.js
│       ├── settings.js
│       ├── upload.js
│       └── middleware.js
│
├── public/
│   ├── index.html
│   ├── css/
│   │   └── design-system.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   └── components.js
│   │
│   ├── pages/
│   │   ├── shop.html
│   │   ├── product.html
│   │   ├── cart.html
│   │   ├── checkout.html
│   │   ├── login.html
│   │   ├── my-account.html
│   │   └── thank-you.html
│   │
│   └── admin/
│       ├── index.html
│       ├── products.html
│       ├── categories.html
│       ├── orders.html
│       └── settings.html
```

---

# Core Frontend Architecture

## IMPORTANT

`public/js/app.js` is the frontend infrastructure layer.

Do NOT randomly duplicate logic from this file into pages.

Most frontend behaviors should be centralized here.

---

# app.js Responsibilities

## Security

Handles:
- safe HTML escaping
- safe URLs
- CSRF token management

Functions:
- `safe()`
- `safeUrl()`
- `ensureCsrfToken()`

---

## API Layer

Centralized fetch wrapper.

Functions:
- `api.get()`
- `api.post()`
- `api.put()`
- `api.patch()`
- `api.delete()`

Benefits:
- shared error handling
- auth redirect handling
- JSON parsing
- CSRF integration

DO NOT use raw `fetch()` directly inside pages unless absolutely necessary.

Use:
```js
api.get("/api/products")
```

instead of:
```js
fetch("/api/products")
```

---

## Toast System

Functions:
- `toast.success()`
- `toast.error()`
- `toast.info()`

Never use:
```js
alert()
```

Use:
```js
toast.success("Product added");
```

---

## Cart System

Centralized localStorage cart management.

Functions:
- `cart.get()`
- `cart.save()`
- `cart.add()`
- `cart.remove()`
- `cart.updateQty()`
- `cart.clear()`
- `cart.total()`
- `cart.count()`

Cart badge is automatically updated.

---

## Theme System

Functions:
- `initTheme()`
- `toggleTheme()`

Uses:
```txt
data-theme="dark"
data-theme="light"
```

DO NOT manually manipulate theme styles in pages.

---

## Modal System

Functions:
- `openModal(id)`
- `closeModal(id)`

Uses:
```html
data-action="open-modal"
data-val="modal-id"
```

---

## Auth System

Functions:
- `loadCurrentUser()`
- `logout()`
- `requireAdmin()`

Used by:
- admin pages
- account pages
- protected actions

---

# Current Refactor Issues Found

## Inline onclick Usage

Several pages still use:
```html
onclick=""
```

Examples found in:
- index.html
- shop.html
- cart.html
- admin/products.html
- admin/categories.html
- admin/orders.html

These should be migrated into centralized event delegation.

---

# Recommended Architecture

## BAD

```html
<button onclick="deleteProduct(1)">
```

---

## GOOD

```html
<button
  data-action="delete-product"
  data-val="1">
```

Then handle in `app.js`:

```js
case "delete-product":
  deleteProduct(val);
  break;
```

---

# Event Delegation Standard

All clickable UI should eventually use:

```html
data-action=""
data-val=""
```

Handled inside:

```js
document.addEventListener("click", ...)
```

Benefits:
- cleaner HTML
- fewer memory leaks
- easier debugging
- easier scaling
- CSP compatible
- easier React migration

---

# Safe Refactor Workflow

## STEP 1 — NEVER REFACTOR EVERYTHING AT ONCE

Refactor:
- one page
- one component
- one feature
at a time.

---

## STEP 2 — CREATE GIT CHECKPOINTS

Before major edits:

```bash
git add .
git commit -m "Before cart refactor"
```

If AI breaks something:

```bash
git restore .
```

or:

```bash
git reset --hard HEAD
```

---

# Termux Workflow

Project path:

```bash
cd ~/dev/projects/onexpshop
```

Useful commands:

## Start server

```bash
npm run dev
```

## Git status

```bash
git status
```

## Create checkpoint

```bash
git add .
git commit -m "Refactor product cards"
```

---

# AI Refactor Workflow

## BEST PRACTICE

Give AI:
- ONE file
- ONE problem
- ONE goal

Do NOT dump the entire project every time.

---

## GOOD PROMPT

```txt
Refactor this page to remove inline onclick handlers
using the existing app.js event delegation system.
Do not rewrite unrelated code.
Preserve existing design and functionality.
```

---

## BAD PROMPT

```txt
Rewrite my whole project professionally.
```

This usually creates:
- broken architecture
- duplicated logic
- missing features
- inconsistent styles

---

# Rules For Using AI Safely

## NEVER LET AI

- rewrite app.js completely
- rewrite design-system.css completely
- rename APIs randomly
- change route structures unexpectedly
- duplicate cart/auth logic
- add frameworks mid-project

---

# Safe AI Tasks

AI is safe for:
- removing inline JS
- accessibility improvements
- extracting reusable components
- improving validation
- adding loading states
- adding error handling
- modularizing functions
- improving semantics

---

# Frontend Refactor Priorities

## Priority 1

Remove all inline:
- onclick
- onsubmit
- onchange

Replace with delegated handlers.

---

## Priority 2

Move duplicated functions into:
```txt
public/js/app.js
```

Examples:
- addToCart()
- navigation handlers
- modal helpers

---

## Priority 3

Create reusable rendering helpers.

Example:

```js
renderProductCard(product)
```

instead of duplicating product card HTML everywhere.

---

## Priority 4

Split app.js later into modules:

```txt
js/
├── core/
├── cart/
├── auth/
├── ui/
├── utils/
```

Do this ONLY after the current architecture is stable.

---

# Security Notes

Good practices already implemented:
- CSRF protection
- HTML sanitization
- URL sanitization
- auth redirect handling

Still improve:
- inline JS removal
- stronger input validation
- stricter admin checks
- upload validation

---

# Accessibility Improvements Needed

Add:
- keyboard support for custom buttons
- Enter/Space activation
- aria-expanded sync
- better focus states
- form labels
- modal focus traps

---

# Performance Improvements

Future improvements:
- lazy load product images
- debounce search
- reduce duplicated DOM queries
- create rendering helpers
- modular JS loading

---

# Production Refactor Strategy

## PHASE 1
Stabilize architecture.

- remove inline JS
- centralize events
- reduce duplication

---

## PHASE 2
Extract reusable components.

Examples:
- product cards
- modals
- tables
- admin forms

---

## PHASE 3
Modularize JS.

---

## PHASE 4
Optional framework migration.

Possible future:
- React
- Next.js
- Vue

ONLY after architecture becomes stable.

---

# Recommended Engineering Mindset

Always ask:

## Can this logic be reused?

If yes:
move it into shared utilities.

---

## Is this duplicated?

If yes:
extract helper functions.

---

## Is this tightly coupled?

If yes:
decouple responsibilities.

---

## Will this scale?

If not:
refactor before adding more features.

---

# Recommended Next Refactors

1. Remove all inline onclick handlers
2. Centralize addToCart()
3. Create reusable product card renderer
4. Create reusable admin table renderer
5. Create centralized navigation actions
6. Extract modal templates
7. Add keyboard accessibility
8. Add loading/error state helpers
9. Create shared form validation helpers
10. Split app.js into modules later

---

# Final Advice

Your project already has strong foundations:
- centralized utilities
- shared API layer
- reusable design system
- security-aware frontend
- scalable event delegation structure

The biggest risk now is:
- duplicated logic
- page-level scripting
- uncontrolled AI rewrites

Refactor gradually and intentionally.

Treat `app.js` as infrastructure, not as a dumping ground.

Build reusable systems, not isolated fixes.
