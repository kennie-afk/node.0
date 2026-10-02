# Console UI kit

Shared building blocks for every screen. Import from one place:

```ts
import { PageHeader, DataTable, Button, MoneyInput, formatMoney, useQuery } from '../../ui';
```

The live catalogue is at **`/ui-kit`** (dev server only; it is tree-shaken out of production builds).

## House rules (they are checkable)

| Rule | Value |
| --- | --- |
| Root font size | 15px. Scale: `2xs` 12 · `xs` 13 · `sm` 14 · `base` 15 · `lg` 16.5 · `xl` 19 · `2xl` 24 · `3xl` 30 (CSS vars `--fs-*`). 12-13px only for uppercase captions and hints |
| Type | Fraunces for page titles, card titles and headline figures; Manrope for everything else. Page title `3xl`; table cells `sm`; column headers `xs` uppercase |
| Radius | 8px controls, 12px cards (`--ui-radius`, `--ui-radius-lg`) |
| Depth | 1px hairline border; shadow only on floating layers (menus, toasts, drawer) |
| Hover | Colour changes; **nothing moves** (no translate, scale or press nudge) |
| Figures | `tabular-nums` (`numeric` columns, `.ui-num`) |
| CRUD | A create/edit form is its own route (`/x/new`, `/x/:id/edit`), never a panel above the table it changes |
| Delete/void | `InlineConfirm` where the button is. Never `window.confirm` |
| Empty states | A signpost (`EmptyState`): heading, one sentence, the way forward; about 44px tall padding |
| Lists | Server-side paging, filtering and search. Never fetch everything and filter in the browser |
| Money | Decimal **strings** end to end. Use `toMinor`/`fromMinor`/`addMoney`/`sumMoney`, never `parseFloat` |

Tokens live in `ui.css` (`--ui-*`). Use the classes/components; do not hand-roll cards, tables or empty states, and do not add inline hover handlers.

## Components

**Layout and text**
- `PageHeader {title, subtitle?, actions?, crumbs?: {label, to?}[]}` - page title row. Wrap a page in `<div className="ui-page">`.
- `Card {title?, subtitle?, actions?, flush?, to?}` - bordered section; `flush` removes padding for a table; `to` makes the card a link.
- `StatTile {label, value, foot?, tone?: 'ok'|'bad'|'warn', delta?: number, upIsGood?, spark?}` - headline figure. `value` is already formatted.
- `Tabs {tabs: {key, label, to?}[], active, onChange?}` - local-state tabs, or route links when `to` is given.
- Layout helpers (CSS classes): `ui-page`, `ui-stack`, `ui-row`, `ui-grid` (set `--ui-min` for the column minimum), `ui-form`, `ui-form-grid`, `ui-form-actions`.

**Actions and status**
- `Button {variant: 'primary'|'secondary'|'ghost'|'danger'|'dangerSolid', size: 'sm'|'md', loading?, icon?, to?}` - `to` renders a router link styled as a button.
- `InlineConfirm {label, question, confirmLabel?, onConfirm, variant?}` - replaces the button with the question and Yes/Cancel.
- `Badge {tone, dot?}`, `StatusPill {status}` - `POSTED`, `PAID`, `VOID`, `PARTIALLY_PAID`... get a tone and a readable label (`toneFor` maps them; extend `tones.ts`).
- `useToast()` -> `{success, error, show}`; the provider is in `DashboardLayout`, so toasts work on every page.

**Forms** (wrap a control in `Field` for label, hint, error and aria wiring)
- `Field {label, hint?, error?, required?, children: (aria) => control}` - spread the argument on the control: `{(c) => <Input {...c} />}`.
- `Input`, `Select`, `Textarea` - styled native controls.
- `MoneyInput {value: string, onChange(string), currency?}` - filters typing to digits and 2 decimals, pads to `12.00` on blur; value stays a string.
- `DateInput {value: 'YYYY-MM-DD', onChange}` - no timezone maths.
- `Combobox<V> {search(query) => Promise<ComboOption[]>, value, onChange}` - server-side type-ahead with arrow keys and ARIA combobox roles.

