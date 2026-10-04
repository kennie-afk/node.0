# Church CMS console: design language

This replaces the earlier "dense, 6px radius, 12px root, no shadows" rules for this app. The CMS
keeps its own blue identity (the blue of sovrano.ai); everything else follows SmartRE (`java.0/smartRE-front`) and the
SmartSeason worked example (`java.0/smartSeason/apps/web/DESIGN.md`).

## What was taken from SmartRE

- Space Grotesk (variable 300-700, headings 700, buttons 500) for everything, self-hosted through
  `@fontsource-variable/*` so the strict CSP (`font-src 'self'`) keeps working.
- Hairline 1px borders, no shadows on cards, one saturated accent for active state, primary
  buttons, links and focus rings.
- Stat cards: 11.5px uppercase label, 19px Space Grotesk tabular value (sans, not Space Grotesk; leading none),
  12px quiet foot, 15px icon in a 26px tinted chip at top right (`StatTile`). No coloured left edge.
- Sidebar: brand mark, labelled collapsible groups, tinted active row with a left accent bar.
- Status badges are tinted pills with a dot, never solid fills.
- Short empty states with an icon chip; no hover motion (colour changes only).
- Full-width content (max 1680px) beside the sidebar.

## Tokens (`src/styles/theme.css`, mapped in `src/ui/ui.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-bg` | #ffffff | #0a1220 | canvas; light mode is pure white everywhere, with cool navy neutrals |
| `--c-surface` | #ffffff | #101a2b | cards, sidebar, inputs |
| `--c-raised` | #ffffff | #162338 | table header, hover, chips |
| `--c-text` / `-2` / `--c-muted` | #162b44 / #2c4260 / #4a5d75 | #eaf1fb / #c3d1e4 / #9fb0c6 | text; muted passes 4.5:1 |
| `--c-border` / `-strong` | #e3ebf5 / #c9d6e6 | #1f2e47 / #324766 | hairlines, inputs |
| `--c-accent` (+hover, soft) | #0053a3 | #6aaef0 | the blue |
| ok / warn / bad / info | green, amber, red, blue | brighter variants | badges, deltas; each has an `-rgb` token for tints |

Themes: `data-theme="light|dark"` on `<html>`, restored before first paint by `/theme-init.js`,
stored in `localStorage['theme']`. Dark remains the default until a person chooses.

## Type scale (root 14px, deliberately small)

`--fs-2xs` 11 (nav group captions) and `--fs-xs` 12 (hints, labels, stat foot; badges 11.5) are the
smallest sizes; nothing is below 11px. `--fs-sm` 13 (table cells, nav, buttons, page sub-title),
`--fs-base` 14 (body), inputs 13.5, `--fs-xl` 15 (card titles, Space Grotesk), `--fs-3xl` 20 (page
titles, Space Grotesk; 18px on phones). Uppercase table headers and stat labels are 11.5.
Stat values and receipt amounts are 19px Space Grotesk 600 with tabular figures. Space Grotesk is kept only
for page titles, card/section titles and the brand.

## Light mode is white

`--c-bg`, `--c-surface`, `--c-raised`, `--c-input` and `--c-fill` are all #ffffff in light. Areas are
separated by hairline borders only. The only tints are badges, the active nav row, and a 4-6%
accent wash on row/nav hover. Dark mode keeps its layered surfaces.

## Layout

- Desktop (>=1024px): 248px sidebar (collapsible to a 64px rail), content padded 24/28px.
- Below 1024px: 56px top bar with a menu button; the sidebar becomes a drawer with a scrim.
- Cards: 12px radius, 16px padding; flush cards put a hairline under the title bar and run the
  table edge to edge. Tables: 10/14px cells (rows about 40px), shaded uppercase header, nowrap and scrolling on phones.
- Controls: 8px radius, 36px minimum height (8/11px padding), 3px accent-soft focus ring.
- Shadows are only for floating layers (combobox list, toasts, drawer).

## Charts

`LineChart` and `BarChart` measure their container (`useWidth`) and draw 1:1, so axis text is a
real 12px at every width.

## Sign in

Split layout: accent-tinted brand panel (Space Grotesk headline) and the form. The "Sign in as" demo
picker is unchanged in behaviour (compiled in only when built with `DEMO_LOGINS=true`).


## The sovrano.ai look (2026-10-04)
The theme follows https://sovrano.ai/ as measured from the live page: primary #0053a3, hover #00498d, deep #02386e,
heading ink #091b30, body #162b44, secondary #284261, muted #52708f (slightly darker than the site's #587598 so it keeps
4.5:1 on the #eff4fb wash), faint #87a2c2 (placeholders only), border #dfe8f3, wash #eff4fb. Buttons 8px radius and weight 500
with a soft blue shadow; cards 12px with a 1px #dfe8f3 border and no shadow. The brand gradient (135deg #0053a3 to #02386e)
is used for the dashboard title and the brand mark only. The dashboard and sign-in carry two very soft blurred blue glows.
Dark mode is a navy scale from the same blues: page #01172d, surface #091b30, raised #162b44, border #284261, text #eaf1f9,
muted #87a2c2, accent #62a0dd (the site's light accent #4a83bf scored 4.37 on surface, under 4.5:1).
