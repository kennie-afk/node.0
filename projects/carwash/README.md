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
- Telemetry ingestion with sequence gap detection, batch caps and per-minute
  edge folding.
- Postgres schema with `org_id` on every tenant table, row level security as a
  second line of defence, and monthly partitioning on the two tables that grow.

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

Use that for `JWT_SECRET`, set a `POSTGRES_PASSWORD`, then:

```
docker compose up -d
npm run migrate
npm test
```

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

## Not built yet

Vision and ANPR, chemical dosing actuators, and machine interfaces are phase
three and deliberately absent. Manual plate entry stays in phase one on
purpose: it forces workers to create records, the gap between the human record
and the machine record is the product, and the typed plates become the labelled
dataset ANPR will need.
