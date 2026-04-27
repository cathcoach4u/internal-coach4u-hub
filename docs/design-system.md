# Coach4U Design System

The source of truth for visual consistency across all Coach4U apps. Use this when building any sibling app (e.g. the professional development app) so it looks and feels like the same family.

**Last reviewed:** April 2026
**Owner:** Cath Baker · SARUBA PTY LTD trading as Coach4U
**Pair with:** [Cath Voice Tone Reference v1](../docs/cath-voice-tone-v1.md) for written tone.

---

## 1. Fonts

Two fonts only. Both from Google Fonts.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
```

| Font | Used for | Weights |
|---|---|---|
| **Inter** | Body, paragraphs, labels, table cells, buttons, badges | 400, 500, 600, 700 |
| **Quicksand** | Page titles, modal titles, section headings, card titles | 600, 700 |

Body letter-spacing is `-0.01em` for tighter, calmer reading.
Quicksand sits on top of an Inter fallback: `font-family:'Quicksand','Inter',sans-serif;`

---

## 2. Colour Palette

### Brand
| Token | Hex | Use |
|---|---|---|
| Navy 900 | `#1e3a5f` | Primary text on light, page titles, sidebar/header gradient start |
| Navy 800 | `#234b78` | Sidebar/header gradient end |
| Navy 700 | `#003366` | Strong accent (Open Reports cards, primary CTAs) |
| Cobalt | `#3b82f6` | Active nav state, focus rings, links |
| Cobalt dark | `#2563eb` | Button hover |
| Gold | `#c9a646` | Header underline accent (used sparingly on client-facing pages) |

### Surface & lines
| Token | Hex | Use |
|---|---|---|
| App background | `#f0f6ff` | Page backdrop |
| Card surface | `#ffffff` | All cards, modals, table backgrounds |
| Soft surface | `#f8fafc` | Table headers, hover row, secondary fill |
| Subtle fill | `#f1f5f9` | Tag/badge gray, inset bars |
| Border | `#e2e8f0` | Card and input borders, table dividers |
| Hairline | `#f1f5f9` | Row dividers, soft separators |

### Text
| Token | Hex | Use |
|---|---|---|
| Ink | `#1e293b` | Body text |
| Ink secondary | `#475569` | Secondary copy |
| Muted | `#64748b` | Labels, helper text |
| Faint | `#94a3b8` | Helper detail, meta info |
| Faintest | `#cbd5e1` | Disabled, dividers |

### Semantic — paired bg + text
| Status | Background | Text/border | Used for |
|---|---|---|---|
| Success | `#dcfce7` | `#15803d` (or `#16a34a`) | Green badges, success toasts, "Saved", positive states |
| Warning | `#fef3c7` | `#d97706` (or `#92400e`) | Amber badges, "Due Soon", warnings |
| Danger | `#fef2f2` | `#dc2626` (or `#ef4444`) | Red badges, "Overdue", errors, destructive buttons |
| Info | `#dbeafe` / `#eff6ff` | `#2563eb` (or `#1d4ed8`) | Blue chips, neutral info |
| Purple accent | `#ede9fe` / `#f0e6ff` | `#7c3aed` | Brain Pulse, "specialised" features |
| Pink accent | `#fce7f3` | `#be185d` | Couple/relationship chips |
| Strengths green | `#f0fdf4` | `#15803d` | Gallup / strengths chips |

### Optional category accents (left-borders on link cards)
| Hex | Used for in this app | Reuse for |
|---|---|---|
| `#003366` Navy 700 | Open Reports / SOP | Primary navigation cards |
| `#d97706` Amber | Code Tracker / "needs action" | Pipeline / awaiting |
| `#15803d` Green | Upload / Strengths | Inputs, additions |
| `#16a34a` Green | Profiles | People-centric pages |
| `#8b5cf6` Purple | Domain Balance | Analytics / breakdown |
| `#0070CD` Bright blue | SharePoint / external | External links |
| `#1e3a5f` Navy 900 | Resources / SOP | Reference / read-only docs |

---

## 3. CSS Custom Properties (drop-in)

Paste this `<style>` block at the top of any new app's `index.html`. Every component below references these variables.

