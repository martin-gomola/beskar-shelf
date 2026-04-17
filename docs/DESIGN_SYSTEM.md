# Beskar Shelf Design System

> Warm editorial surfaces, tactile controls, and cover-first browsing.
> The current app is no longer pure iOS glass. It uses a parchment light theme, an obsidian dark theme, flatter cards, and a more deliberate player and reader experience.

---

## 1. Foundations

### Brand Direction

- Covers are still the hero.
- UI should feel calm, tactile, and slightly premium rather than glossy.
- Green remains the primary action color.
- Gold is the supporting accent for progress, highlights, and premium warmth.

### Color Tokens

#### Light theme

| Token | Value | Usage |
|---|---|---|
| `canvas` | `#f3ede3` | Page background |
| `canvas-accent` | `rgba(215, 182, 109, 0.3)` | Ambient background bloom |
| `canvas-spotlight` | `rgba(36, 199, 104, 0.16)` | Secondary ambient glow |
| `surface` | `#f7f1e8` | Base content surface |
| `surface-elevated` | `#fbf6ee` | Main screen container |
| `surface-solid` | `#fffdf9` | Buttons, pills, high-contrast fills |
| `surface-dark` | `#e1d4c2` | Segmented controls, cover fallback, disabled fills |
| `glass-bg` | `#fffaf3` | Cards and panels |
| `glass-bg-heavy` | `#f6efe4` | Hover/stronger panel treatment |
| `glass-border` | `rgba(88, 64, 21, 0.12)` | Card and panel border |
| `nav-glass-bg` | `rgba(255, 251, 245, 0.92)` | Bottom nav / mini-player shell |
| `nav-glass-border` | `rgba(88, 64, 21, 0.16)` | Floating nav border |

#### Dark theme

| Token | Value | Usage |
|---|---|---|
| `canvas` | `#050a10` | Page background |
| `surface` | `#081018` | Base content surface |
| `surface-elevated` | `#0d1520` | Main screen container |
| `surface-solid` | `#111924` | Raised surface |
| `surface-dark` | `#0b141d` | Control backgrounds |
| `glass-bg` | `#121c28` | Cards and panels |
| `glass-bg-heavy` | `#172230` | Active segmented controls |
| `glass-border` | `rgba(215, 182, 109, 0.14)` | Card and panel border |
| `nav-glass-bg` | `rgba(7, 14, 21, 0.8)` | Bottom nav / mini-player shell |
| `nav-glass-border` | `rgba(215, 182, 109, 0.12)` | Floating nav border |

#### Accent

| Token | Value | Usage |
|---|---|---|
| `accent-400` | `#56dd88` | Hovered primary actions |
| `accent-500` | `#24c768` | Primary action, active playback |
| `accent-600` | `#119f4f` | Primary button hover |
| `accent-700` | `#0c7a3c` | Strong pressed state |
| `accent-secondary` | `#d7b66d` | Progress bars, warm highlights, active dark pills |

#### Text

| Token | Light | Dark | Usage |
|---|---|---|---|
| `text` | `#1a2230` | `#f7f2e8` | Primary text |
| `text-secondary` | `#4e5a68` | `#d0c7b9` | Subheadings, body support |
| `text-muted` | `#7a6f64` | `#96a0ae` | Metadata |
| `text-hint` | `#aa9f93` | `#56616f` | Quiet hints |

#### Borders and states

| Token | Value | Usage |
|---|---|---|
| `line` | `rgba(42, 28, 8, 0.08)` | Dividers |
| `line-strong` | `rgba(42, 28, 8, 0.14)` | Inputs, utility cards |
| `hover-bg` | `rgba(48, 34, 10, 0.05)` | Subtle hover |
| `hover-bg-strong` | `rgba(48, 34, 10, 0.1)` | Strong hover |
| `focus-ring` | `rgba(36, 199, 104, 0.24)` | Focus state |
| `loss` | `#ff3b30` | Destructive actions |
| `gain` | `#34c759` | Positive state |

### Typography

| Token | Value |
|---|---|
| Font stack | `"Avenir Next", "Segoe UI Variable Display", "SF Pro Display", "Segoe UI", sans-serif` |
| `fs-xs` | `0.7rem` |
| `fs-sm` | `0.8rem` |
| `fs-base` | `0.9375rem` |
| `fs-md` | `1.05rem` |
| `fs-lg` | `1.2rem` |
| `fs-xl` | `1.35rem` |

Rules:

- `h1` is bold and compact: `clamp(1.65rem, 4vw, 2.1rem)` with `font-weight: 800`.
- Eyebrows and labels are uppercase with expanded tracking.
- Numeric values should keep tabular alignment.

### Spacing

Preferred rhythm:

