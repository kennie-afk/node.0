# First pharmacy: an operator runbook

Everything here uses only what exists. Outreach and the first sale are yours; the code cannot do them.

## Before you meet anyone
1. Deploy on a machine you control (or a small VPS) with real generated secrets in `.env`, using the production override so TLS, live billing and a shared rate-limit store are on: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` (see the README, "Operating it"). The plain `docker compose up` is the demo path and speaks HTTP.
2. Decide what you will honestly say about prices: they are provisional (4,500 per first branch, 3,500 per extra, per month, 14-day trial). Change them in `.env` before the first invoice if you want different ones.
3. Run `node scripts/isolation-check.mjs` and `npx vitest run` once on the deployment target.

## Getting a pharmacy started (about 20 minutes on site)
1. They go to `/signup` on their phone, enter their business and their own number. **Unless you have configured and verified Africa's Talking (`NOTIFY_MODE=africastalking`, unverified), there is no SMS**, so read the code from the server: `docker compose exec api node dist/admin/cli.js messages`, and tell them the six digits. They choose their own PIN.
2. Open **Get started**. Load the sample branch so they can practise selling, an expired batch and a prescription before touching real data. Hide it when they are ready.
3. Add their real products (scan a box into the GTIN field), add a supplier, **receive one real delivery** with batch numbers and expiry dates (or scan the packs). That is what makes the expiry alerts true.
4. Add their cashier(s) and pharmacist under **Team**. Everyone gets their own phone and PIN; the PIN is shown once.
5. Optional: enter their M-Pesa till number under **Branches** so customers' payments match sales on their own. **This depends on Safaricom delivering confirmations to your URL, which has not been done or tested live**: register `https://<your host>/v1/mpesa/<MPESA_CALLBACK_SECRET>/confirmation` through Safaricom's process (their documentation, not this repo's), then test with a small real payment. Until then the cashier types the M-Pesa code at the till, which works today.
6. At the end of their first day, show them **Close day**.

## When something goes wrong
- Forgotten PIN: `docker compose exec api node dist/admin/cli.js reset-pin <phone>` (prints a new one once), or a manager uses **Team > New PIN**.
- Payment they made to Dawa that did not arrive by itself: `billing:pay <org id> <mpesa code> <KES>`; unknown account numbers: `billing:unmatched`, then `billing:assign`.
- A pharmacy's account went read-only: they owe an invoice; nothing is deleted. Paying (or `billing:pay`) reopens it at once.

## Things to be straight about with a pharmacist
- Dawa is **not** connected to the national track-and-trace platforms, and does not decide what the law classes a medicine as. It records batch, expiry and serial data and keeps the dispensing and controlled-drug records, and exports them.
- There is no offline mode, no receipt printing, no transfers between branches.
- Dispensing records are health information. Keep the database backed up and access-controlled; run `scripts/backup-drill.sh` on the deployment and keep copies off the machine; no data-protection review has been made.