```css
:root{
  /* Brand */
  --c4u-navy-900:#1e3a5f;
  --c4u-navy-800:#234b78;
  --c4u-navy-700:#003366;
  --c4u-cobalt:#3b82f6;
  --c4u-cobalt-dark:#2563eb;
  --c4u-gold:#c9a646;

  /* Surface */
  --c4u-bg:#f0f6ff;
  --c4u-surface:#ffffff;
  --c4u-soft:#f8fafc;
  --c4u-subtle:#f1f5f9;
  --c4u-border:#e2e8f0;

  /* Text */
  --c4u-ink:#1e293b;
  --c4u-ink-2:#475569;
  --c4u-muted:#64748b;
  --c4u-faint:#94a3b8;

  /* Semantic */
  --c4u-success-bg:#dcfce7;   --c4u-success:#15803d;
  --c4u-warning-bg:#fef3c7;   --c4u-warning:#d97706;
  --c4u-danger-bg:#fef2f2;    --c4u-danger:#dc2626;
  --c4u-info-bg:#dbeafe;      --c4u-info:#2563eb;
  --c4u-purple-bg:#ede9fe;    --c4u-purple:#7c3aed;

  /* Type */
  --c4u-font:'Inter',system-ui,-apple-system,sans-serif;
  --c4u-font-display:'Quicksand','Inter',sans-serif;

  /* Radii */
  --c4u-radius-sm:6px;
  --c4u-radius:8px;
  --c4u-radius-md:10px;
  --c4u-radius-lg:12px;
  --c4u-radius-xl:14px;
  --c4u-radius-pill:99px;

  /* Shadows */
  --c4u-shadow-sm:0 1px 3px rgba(0,0,0,.04);
  --c4u-shadow:0 4px 12px rgba(0,0,0,.08);
  --c4u-shadow-lg:0 8px 24px rgba(0,0,0,.12);
  --c4u-shadow-modal:0 20px 60px rgba(0,0,0,.15);

  /* Focus ring (cobalt @ 12% alpha) */
  --c4u-focus:0 0 0 3px rgba(59,130,246,.12);
}
```

---

## 4. Typography Scale

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Page title (header `h2`) | Quicksand | 20px (mobile 17px) | 700 | White on navy gradient |
| Section heading on white | Quicksand | 16px | 700 | `color: var(--c4u-navy-900)` |
| Section eyebrow | Inter | 14px | 700 | `text-transform:uppercase; letter-spacing:.5px;` |
| Card title | Quicksand | 15px | 700 | `color: var(--c4u-navy-900)` |
| KPI number | Inter | 26px | 700 | Tight `line-height:1.2` |
| Body | Inter | 13–14px | 400/500 | `line-height:1.6` for prose |
| Label (uppercase) | Inter | 12px | 600 | `text-transform:uppercase; letter-spacing:.3px; color: var(--c4u-muted)` |
| Helper text | Inter | 11–12px | 500 | `color: var(--c4u-faint)` |
| Badge / chip | Inter | 11px | 600 | Pill radius |

---

## 5. Spacing & Radius

- Layout padding: **28–32px** desktop, **14–16px** mobile.
- Card padding: **18–20px** internal.
- Card-to-card gap: **14–16px**.
- Standard radius: **12px** for cards, **10px** for inputs/buttons, **8px** for chips, **99px** for pills.
- Cards have `border:1px solid var(--c4u-border)` plus optional **4px coloured left border** to indicate category.

---

## 6. Component Patterns

### 6.1 Page header (gradient navy)
```html
<div class="header">
  <h2>Page Title</h2>
  <div class="header-right"><span class="version-pill">v1.0.0</span></div>
</div>
```
```css
.header{
  background:linear-gradient(180deg,var(--c4u-navy-900) 0%,var(--c4u-navy-800) 100%);
  padding:14px 32px;color:#fff;display:flex;justify-content:space-between;align-items:center;
}
.header h2{font-family:var(--c4u-font-display);font-size:20px;font-weight:700;}
.version-pill{
  background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);
  padding:3px 11px;border-radius:99px;font-size:11px;font-weight:600;
}
```

### 6.2 KPI card (`.dash-card`)
```html
<div class="dash-card">
  <div class="dc-icon green">🎯</div>
  <div class="dc-info"><h4>264</h4><p>Profiles complete</p></div>
</div>
```
```css
.dash-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}
.dash-card{
  background:var(--c4u-surface);border:1px solid var(--c4u-border);
  border-radius:var(--c4u-radius-lg);padding:20px;
  display:flex;align-items:center;gap:14px;box-shadow:var(--c4u-shadow-sm);
}
.dash-card .dc-icon{
  width:44px;height:44px;border-radius:var(--c4u-radius-md);
  display:flex;align-items:center;justify-content:center;font-size:20px;
}
.dc-icon.blue {background:#dbeafe;color:#2563eb;}
.dc-icon.green{background:#dcfce7;color:#16a34a;}
.dc-icon.amber{background:#fef3c7;color:#d97706;}
.dash-card .dc-info h4{font-size:26px;font-weight:700;color:var(--c4u-navy-900);line-height:1.2;}
.dash-card .dc-info p {font-size:12px;color:var(--c4u-faint);font-weight:500;}
```