- `2px`
- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`

### Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `8px` | Small covers, compact media |
| `radius` | `12px` | Inputs, buttons, pills |
| `radius-lg` | `22px` | Cards, shells, main panels |
| `radius-pill` | `9999px` | Segmented controls, floating chips |

---

## 2. Layout

### App shell

- The page background uses layered radial + linear gradients, not a flat fill.
- `.screen` is the main content container.
- Auth and setup stay narrow.
- Other screens can expand to `1120px`.
- On mobile under `680px`, screens lose side borders and corner radius to feel native and edge-to-edge.

### Surface strategy

- Main UI panels use bordered flat cards, not blur-heavy glass.
- Floating chrome like the bottom nav and mini-player keeps the soft translucent treatment.
- Shadows are intentionally minimal; structure comes from tone, stroke, and spacing.

Core card treatment:

```css
.card,
.player-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: none;
}
```

---

## 3. Covers and Browsing

### Covers

```css
.cover {
  aspect-ratio: 2 / 3;
  border-radius: 18px;
  background: var(--surface-dark);
  overflow: hidden;
}
```

Rules:

- Covers stay large and quiet.
- No decorative chrome around standard book cards.
- Hover motion is subtle: slight lift on the card, tiny image scale.

### Grid system

| Breakpoint | Columns |
|---|---|
| `< 480px` | 3 |
| `>= 480px` | 4 |
| `>= 768px` | 5 |

### Home shelves

- Discovery shelves use horizontal scrolling cover rows.
- Shelf cards snap horizontally on touch devices.
- Home uses a dark “hero header” to contrast against the lighter content field.

### Library pills and toggles

- Library switching uses rounded pills with a solid surface background.
- Active pills are warm parchment in light mode and gold in dark mode.
- Grid/list toggles and theme toggles use the same segmented-control language.

---

## 4. Navigation

### Bottom nav

- Fixed, centered, and floating on larger screens.
- Full-width and docked on mobile.
- Active state uses green text on a soft green fill, not a filled solid capsule.

```css
.bottom-nav {
  background: var(--nav-glass-bg);
  border: 1px solid var(--nav-glass-border);
  border-radius: 22px;
}
```

### Mini player

- Sits above the bottom nav.
- Uses the same floating shell treatment.
- Progress uses `accent-secondary` gold instead of green.
- Playback button stays fully green to preserve one obvious primary action.

---

## 5. Controls

### Buttons

Primary:

```css
.primary-button {
  background: var(--accent-500);
  color: #fff;
}
```

Ghost:

```css
.ghost-button {
  background: var(--glass-bg-heavy);
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
}
```

Rules:

- Default control height targets `44px` or larger.
- Press feedback uses light scale, not heavy depth.
- Disabled controls shift toward `surface-dark` and muted text.

### Inputs

- Inputs are solid and readable, not translucent.
- Focus uses green border emphasis plus a soft ring.
- Search, settings fields, and player selects all follow the same radius and stroke language.

---

## 6. Player

The player is now a defining surface in the system, not just a standard page.

### Current patterns

- Centered cover art with a larger dedicated cover treatment.
- Circular primary play button.
- Circular seek buttons for rewind/forward.
- Utility actions arranged in a 3-column grid.
- Playback rate and progress stats sit inside bordered utility cards.
- On narrow screens, stats collapse from 2 columns to 1.

### Visual direction

- Strong hierarchy
- Low visual noise
- Large tap targets
- More “hi-fi console” than generic form page

---

## 7. Reader

The reader has its own sub-system layered on top of the app shell.

### Reader themes

| Theme | Background | Foreground |
|---|---|---|
| `light` | `#ffffff` | `#1a1a1a` |
| `sepia` | `#f5efe4` | `#1f1a15` |
| `dark` | `#1a1a1a` | `#d4d4d4` |
| `night` | `#050a10` | `#efe6d9` |

Rules:

- Default reader theme is `sepia`.
- Reader typography switches to serif for long-form reading.
- Reader controls should feel quieter than player controls.

---

## 8. Motion and Interaction

Use restrained motion:

- Screen entrance: `slide-up` around `420ms`
- Button press: scale to `0.97`
- Player seek button press: scale to `0.92`
- Mini-player progress animates linearly
- Hover should change tone before position

Avoid:

- Heavy blur
- Large drop shadows
- Bouncy transitions
- Decorative animations unrelated to reading or playback

---

## 9. Responsive Rules

- `680px`: screens go edge-to-edge
- `720px`: cards and banners tighten their padding
- `560px`: player stats collapse and controls compact further
- `768px`: grid increases to 5 columns and floating nav widens

The app should still read as mobile-first even on desktop. Wider layouts get more breathing room, not a different visual language.

---

## 10. PWA Chrome

Current implementation note:

- `index.html` still ships with `<meta name="theme-color" content="#f2f2f7">`

Design target:

- Browser chrome should eventually align with the active canvas rather than the older cool-gray value.

---

*Last updated: April 17, 2026*
