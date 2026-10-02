# Church CMS console: design language

This replaces the earlier "dense, 6px radius, 12px root, no shadows" rules for this app. The CMS
keeps its own orange identity; everything else follows SmartRE (`java.0/smartRE-front`) and the
SmartSeason worked example (`java.0/smartSeason/apps/web/DESIGN.md`).

## What was taken from SmartRE

- Fraunces (headings, headline figures) and Manrope (body, controls), self-hosted through
  `@fontsource-variable/*` so the strict CSP (`font-src 'self'`) keeps working.
- Hairline 1px borders, no shadows on cards, one saturated accent for active state, primary
  buttons, links and focus rings.
- Stat cards: small uppercase label, large tabular value, quiet foot, 4px coloured left edge,
  icon chip at top right (`StatTile`, optional `icon`).
- Sidebar: brand mark, labelled collapsible groups, tinted active row with a left accent bar.
- Status badges are tinted pills with a dot, never solid fills.
- Short empty states with an icon chip; no hover motion (colour changes only).
- Full-width content (max 1680px) beside the sidebar.

## Tokens (`src/styles/theme.css`, mapped in `src/ui/ui.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-bg` | #faf7f3 | #0e0d0c | canvas (warm tint so white cards read as raised) |
| `--c-surface` | #ffffff | #181614 | cards, sidebar, inputs |
| `--c-raised` | #f6f2ec | #211e1b | table header, hover, chips |
| `--c-text` / `-2` / `--c-muted` | #1c1917 / #44403c / #5d5851 | #f6f2ed / #d6cfc6 / #aaa297 | text; muted passes 4.5:1 |
| `--c-border` / `-strong` | #e9e3da / #d4ccc0 | #2d2925 / #433d36 | hairlines, inputs |
| `--c-accent` (+hover, soft) | #c2501a | #ee8444 | the orange |
| ok / warn / bad / info | green, amber, red, blue | brighter variants | badges, deltas; each has an `-rgb` token for tints |

Themes: `data-theme="light|dark"` on `<html>`, restored before first paint by `/theme-init.js`,
stored in `localStorage['theme']`. Dark remains the default until a person chooses.

## Type scale (root 15px)

`--fs-2xs` 12 and `--fs-xs` 13 are for uppercase captions, hints and badges only. `--fs-sm` 14
(table cells, nav, buttons), `--fs-base` 15 (body, fields), `--fs-lg` 16.5, `--fs-xl` 19 (card
titles, Fraunces), `--fs-2xl` 24, `--fs-3xl` 30 (page titles, Fraunces; 26px on phones).
Stat values are 28px Fraunces, tabular figures.

## Layout

- Desktop (>=1024px): 272px sidebar (collapsible to a 68px rail), content padded 36/40px.
- Below 1024px: 56px top bar with a menu button; the sidebar becomes a drawer with a scrim.
- Cards: 12px radius, 20px padding; flush cards put a hairline under the title bar and run the
  table edge to edge. Tables: 12/16px cells, shaded uppercase header, nowrap and scrolling on phones.
- Controls: 8px radius, 9/12px field padding, 3px accent-soft focus ring.
- Shadows are only for floating layers (combobox list, toasts, drawer).

## Charts

`LineChart` and `BarChart` measure their container (`useWidth`) and draw 1:1, so axis text is a
real 12px at every width.

## Sign in

Split layout: accent-tinted brand panel (Fraunces headline) and the form. The "Sign in as" demo
picker is unchanged in behaviour (compiled in only when built with `DEMO_LOGINS=true`).
