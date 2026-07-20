# OneXportal Design System

## Brand Information

- **Name:** OneXportal  
- **Business:** OneXportal Enterprise  
- **BN:** RC 8130634  
- **URL:** https://amos-isaiah-tizhe.onrender.com/  

### Author
- **Name:** Amos Isaiah Tizhe  
- **Namespace:** OneXp  

---

## Core Principles

- Material Design inspired
- Fully themeable system
- Scalable token architecture
- Accessibility focused
- AI-friendly structure

---

## Token System

### 1. Primitive Tokens (Base Layer)

#### Brand Colors
- darkest → accent (10-step scale)

#### Neutral Colors
- black → white (11-step grayscale system)

#### Status Colors
- success: `#388E3C`
- warning: `#FBC02D`
- info: `#1976D2`
- error: `#ff362a`

---

### 2. Semantic Tokens (UI Layer)

Used for components and layouts:

- background
- surface
- surface-secondary
- text-primary
- text-secondary
- text-muted
- primary
- primary-hover
- primary-active
- border

---

### 3. Dark Mode Tokens

Overrides semantic tokens:

- background: `#0f0d14`
- surface: `#171619`
- primary: `#9876f2`
- text-primary: `#f4f1ff`

---

## Typography System

- Font: Inter, system-ui

### Font Sizes
- xs → 0.75rem
- sm → 0.875rem
- md → 1rem
- lg → 1.125rem
- xl → 1.25rem
- 2xl → 1.5rem
- 3xl → 2rem

### Font Weights
- regular: 400
- medium: 500
- semibold: 600
- bold: 700

### Line Heights
- tight: 1.2
- normal: 1.5
- relaxed: 1.8

---

## Usage Rules

### ✔ Always
- Use semantic tokens in UI
- Respect theme switching
- Use spacing + typography system

### ❌ Never
- Hardcode colors in components
- Skip semantic layer
- Mix raw hex values in UI

---

## Example Usage

```css id="0xq2pm"
.card {
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
}