### 6.3 Link card (the workhorse)

Used everywhere in this app to link to a sub-page. White card, 4px coloured left border, icon, title, description, "Open →" affordance on the right.

```html
<a href="/foo" class="link-card" style="border-left-color:#003366;">
  <span class="lc-icon">📋</span>
  <div class="lc-body">
    <div class="lc-title">Open Reports</div>
    <div class="lc-desc">Pick a client, contact, or team to see strengths reports and AI insights.</div>
  </div>
  <span class="lc-arrow" style="color:#003366;">Open →</span>
</a>
```
```css
.link-card{
  display:flex;align-items:center;gap:14px;
  background:var(--c4u-surface);border:1px solid var(--c4u-border);border-left:4px solid var(--c4u-navy-700);
  border-radius:var(--c4u-radius-lg);padding:14px 18px;margin-bottom:14px;
  text-decoration:none;color:var(--c4u-ink);transition:box-shadow .15s;
}
.link-card:hover{box-shadow:var(--c4u-shadow);}
.lc-icon{font-size:24px;flex-shrink:0;}
.lc-body{flex:1;min-width:0;}
.lc-title{font-family:var(--c4u-font-display);font-weight:700;color:var(--c4u-navy-900);font-size:15px;}
.lc-desc{font-size:12px;color:var(--c4u-muted);margin-top:2px;}
.lc-arrow{font-size:13px;font-weight:600;flex-shrink:0;}
```

### 6.4 Buttons
```css
.btn{padding:10px 18px;border:none;border-radius:var(--c4u-radius-md);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
.btn-blue {background:var(--c4u-cobalt);color:#fff;box-shadow:0 1px 3px rgba(59,130,246,.25);} .btn-blue:hover {background:var(--c4u-cobalt-dark);}
.btn-green{background:#16a34a;color:#fff;} .btn-green:hover{background:var(--c4u-success);}
.btn-red  {background:#ef4444;color:#fff;} .btn-red:hover  {background:var(--c4u-danger);}
.btn-gray {background:var(--c4u-subtle);color:var(--c4u-ink);border:1px solid var(--c4u-border);} .btn-gray:hover{background:var(--c4u-border);}
```

### 6.5 Badge / pill
```css
.badge{font-size:11px;padding:3px 10px;border-radius:var(--c4u-radius-pill);font-weight:600;display:inline-block;}
.badge-green{background:var(--c4u-success-bg);color:var(--c4u-success);}
.badge-amber{background:var(--c4u-warning-bg);color:var(--c4u-warning);}
.badge-red  {background:var(--c4u-danger-bg);color:var(--c4u-danger);}
.badge-blue {background:var(--c4u-info-bg);color:var(--c4u-info);}
.badge-gray {background:var(--c4u-subtle);color:var(--c4u-muted);}
```

### 6.6 Form inputs
```css
.form-group{margin-bottom:14px;}
.form-group label{display:block;font-size:12px;font-weight:600;color:var(--c4u-muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.3px;}
.form-group input,.form-group select,.form-group textarea{
  width:100%;padding:10px 14px;border:1px solid var(--c4u-border);
  border-radius:var(--c4u-radius-md);font-size:14px;font-family:inherit;transition:all .2s;
}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{
  outline:none;border-color:var(--c4u-cobalt);box-shadow:var(--c4u-focus);
}
```
**Important quirk** carried from this app: `.form-group input` selects radio buttons too, which makes them stretch to 100% width. If you use `<input type="radio">` inside `.form-group`, override with `style="width:auto;flex-shrink:0;"` or use buttons-as-radios instead.

### 6.7 Modal
```css
.modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
.modal-overlay.open{display:flex;}
.modal{background:var(--c4u-surface);border-radius:var(--c4u-radius-xl);padding:28px;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:var(--c4u-shadow-modal);}
.modal h3{font-family:var(--c4u-font-display);font-size:18px;font-weight:700;color:var(--c4u-navy-900);margin-bottom:20px;}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:24px;}
@media(max-width:768px){.modal{padding:18px;max-width:92vw;}}
```