**Lists**
- `DataTable<T> {columns, rows, rowKey, loading?, error?, onRetry?, empty?, rowHref?, onRowClick?, footer?, totals?, sticky?, maxHeight?}` - handles skeleton, error-with-retry, empty signpost and stale-while-refetching. Column: `{key, header, render?, numeric?, align?, width?}`. `rowHref` makes rows navigate and turns the first cell into a real link.
- `Pagination {page, totalPages, total, pageSize, onPage}` (offset) and `LoadMore {shown, hasMore, loading, onMore}` (keyset).
- `FilterBar` + `SearchInput {onSearch}` (debounced).
- `EmptyState`, `ErrorState {message, onRetry, requestId}`, `Skeleton`, `SkeletonRows`, `PageLoader`.

**Charts** (dependency-free SVG; each has a spoken summary via `aria-label`, per-mark `<title>`, and a legend with the numbers so colour is never the only signal)
- `Sparkline {values, label}`, `BarChart {data: {label, value}[], label, format?}`, `LineChart {labels, series, area?, label}`, `Donut {slices, center?, label}`, `StackedBar {rows: {label, segments}[], label}`. Chart geometry uses plain numbers for drawing only; derive them from decimal strings with `toMinor(x) / 100` and never feed them back into arithmetic.

**Data hooks and helpers**
- `useQuery(fetcher, deps, {enabled?}) -> {data, error, loading, refetch}` - stale responses are dropped; previous data stays during refetch.
- `useKeysetList<T>(path, params, {limit?}) -> {items, loading, loadingMore, error, hasMore, loadMore, refresh}` - for `{data, nextCursor}` endpoints. Changing `params` restarts from page one.
- `http` (`src/api/http.ts`) - `get/post/put/patch/delete` return the body and throw `ApiError {message, status, fields[], requestId, fieldMessage(field)}`. `http.postIdempotent(url, body, key)` sends an `Idempotency-Key`; create the key once per submission (`useRef(newIdempotencyKey())`) so a double click or retry cannot post twice. `normalizeError`, `cleanQuery`, `newIdempotencyKey` are exported.
- `formatMoney`, `formatDate`, `formatDateTime`, `formatCount`, `todayISO`, `monthStartISO`, `yearStartISO`, `percent`, `cx`.

## Adding a feature (what the finance and operations screens do)

1. **API module** - `src/api/<feature>Api.ts`: typed functions over `http`, e.g. `export const listBills = (q) => http.get<KeysetPage<Bill>>('/payables/bills', q)`. Money fields are strings.
2. **Pages** - `src/pages/<area>/<Name>Page.tsx`, default export. Use `PageHeader`, `DataTable`, etc. Create/edit forms are their own pages (`.../new`, `.../:id/edit`).
3. **Route** - add to `src/routes/finance.routes.tsx` or `ops.routes.tsx` (your fork's file only):
   ```tsx
   <Route key="bills" path="/payables/bills" element={lazyPage(() => import('../pages/payables/BillsPage'), 'finance:read')} />
   ```
   `lazyPage` code-splits the page and wraps it in `RequirePermission` when you pass a permission (one or an array; any suffices).
4. **Nav item** - add to `src/nav/finance.nav.ts` or `ops.nav.ts`:
   ```ts
   { label: 'Bills', path: '/payables/bills', icon: Receipt, group: 'payables', permission: 'finance:read', order: 10 }
   ```
   Groups: `overview, people, worship, giving, finance, payables, payroll, reports, operations, data, admin`. Items a role cannot use are hidden; empty groups disappear.
5. **Permissions** - `useAuth().can('finance:post')` for hiding buttons. The server enforces every rule; this only hides what would 403. `src/auth/permissions.ts` mirrors the backend matrix and a test fails if they drift.

Tests: `npm test` (vitest + Testing Library). Add `*.test.ts(x)` next to the code.
