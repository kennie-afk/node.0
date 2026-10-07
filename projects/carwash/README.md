# Forecourt

Revenue assurance for car washes. It tells an owner, every day, how much money
should have come in and how much did, and shows exactly where the gap is.

It is not a point of sale and not a booking app. Its only job is to make theft
visible, and therefore not worth attempting.

## The idea it is built on

Every transaction is witnessed by at least two independent sources, and at
least one of them is not a human. A system where a sale exists only because a
worker chose to record it is defeated in the first week by not recording it.
The product is not the record. The product is the discrepancy between records.

Three ledgers are compared:

| Ledger | Answers | Sources |
| --- | --- | --- |
| Demand | how many cars were here | entry and exit events, plate captures |
| Work | how much washing happened | water litres, pump runtime, machine cycles |
| Money | how much reached the owner | Daraja C2B, card and bank settlement, cash declarations |

A healthy site keeps the three in line. Every fraud in the taxonomy shows up as
a divergence between two of them.

## What is built

- Reconciliation engine covering the whole fraud taxonomy: ghost washes,
  underquoting, off-book upsell, supply pilferage, after-hours operation and
  worker behaviour patterns. Pure functions over the three ledgers, so every
  rule is testable without a database.
- Daily owner report. The dashboard is secondary; the message is the product.
- M-Pesa Daraja C2B parsing, amount handling in whole cents, and payment to job
  matching that refuses to guess when two open jobs share an amount.
- Plate normalisation that survives OCR confusion without destroying data.
- Telemetry ingestion on its own service and its own port: devices authenticate
  with an id and a bcrypt-hashed secret, readings are written raw and folded into
  per-minute buckets in one transaction, and a replayed sequence is dropped rather
  than double counted. Sequence gaps are detected and reported, not silently
  swallowed.
- Postgres schema with `org_id` on every tenant table (including `job_services`, since migration 0013),
  forced row level security as a second line of defence, and monthly partitioning on the two tables that grow.
- Sessions that end when they should: every request checks the account (active, role, site, token version),
  so a suspended person, a demoted manager, a signed-out phone or a changed PIN stops working at once, not at
  token expiry. Change-my-PIN, manager PIN reset and sign-out are real endpoints with console screens.
- Site scoping: anyone tied to a site (every attendant, any manager given a site) sees and acts on that site
  only, on every list, every detail and the close action.
- Cash is not taken on trust: an attendant can only record the quoted price; a different amount needs a
  supervisor, manager or owner, a reason, and is written to the audit trail with both figures. An amount that
  differs with nobody's authorisation raises `cash_amount_mismatch`.
- Rules for the two witnesses that used to be defined but silent: `device_silent` (a flow meter, pump monitor or
  machine counter that sent nothing within N minutes of a job at its bay) and `supply_pilferage`, whose baseline
  now comes from each service's `consumables` (per wash) instead of an empty object.
- Refunds: a supervisor, manager or owner can void a paid job. The payment is stamped reversed and an append-only
  `payment_reversals` row records who and why; the job stops counting as work done and a day already closed is
  recomputed without the sale. Forecourt records the refund, it does not send the money back.
- Every list is keyset-paged (`limit`, `after`, a `next` cursor) and filterable (state, plate, worker, site, date
  range, channel, matched, severity, name, role). CSV exports of jobs, payments, flags and the commission report
  stream the full filtered set, page by page, and defuse spreadsheet formulas.
