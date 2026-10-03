# Taking the first paying customer

What is true today, what to do before the first sale, and how to run the first account. Everything
marked **verified** was run against a real Postgres and the real compose stack on 2026-10-03.
Everything marked **not verified** is an external dependency nobody has exercised yet.

## What a new owner can do on their own (verified)

1. Open `/signup`, enter business, name and phone. A six-digit code is issued.
2. Enter the code and choose a six-digit PIN. The account, first site, starter price list and a
   14-day trial exist at that moment. No operator step.
3. `/console/get-started`: a checklist that ticks itself. **Load sample data** shows two weeks of a
   sample car wash, checked by the real engine, labelled sample everywhere and never billed.
4. Add attendants (Team), set the till number (Sites). Attendants sign in on a phone and see one
   screen, **Work**: record the car, start, finish, cash received, close.
5. **Found** summarises the days that were actually reconciled, with a copy button. Each site's finished day is closed automatically every night (hourly check, once per day per site); **Check the last 14 days** back-fills.
6. **Billing** shows the trial, the invoice, the account number and how to pay.

## Before the first sale: your checklist

- [ ] **Deploy** with real secrets (see README "Running it"). Use HTTPS in front of the console and API.
- [ ] **Billing mode.** The API refuses to start in production with `BILLING_MODE=mock` unless
      `BILLING_ALLOW_MOCK_IN_PRODUCTION=true` (so mock cannot hand out free months by accident). For real
      money set `BILLING_MODE=live` and `BILLING_SHORTCODE` (your paybill/till), and delete the allow flag.
- [ ] **Decide how you will be paid** (below). The prices are provisional: confirm `BILLING_PRICE_*`.
- [ ] **Decide how verification codes reach people** (below). There is no SMS provider.
- [ ] Run `npm run admin -- billing:run` once and check the logs; the API also runs it hourly.
- [ ] Take a backup of Postgres and test a restore. Nobody has done that for this system yet.

## Getting paid

**Mode A: manual (works today, verified).** The owner pays your M-Pesa number or till, quoting their
account number (shown on Billing, `FC` plus six digits). You then record it:

```
npm run admin -- billing:show <org-id>
npm run admin -- billing:pay <org-id> <MPESA-CODE> <KES>
```

`billing:pay` is idempotent on the M-Pesa code, so recording the same payment twice changes nothing.
It pays the oldest open invoice, banks any excess as credit, and reactivates a suspended account at
once. A late payment buys a full month from the day it arrives.

**Mode B: automatic via Daraja (built, NOT verified).** Money paid to `BILLING_SHORTCODE` reaches the
same confirmation webhook the tills use and settles the invoice by account number. In mock mode this is
proven end to end (including idempotency, a mistyped account number, and an unknown one kept for
review). What nobody has done: register the callback URL for your shortcode with Safaricom and receive a
real confirmation. Unknowns to settle with Safaricom's own documentation, not from this repo:

- how a confirmation URL is registered for your shortcode, and any rules on its shape;
- whether Daraja can send the `x-callback-secret` header. If it cannot, register the path form
  `/v1/hooks/pay/<MPESA_CALLBACK_SECRET>/confirmation` instead (built, tested, same checks).

Money that arrives with an account number nobody holds is kept, not dropped:
`npm run admin -- billing:unmatched`, then `billing:assign <code> <org-id>`.

## Verification codes

`NOTIFY_PROVIDER=mock` records and logs each message and sends nothing. During a pilot you relay the
code yourself: the signup screen tells the owner honestly that text messages are not switched on, and
you read it with `npm run admin -- messages`. A real provider is one class behind an interface
(`src/notify/provider.ts`); it needs that provider's real documentation and credentials, so it is not
guessed at here. Codes expire in 15 minutes, allow 5 tries, and are stored only as a hash.

## What the first customer's money flow needs (read this before promising anything)

Forecourt checks recorded work against money received. For a customer's **own till** to feed it,
that till's confirmation URL must be registered with Safaricom to point at Forecourt (same unverified
dependency as Mode B, per customer). Until that is done and tested with a real payment:

- jobs recorded by attendants are real; cash declared by attendants is real;
- M-Pesa payments will **not** arrive on their own, so every card-paid job will look unpaid.

Be honest with the customer about this on day one. Do not sell the "payments match automatically"
claim until you have watched a real payment arrive. The sample data and the Found screen show what the
product does; they are not evidence that a given till is connected.

## Devices (the non-human witness)

The strongest signals (cars with no job, water outside opening hours, supply use) need a flow meter or
a plate camera that posts to the telemetry service. Forecourt does **not** supply or certify hardware
and nobody has connected a real device. What exists and is verified: an owner or operator can register a
device (`POST /v1/devices` or `npm run admin -- device:add --org ID --site ID --type flow_meter`), its
secret is shown once and stored only as a hash, and it can then post readings. Without devices the
product still compares recorded work, M-Pesa and cash declarations, which catches unpaid jobs, payments
with no job, underquoting, unusual cash share and abandoned-job patterns.

## Running the account day to day

| Task | Command |
| --- | --- |
| Who is waiting / onboarded | `npm run admin -- signups` |
| Read a verification code | `npm run admin -- messages` |
| An account's state and invoices | `npm run admin -- billing:show <org-id>` |
| Record a payment received outside the callback | `npm run admin -- billing:pay <org-id> <code> <KES>` |
| Agreed price for a 6+ site plan | `npm run admin -- billing:price <org-id> <KES\|none>` |
| Register a device | `npm run admin -- device:add --org ID --site ID --type flow_meter` |
| Issue due invoices now | `npm run admin -- billing:run` |
| A forgotten PIN | `npm run admin -- reset-pin --phone NUMBER` |

## States and what each one means for the customer

| State | When | Effect |
| --- | --- | --- |
| trial | first 14 days (configurable) | everything works |
| active | a period is paid | everything works |
| past_due | coverage lapsed, up to 14 days | everything works; a banner asks them to pay |
| suspended | lapsed longer | read-only: they cannot change settings or run reconciliation actions |
| cancelled | set by you | read-only |

A suspended account **keeps every record and keeps collecting**: M-Pesa confirmations, telemetry and
attendants' job events still go in, so nothing is lost while they are behind. Nothing is ever deleted.
Paying reactivates immediately. The status is computed from dates at request time, so a missed scheduler
run cannot leave an account wrongly open or wrongly locked.

## Known limits (not fixed, said plainly)

- No self-service PIN recovery. An owner can reset an attendant's PIN under Team; an owner who forgets their own PIN needs you: `npm run admin -- reset-pin --phone NUMBER` prints a new one once.
- The daily summary is computed automatically each night (every site is closed once for its own yesterday, checked hourly) but it is **not pushed** to anyone's phone: the owner opens Found or Report. Pushing it by WhatsApp/SMS needs a real message provider.
- Prices, trial and grace are provisional and set by configuration, not by contract.
- No data export for owners, no backup/restore drill, no uptime monitoring or alerting.
- Personal data (staff names and phones, number plates) is held. Whether you must register with the
  Office of the Data Protection Commissioner, and what staff must be told, has not been checked here:
  ask a lawyer before the first customer.
- The landing page's wording about watching water and cars describes the device-equipped setup; with
  no devices connected it is not what that customer gets. Say which it is.
