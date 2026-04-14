# Beskar Shelf Design System

> iOS-inspired glass morphism with a clean, content-first approach.
> Translucent surfaces, soft depth, and green accents — covers are the hero, UI disappears.

---

## 1. Foundations

### Color Palette

#### Surfaces

| Token              | Value                        | Usage                                    |
|--------------------|------------------------------|------------------------------------------|
| `surface`          | `#f2f2f7`                    | Page background (iOS system gray 6)      |
| `surface-elevated` | `rgba(255,255,255,0.72)`     | Cards, inputs (translucent)              |
| `surface-solid`    | `#ffffff`                    | When glass is not possible               |
| `surface-dark`     | `rgba(0,0,0,0.04)`          | Hover states, secondary fills            |

#### Glass

| Token              | Value                        | Usage                                    |
|--------------------|------------------------------|------------------------------------------|
| `glass-bg`         | `rgba(255,255,255,0.65)`     | Standard glass surface                   |
| `glass-bg-heavy`   | `rgba(255,255,255,0.82)`     | Nav bars, overlays (more opaque)         |
| `glass-blur`       | `blur(20px)`                 | Standard blur                            |
| `glass-blur-heavy` | `blur(40px)`                 | Nav bars, overlays (heavier blur)        |
| `glass-border`     | `rgba(255,255,255,0.45)`     | Subtle white border for glass edges      |
| `glass-shadow`     | `0 2px 16px rgba(0,0,0,0.06)` | Soft shadow for glass elements         |
| `glass-shadow-lg`  | `0 8px 32px rgba(0,0,0,0.08)` | Elevated glass elements               |

#### Accent (green)

| Token        | Hex       | Usage                              |
|--------------|-----------|------------------------------------|
| `accent-400` | `#43C96D` | Light highlights                   |
| `accent-500` | `#1DB954` | Primary buttons, active states     |
| `accent-600` | `#169448` | Button hover                       |
| `accent-700` | `#11753A` | Button pressed                     |

#### Text

| Token            | Hex       | Usage                              |
|------------------|-----------|------------------------------------|
| `text`           | `#1c1c1e` | Primary text (iOS label)           |
| `text-secondary` | `#636366` | Secondary text (iOS secondaryLabel)|
| `text-muted`     | `#aeaeb2` | Hints, metadata                    |
| `text-hint`      | `#c7c7cc` | Placeholders                       |

#### Borders

| Token         | Value                  | Usage                    |
|---------------|------------------------|--------------------------|
| `line`        | `rgba(0,0,0,0.04)`    | Subtle dividers          |
| `line-strong` | `rgba(0,0,0,0.08)`    | Input borders            |

### Typography

| Role     | Stack                                              | Weight    |
|----------|----------------------------------------------------|-----------|
| All      | SF Pro Display, SF Pro Text, system-ui, sans-serif | 400–700   |

System font stack — no external font loads. Antialiased rendering.

### Border Radius

| Token        | Value    | Usage                              |
|--------------|----------|------------------------------------|
| `radius-sm`  | `10px`   | Covers, tags, small elements       |
| `radius`     | `14px`   | Buttons, pills, inputs, chapter rows |
| `radius-lg`  | `20px`   | Cards, panels, nav bars            |
| `radius-pill`| `9999px` | Full-round or true capsule elements only |

---

## 2. Glass Cards

Translucent cards with backdrop blur:

```css
.card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 20px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}
```

No hard borders. Glass separation through translucency and blur.

---

## 3. Book Covers

Covers are the primary visual element with soft shadows:

```css
.cover {
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

### Grid layout

- **Mobile (< 480px)**: 3 columns
- **Tablet (480–768px)**: 4 columns
- **Desktop (768px+)**: 5 columns

---

## 4. Navigation

### Bottom nav (glass bar)

```css
.bottom-nav {
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
```

Active tab: green accent background with white text.

### Library pills

Use the standard rounded-rectangle control radius for category pills and compact filters:

```css
.pill-link {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.45);
}

.pill-link.active {
  background: #1DB954;
  color: #fff;
}
```

---

## 5. Buttons

Borderless, soft-fill buttons:

```css
.primary-button {
  background: #1DB954;
  color: #fff;
  border: none;
  border-radius: 14px;
  font-weight: 600;
}

.ghost-button {
  background: rgba(0, 0, 0, 0.05);
  color: #636366;
  border: none;
  border-radius: 14px;
}
```

Compact action pills should share the same `radius` token as buttons and category pills so controls feel like one family.

---

## 6. Interactive States

| State         | Pattern                                        |
|---------------|------------------------------------------------|
| Focus         | `box-shadow: 0 0 0 3px rgba(40,167,69,0.2)`   |
| Hover         | Lighten to `rgba(0,0,0,0.08)`                  |
| Active/press  | `transform: scale(0.97)`                       |

---

## 7. Responsive Breakpoints

| Breakpoint | Grid columns | Max content width |
|------------|-------------|-------------------|
| < 480px    | 3           | 100%              |
| 480–768px  | 4           | 600px             |
| 768px+     | 5           | 600px             |

---

## 8. PWA Theme

```html
<meta name="theme-color" content="#f2f2f7">
```

---

*Last updated: April 2026*
