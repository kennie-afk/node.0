# Finance screens

Giving, ledger, payables, banking, budgets, payroll and reports, built on the shared kit in `src/ui`.

- `components/` shared pieces: `Selectors` (fund, account, type, cash account, member pickers), `common` (Money, KeyValue, FormError, ReasonAction, Progress, print/CSV buttons), `report` (report frame and filters), `SectionTabs`, `lookups` (cached reference lists), plus `helpers`, `useSubmit`, `useRangeParams`, `selectorHelpers`.
- `journalMath.ts` and `budgetMath.ts` are pure integer-minor-unit logic with unit tests.
- `dev/seed.mjs` seeds a demo church through the real API. `live/live.test.tsx` walks every finance route and drives the critical flows against a real backend.

Run the live suite (same-origin proxy, like the web image's nginx, because the API's CORS list does not allow the `Idempotency-Key` header):

    node src/features/finance/dev/seed.mjs
    LIVE_API=http://localhost:14400 VITE_API_URL=http://localhost:14300/api npx vitest run src/features/finance/live

Demo logins after seeding (password `demo-passphrase-123`, dev only): admin, treasurer, approver, auditor, pastor @grace-chapel.demo.