### 6.8 Toast
```css
.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:var(--c4u-radius-md);color:#fff;font-size:14px;font-weight:600;z-index:200;opacity:0;transition:opacity .3s;box-shadow:var(--c4u-shadow);}
.toast.show{opacity:1;}
.toast.success{background:#16a34a;}
.toast.error  {background:#ef4444;}
```

---

## 7. Layout

- **Sidebar** (desktop): fixed left, 220px, navy gradient, white nav items, active item is cobalt-filled.
- **Main**: `margin-left:220px` to clear sidebar.
- **Header**: full-width navy gradient with white page title in Quicksand.
- **Mobile breakpoint**: `768px`. Sidebar collapses to a slide-out drawer; area tabs hide; padding drops to 14–16px.

A starter HTML skeleton is at the bottom of this doc.

---

## 8. Iconography

This app uses **HTML emoji entities** (e.g. `&#127919;` for 🎯) rather than an icon font. Pros: zero dependencies, render natively on every device. Cons: emoji style varies by OS.

Common ones in use:

| Emoji | Hex entity | Used for |
|---|---|---|
| 🎯 | `&#127919;` | Strengths / target |
| 📋 | `&#128203;` | Reports / list |
| 💡 | `&#128161;` | Profiles / insights |
| 🎨 | `&#127912;` | Domain Balance / palette |
| ✨ | `&#10024;` | AI / auto-extract / Upload |
| 🔑 | `&#128273;` | Tracker / access |
| 📚 | `&#128218;` | SOP / reference |
| 🧠 | `&#129504;` | Brain Pulse |
| 🌷 | `&#127807;` | SAFE Pulse |
| ✅ | `&#9989;` | Success / done |
| ⚠️ | `&#9888;` | Warning |

For a more polished look later, swap to Lucide or Heroicons SVG inline.

---

## 9. Voice & Tone

Cath's voice rules apply to **every** Coach4U app: warm, grounded, decisive; Australian English; no exclamation marks, no emojis in copy, no clinical language; sign-off is `Thanks\nCath`.

Full reference: `docs/cath-voice-tone-v1.md` (in this repo). Mirror it as `CATH_VOICE_REFERENCE` in any new app and feed it into every AI prompt.

---

## 10. Starter HTML Template

Drop this into a new app's `index.html` and you have the look-and-feel out of the box.

```html
<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>Coach4U Professional Development</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
<meta name="theme-color" content="#3b82f6">
<style>
/* Paste the :root variables block from §3 here */
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:var(--c4u-font);background:var(--c4u-bg);color:var(--c4u-ink);min-height:100vh;letter-spacing:-0.01em;}
.header{background:linear-gradient(180deg,var(--c4u-navy-900) 0%,var(--c4u-navy-800) 100%);padding:14px 32px;color:#fff;display:flex;justify-content:space-between;align-items:center;}
.header h2{font-family:var(--c4u-font-display);font-size:20px;font-weight:700;}
.content{padding:28px 32px;max-width:960px;margin:0 auto;}
/* Then paste components from §6 */
@media(max-width:768px){
  .header{padding:12px 16px;} .header h2{font-size:17px;} .content{padding:14px 16px;}
}
</style>
</head>
<body>
<div class="header">
  <h2>Professional Development</h2>
</div>
<div class="content">
  <!-- your app starts here -->
</div>
</body>
</html>
```

---

## 11. Footer (legal)

Every Coach4U-branded page should carry the business footer. Two variants:

**Compact** (client-facing):
```
SARUBA PTY LTD trading as Coach4U
ACN 632 545 656 · ABN 54 632 545 656
coach4u.com.au
```

**Full** (internal / About page): see About card in `index.html` for the complete ASIC record.

---

## 12. Versioning Discipline

When you ship a Coach4U app, follow this repo's pattern:
- Show a version pill in the header: `v{major}.{minor}.{patch}`.
- Bump it on every commit that ships visible changes.
- If you use a service worker, bump the cache name in lockstep.
- When changes are made, both the visible version AND the cache MUST move together.

---

## 13. What lives where

| Concern | Source of truth |
|---|---|
| Visual tokens, components, layout | This doc |
| Written voice & tone | `docs/cath-voice-tone-v1.md` |
| Business legal details | `index.html` About page (renderAbout) |
| CliftonStrengths theme/domain colours | `CS_DOMAINS` / `domainColors` constants in `index.html` |

---

> **Rule of thumb**: if you find yourself picking a hex code that isn't in this doc, check first whether one of the existing tokens already covers the case. Adding a new colour is a deliberate decision, not a default.