- A commission report per attendant (`/v1/reports/commissions`, console Earnings) from paid, un-voided work.
- Reports are reads: `GET /v1/report` serves a day as it was last reconciled and never writes. Reconciling a
  day is `POST /v1/sites/close` (the console's Close day button) and the nightly runner.
- Scheduled maintenance for the tables that only grow (see "Operations"), and backup and restore-drill scripts.

## Scale, honestly

Designing this for millions of concurrent users would be designing for the
wrong load. The real shape:

| Load | Reality |
| --- | --- |
| Human users | 10,000 sites is about 100,000 accounts, a few thousand concurrent. Unremarkable. |
| Transactions | 10,000 sites is about 500,000 jobs a day: 6 writes a second average, 40 at the Saturday peak. One indexed Postgres handles it. |
| Telemetry | A flow meter per second across 3 bays at 10,000 sites is 30,000 events a second. Five thousand times the transactional load. |

So the engineering goes where the volume is. Devices report deltas and
per-minute summaries rather than raw ticks, which cuts volume roughly sixtyfold.
Ingestion runs as its own service so a telemetry surge cannot degrade job
creation or payment handling. Telemetry is append only on the hot path, with no
reads, joins or foreign key checks, and is partitioned by month.

## Multi-tenancy

Organisation, then site, then bay. Every tenant-scoped table carries `org_id`,
and Postgres row level security enforces it independently of the query, so a
forgotten `WHERE` clause cannot leak another customer's data. Connections set
`forecourt.org_id` inside the transaction that uses them.

## Audit

`job_events` is append only and is the source of truth. The `jobs` row is a
projection that can be rebuilt from it. Jobs are never hard deleted or silently
edited; corrections write reversing entries. If a worker is dismissed on the
strength of this data, the data has to survive scrutiny.

## Running it

```
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use that for `JWT_SECRET`, generate a second value for `MPESA_CALLBACK_SECRET`, and
set a `POSTGRES_PASSWORD`. Neither secret has a fallback default: the process refuses
to start without them, because a defaulted callback secret would let anyone forge the
payment confirmations the whole product is built to trust.

```
docker compose up -d
npm run migrate
npm test
```

That brings up Postgres, the API on 4000, the telemetry ingestion service on 4100
and the console on 3300.

### Self-serve signup, trial and billing

`POST /v1/signup` starts a signup and issues a six-digit code (stored only as a bcrypt hash, 15
minute expiry, 5 tries, resend with a cooldown and a ceiling; 5 starts an hour per IP and per phone).
`POST /v1/signup/verify` takes the code and a PIN the owner chooses and, in one step, creates the
organisation, a first site, a starter price list, the owner and a 14-day trial, and signs them in.
Two simultaneous verifies create one organisation: the request is claimed atomically.

There is **no SMS provider**. `NOTIFY_PROVIDER=mock` records and logs each message; during a pilot an
operator reads the code with `npm run admin -- messages`, and the signup screen says so plainly. A real
provider is one class behind `src/notify/provider.ts` and needs that provider's own documentation.

Forecourt bills its customers itself (migration 0009; **every price and period is provisional** and
comes from `BILLING_*` configuration, with defaults matching `/pricing`: KES 3,500 for one site, 3,000
per site for two to five, six or more by agreement, 14-day trial). Status is computed from dates at
request time: trial, active, past_due, then suspended (read-only: configuration and reconciliation
actions are refused with 402; **M-Pesa confirmations, telemetry and attendants' job events keep going
in, and nothing is deleted**). Invoices are issued three days before coverage ends, one per period, with
gap-free numbering however often the hourly runner passes. A payment is applied to the oldest open
invoice, partial payments accumulate, an excess becomes credit applied to the next invoice, and a late
payment buys a month from the day it arrives. Payments and invoices are facts: the application role cannot
edit or delete them.

Collection uses the existing Daraja confirmation path: money paid to `BILLING_SHORTCODE` with the
owner's account number (`FC` + six digits) settles the invoice, idempotent on the M-Pesa transaction id;
an unknown account number is kept in `unmatched_billing_payments` for an operator. `BILLING_MODE=mock`
(the default) lets an owner simulate paying from the console through the very same code, and the API
**refuses to start in production in mock mode** unless `BILLING_ALLOW_MOCK_IN_PRODUCTION=true`.
Registering the callback with Safaricom for a real shortcode has not been done or verified; see
[docs/FIRST-CUSTOMER.md](docs/FIRST-CUSTOMER.md) for the runbook, what is verified and what is not.

### First hour

`GET /v1/onboarding` is a checklist derived from what exists, so it cannot drift from the account.
`POST /v1/sandbox` loads one sample car wash (two weeks, run through the real engine) into a **new**
account: every row is flagged `is_demo`, labelled "(sample)", with no usable phone number, device secret
or till; it is excluded from billing and from the real checklist, refused once real records exist, and
removable. `GET /v1/summary` is the shareable "what Forecourt found", built only from days that were
actually reconciled (`day_closes`), with sample data never mixed into a real account. Each site's
finished day is closed automatically every night in the site's own time zone.

Attendants sign in on a phone and see one screen (`/console/work`). They cannot read payments, flags,
water readings, overview, devices, billing or reports: the person being checked does not get to see the
evidence.

### Signup intake (the older, manual path)

`provision` / `create-org` (see [Onboarding a customer](#onboarding-a-customer)) still work and also
create a trial subscription. Pre-existing `signup_requests` rows without a code can still be
provisioned by hand.

### Devices are credentials, not addresses

A meter posting to `/v1/telemetry` sends `X-Device-Id` and `X-Device-Secret`, checked
against the bcrypt hash in `devices.secret_hash` by `resolve_device`, another
`SECURITY DEFINER` lookup. A batch whose `deviceId` does not match the authenticated
device is refused. This matters more than ordinary endpoint auth: telemetry is the
witness that is meant not to be a human, so an unauthenticated ingest would let the
person being audited write the evidence.

### The database user matters

Migrations run as the owner. The application must not. A superuser bypasses
row level security entirely, which would leave the tenant policies decorative
while looking correct in a code review, so migration 0004 creates
`forecourt_app` as `NOSUPERUSER NOBYPASSRLS` and the API checks its own role
at boot: it warns in development and refuses to start in production if the
connected user can bypass RLS.

The Daraja webhook has to find which organisation a till belongs to before it
knows the organisation, which no tenant-scoped query can do. `resolve_till` is
a `SECURITY DEFINER` function granted only to the application role, so that is
the single deliberate hole rather than an accidental one.


## Onboarding a customer

An operator converts a signup request into a working tenant (organisation, first site and
bay, a starter price list, and an owner who can sign in). The command runs through the
application's own restricted database role, so row-level security authorises every insert.
The owner's PIN is random, printed once, and stored only as a bcrypt hash.

```
npm run admin -- signups                        # what is waiting
npm run admin -- provision latest --site "Westlands" --till 5110001
npm run admin -- create-org --business "Amina Car Wash" --owner "Amina Wanjiru" --phone 0712345678
# in the container image:  docker compose run --rm api node dist/admin/cli.js signups
```

A phone number can belong to one account in the whole system (sign-in finds a user by phone
alone), so provisioning refuses a number that is already taken. After sign-in the owner
adds sites, bays, prices and people from the console (Sites, Prices, Team).

## Demo

A complete, believable world in two commands: three sites, a team, a price list, fourteen
days of trading (about 1,400 jobs, 1,400 payments, 80,000 telemetry readings, 2,800 plate
captures) and ten frauds planted on known days. The flags in the console were not typed
in: the seed writes the raw ledgers and then runs the real reconciliation engine over every
day, so each flag is something the product found.

```
cp .env.example .env            # then set POSTGRES_PASSWORD and FORECOURT_APP_PASSWORD (12+ chars)
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile live up -d simulator   # optional live feed
```

Open http://localhost:3300/login (set `CONSOLE_PORT` / `API_PORT` / `POSTGRES_PORT` if those
ports are taken).

| Who | Phone | PIN |
| --- | --- | --- |
| Owner, all sites (Amina Wanjiru) | `254700000001` | `246810` |
| Manager, Westlands (Brian Otieno) | `254700000002` | `246810` |
| Manager, Kilimani (Grace Njeri) | `254700000003` | `246810` |
| Manager, Thika Road (Peter Kamau) | `254700000004` | `246810` |
| Worker, Westlands (Samuel Kiptoo) | `254700000011` | `246810` |

**These accounts share a published PIN. They exist only when `FORECOURT_ALLOW_DEMO_SEED=true`
is set, which only the demo overlay does, and must never exist in a real deployment.**

Without Docker: `npm run migrate`, then
`FORECOURT_ALLOW_DEMO_SEED=true npm run demo:seed` (add `-- --reset` to rebuild), start the API and
ingestion (`npm run dev:api`, `npm run dev:ingestion`) and run `npm run demo:simulate`.

### What to show, in order

1. **Overview** - expected against received, the gap, and what is flagged.
2. **Flags** - worst first. Open `ghost wash` at Kilimani (7 washes' worth of water, no jobs),
   `underquoting` at Thika Road (one worker charging 70% with no authorisation), `after hours
   operation` at Westlands, `cash ratio spike` at Westlands. Resolve one with a note; the
   Resolved tab shows three already closed the way a manager would (explained, confirmed,
   dismissed).
3. **Jobs** then a job - the server-stamped timeline and the payment that matched it.
4. **Water** and **Devices** - the non-human witnesses; Thika Road's pump monitor has gone quiet.
5. **Sites / Prices / Team** - add a site, change a price, add a worker, suspend someone.
6. **Live**: start the simulator and watch Overview move. It drives the real services over HTTP:
   a camera posts plates, a worker records jobs, flow meters post water, customers pay by
   Daraja callback (mock mode, no real money) or cash; about one visit in seven misbehaves
   (an unrecorded wash, an under-quote, a wash never paid, a payment with no job) and the flags
   update every 45 seconds.

### The planted days (seed is deterministic; days are relative to today)

| Site | Days ago | Planted | Flag it raises |
| --- | --- | --- | --- |
| Westlands | 2 | water running at 22:10, outside opening hours | after_hours_operation |
| Westlands | 4 | 3 washes never paid | job_without_payment |
| Westlands | 6 | 88% of jobs settled in cash | cash_ratio_spike |
| Westlands | 9 | 3 M-Pesa payments with no job | payment_without_job |
| Kilimani | 3 | 7 washes of water, no jobs | ghost_wash |
| Kilimani | 8 | 4 washes never paid | job_without_payment |
| Kilimani | 12 | one worker opens and abandons 4 jobs | abandoned_job_pattern |
| Thika Road | 1 | 6 vehicles and washes, no jobs | ghost_wash (water and camera) |
| Thika Road | 5 | one worker charges 70% of list, no authorisation | underquoting |
| Thika Road | 10 | 88% cash | cash_ratio_spike |

`tests/demo-plan.test.ts` proves each of these is caught by the real engine and that every other
day is clean, so nothing in the demo is a false alarm.

## Testing

```
npm test                          # unit tests, no database
FORECOURT_INTEGRATION=1 ...       # against a real migrated Postgres, as the restricted role (RLS on):
                                  # provisioning, the write API, job lifecycle, Daraja matching,
                                  # cross-organisation isolation, demo seed, and the hardening suite (cash variance, site scoping, session
                                  # revocation, keyset paging, maintenance, unclaimed payments, refunds, exports)
```

See the header of `tests/integration.test.ts` for the exact environment. `tests/hardening.test.ts` raises the API's
per-minute rate limit for itself, because it makes a few thousand requests from one address.

### Known limits of the demo data

The demo's services carry no `consumables`, so `supply_pilferage` does not appear in the demo even though the
rule now has a baseline to work from (set them on a service under Prices to see it). The demo's devices are
registered at seed time, and `device_silent` never blames a device for days before it existed, so the demo days
stay clean. Business days are UTC calendar days; opening hours are compared with the site's local clock.

## Operations

### Scheduled maintenance

Started from the API and the ingestion service (and runnable now with `npm run maintenance`). An advisory lock
means any number of replicas can run it; only one does the work at a time. Configurable in `.env`
(`RETENTION_*`, `MAINTENANCE_INTERVAL_MINUTES`):

| Data | What happens |
| --- | --- |
| per-minute telemetry | older than 35 days: summed into per-hour rows and deleted in one statement per site-day, so no litre is lost or counted twice |
| per-hour telemetry | deleted after 800 days |
| raw telemetry | a monthly partition is dropped once the whole month is older than 95 days |
| idempotency keys | deleted after 3 days |
| `job_events`, payments, flags, day closes | **never expired**: they are the evidence |

Reconciling an old day still sees its water, because the day's telemetry query reads the hourly table too.

### Backups and the restore drill

```
DATABASE_MIGRATION_URL=... sh scripts/backup.sh          # one verified dump, atomically written, old ones pruned
DATABASE_MIGRATION_URL=... sh scripts/restore-drill.sh   # restores the newest dump into a scratch database, checks it, drops it
docker compose --profile backup up -d backup            # a daily dump into the forecourt-backups volume
docker compose --profile backup run --rm backup sh /scripts/restore-drill.sh
```

The backup role must be a superuser or have `BYPASSRLS`: every tenant table has forced row level security, and
`pg_dump` refuses rather than silently dumping nothing. The application role is deliberately unable to do this.
The drill fails if a migration is missing from the restored copy or forced row level security did not come back,
and prints the elapsed seconds, which is your recovery time. CI runs both scripts against the integration database.
Run the drill monthly at least; a backup nobody has restored is a hope.

### Production compose

`docker-compose.yml` stays the local and demo path (mock billing, published ports). For a real deployment:

```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The overlay turns billing live (and refuses to start without `BILLING_SHORTCODE`), publishes no Postgres port at
all, binds the API, ingestion and console to 127.0.0.1 for a TLS reverse proxy, sets `restart: always` and requires
`CORS_ORIGINS`. It needs Docker Compose 2.24 or newer. Never combine it with `docker-compose.demo.yml`.

### Operator tools

```
npm run unclaimed:list                                    # M-Pesa money paid to a till nobody had registered
npm run unclaimed:assign <externalRef> <orgId> [siteId]   # move it to that organisation's till; safe to repeat
npm run admin -- reset-pin --phone 0712345678             # a forgotten PIN (a manager can also do this in Team)
npm run maintenance                                       # run the upkeep now
```

`/readyz` answers 503 until every migration this build ships has been applied (a database that is ahead of the
build, as in a rolling deploy, is still ready).

### Known limits

- Session changes made through one API replica reach another within `SESSION_CACHE_SECONDS` (default 10); set it to 0
  to check the account on every request.
- The Overview totals come from `day_closes` up to each site's last closed day before today plus a live count
  after it. A day in the middle that was never reconciled is not in those totals until it is closed.
- Raw-telemetry retention drops whole monthly partitions, so raw readings can live up to a month longer than the
  setting. The per-minute and per-hour tables are the ones reconciliation uses.
- The attendant's `discountAuthorisedBy` on a new job is still taken as given (it is not checked that it names a
  supervisor); cash amounts, by contrast, are enforced.
- Sign-out ends every session of that account, including the same person's other phone.

## Not built yet

Vision and ANPR, chemical dosing actuators, and machine interfaces are phase
three and deliberately absent. Manual plate entry stays in phase one on
purpose: it forces workers to create records, the gap between the human record
and the machine record is the product, and the typed plates become the labelled
dataset ANPR will need.
