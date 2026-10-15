# RoadWatch — Design System

> Derived directly from the supplied **Code Blocks Inc.** brandsheet
> (`docs/brandsheet.png`). The palette below was extracted from the brandsheet
> PNG pixel-by-pixel and cross-checked against the written brand details — they
> match exactly.

---

## 1. Brand foundation

| Token | Hex | Brand role | Where we use it |
|---|---|---|---|
| `darkBlue` | `#071633` | Backgrounds, text, logo | App bars, nav, footers, primary buttons, headings |
| `lightAzure` | `#c5d5e0` | Lines and borders | Dividers, input borders, card outlines |
| `lightBlue` | `#c3e6ff` | Highlights, buttons, logo accents | Accents, selected states, map list chips, badges |
| `lightYellow` | `#f3efe3` | Warm paper and accents | Warm surfaces, callouts, empty states |
| `cardSurface` | `#f7fbff` | Card surfaces (supporting) | Cards, sheets, list tiles |
| `sheetBackground` | `#eaf0fa` | Screen background (supporting) | Scaffold / page background |
| `textSecondary` | `#3d4b63` | Secondary text (supporting) | Supporting copy |
| `textMuted` | `#5b6a82` | Tertiary text (supporting) | Captions, hints, placeholders |

**Balance target:** ~45% Dark Blue, ~30% Light Yellow, ~15% Light Blue, ~10% Light Azure.

> `#f7fbff`, `#eaf0fa`, `#3d4b63` and `#5b6a82` are supporting tints from the
> brandsheet mockups (not official brand colours) and are only used to build a
> readable surface system.

---

## 2. Typography

| Role | Family | Weight | Size |
|---|---|---|---|
| Logo wordmark | League Spartan | Bold | as per logo |
| Website headline | League Spartan | Bold | 64 px |
| Section titles | League Spartan | Bold | 36–40 px |
| App bar / card titles | League Spartan | Bold | 20–24 px |
| Buttons / labels | League Spartan | SemiBold–Bold | 14–16 px |
| Body text | Poppins | Regular/Medium | 16–18 px |
| Captions / meta | Poppins | Regular/Medium | 12–14 px |

Fonts are **bundled locally** (`mobile/assets/fonts`) so both apps render the
brand correctly offline. The web platform loads the same families.

---

## 3. Shape, spacing, elevation

- **Corner radius scale:** `sm 14` · `md 20` · `lg 28` · `xl 40` · `pill 999`
- **Spacing scale (dp/px):** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56`
- **Elevation:** soft, low-spread shadows only. No heavy drop shadows or glow.
- **Block motif:** the Code Blocks "column of three rounded squares with two
  accent squares" is reused for icon tiles, list bullets, step numbers and the
  subtle footer/section pattern.

## 4. Layout style

- Dark Blue headers and footers; light cards in between.
- Friendly, clean, modern-tech feel; generous white space; rounded everything.
- Mobile-first; web platform is responsive down to phone width.

---

## 5. Functional (status) colours

The brand palette contains no semantic red/green/amber, so these complements
were chosen to keep contrast and harmony with the brand blues.

### Moderation status

| Status | Colour | Hex |
|---|---|---|
| `PENDING_REVIEW` | Amber | `#c9821f` |
| `APPROVED` | Green | `#1f8a5b` |
| `REJECTED` | Red | `#c23b3b` |

### Repair status

| Status | Colour | Hex |
|---|---|---|
| `NOT_ASSIGNED` | Slate | `#5b6a82` |
| `AWAITING_MAINTENANCE` | Blue | `#2f6fd0` |
| `IN_PROGRESS` | Amber | `#c9821f` |
| `COMPLETED` | Green | `#1f8a5b` |

All status colours are used on a light tint background with dark text to keep
WCAG AA contrast.

---

## 6. Iconography

- Material Symbols / Icons, rounded, 2px stroke, 20–24 px.
- Category icons: pothole ● , pavement ▤ , crack 〰 , flooding ≋ , drainage ⬡ , other ⚑.

## 7. Accessibility

- Minimum body size 16 px on mobile.
- Touch targets ≥ 44×44 dp.
- Contrast ≥ 4.5:1 for text on brand surfaces.
- Never rely on colour alone — status is always paired with a label and icon.
