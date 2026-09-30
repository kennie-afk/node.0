# Church CMS: architecture

Multi-tenant church management with a fund-accounting general ledger. One Postgres, stateless API
replicas, a job-queue worker pool, PgBouncer in front of the database.

```
 browser ─► ingress/edge ─► web (static)            api replicas ─► PgBouncer ─► Postgres (primary)
                        └──► api (N, stateless) ───┤                              └► replicas (reports)
                                                   └► Redis (rate limits, cache)
 worker (M) ──► PgBouncer ─► Postgres      jobs table = durable queue, claimed with SKIP LOCKED
```

## Request path

1. `authenticateToken` verifies the JWT and builds a tenant context (church, user, role).
2. The first query of the request opens **one transaction** and stamps it `SET LOCAL app.church_id`
   (`common/tenant-db.ts`). Everything the request does, including nested "transactions" (which
   become savepoints), runs in it.
3. The transaction commits **before the response is flushed** and rolls back on any 4xx/5xx. A client
   that received a 201 can read its write; a deferred constraint that fails at COMMIT becomes an error
   response, not a silent loss.
4. Idempotency-Key middleware stores the first 2xx response inside that same transaction, so a retry
   replays it and the work and the key commit or roll back together.

## Tenant isolation: four independent layers

| Layer | What it stops | Where |
|---|---|---|
| Application scoping | forgotten tenant filter in a query | `TenantRepository` adds `church_id` to every query; refuses to run with no tenant context |
| Row-level security | a bug, bad join or SQL injection reading another church | policies on every tenant table keyed on `app.church_id`; the API connects as a **non-owner, non-superuser** role (`cms_app`). The server refuses to start in production on a role that bypasses RLS |
| Composite foreign keys | a row pointing at another church's row | `(church_id, x_id) REFERENCES x (church_id, id)` on finance tables; a plain FK on a global id cannot do this |
| Hash-partitioning | blast radius and noisy neighbours | `journal_lines` is hash-partitioned by `church_id`, so a tenant's queries touch one partition |

Sign-in is the one place that must find a user before knowing the church; it goes through a narrow
`SECURITY DEFINER` function that returns a single account. Worker operations that cross tenants
(claim, finish, fail, purge) are likewise definer functions; the application role cannot list or edit
another church's jobs.

## Ledger invariants

Enforced in code (`modules/finance/ledger.service.ts`) **and** by the database, so a bug or a
hand-written `UPDATE` cannot quietly corrupt the books:

1. Every entry has at least two lines, each a positive integer of minor units on exactly one side.
2. Debits equal credits, overall **and within each fund** (DEFERRABLE constraint trigger, checked at COMMIT).
3. Postings only go into an **open** fiscal period whose dates contain the entry date (trigger).
4. `journal_lines` and `audit_events` are **append-only**; a posted entry can never be deleted and
   its only possible change is gaining a `reversed_by_entry_id`. Corrections are reversals.
5. Entries form a **per-church hash chain** (`prev_hash`, `hash`) with gapless entry numbers.
   `verifyLedger` recomputes every hash and every running balance; the worker does this nightly for
   every church and writes the verdict into the church's own audit chain.
6. `ledger_balances` (per period/account/fund running totals) is updated in the same transaction as
   the posting, so statements read a few hundred rows instead of scanning the journal.
7. Money is an integer count of minor units end to end; no floating point touches an amount.

The per-church chain lock (one row in `finance_chain`, `SELECT ... FOR UPDATE`) serialises a church's
postings and nothing else. Churches never contend with each other.

## Background work

`modules/jobs`: a Postgres-backed queue. Producers `enqueueJob(t, ...)` **inside their business
transaction** (transactional outbox: the job exists iff the change committed). Workers claim with
`FOR UPDATE SKIP LOCKED`, run tenant jobs inside `runAsTenant` (so RLS applies to jobs too), retry
with exponential backoff (10s doubling to 1h), dead-letter after `max_attempts`, and re-queue any job
whose worker died (lease expiry). Delivery is **at-least-once**: handlers must be idempotent.
Recurring work is **leaderless**: each schedule's `last_run_at` is advanced by one atomic upsert, so
exactly one of N workers fires it per interval. (A session advisory lock would be the textbook
leader election, but session locks do not survive PgBouncer transaction pooling.)

## Threat model

| Attack | Mitigation |
|---|---|
| Member self-promotes or resets another user's password | permission matrix (`auth/permissions.ts`), `forbidSelfPromotion`, `authorizeSelfOrAdmin`; tests |
| Cross-tenant read/write via IDOR or forged `churchId` | layers 1-3 above; `churchId` in a body is ignored |
| SQL injection | parameterised queries everywhere; even a successful injection is fenced in by RLS |
| Treasurer alters history to hide theft | append-only lines, reversal-only corrections, hash chain, nightly verification, audit events with actor |
| DBA/attacker edits rows directly in the database | hash chain and running-balance check detect it (`/finance/integrity`, nightly job, alert `CmsLedgerIntegrityFailed`) |
| Single person approves their own spend | separation of duties (creator cannot approve), dual approval above a threshold |
| Retry/double-click double-posts money | Idempotency-Key, unique journal idempotency index, job dedupe keys |
| Brute-forced login | per (IP, e-mail) limiter backed by Redis; bcrypt cost 12; constant-time miss path |
| Stolen app credentials | app role cannot alter the schema, read `sequelize_meta`, or delete posted history |
| Leaked secret in git | secrets only via env/Secret/ExternalSecret; `.env` is git-ignored; compose refuses to start without them |
| Noisy/abusive client | global and login rate limits, request size limit, per-statement timeout on the role |
| Container breakout | non-root, read-only rootfs, all capabilities dropped, seccomp, default-deny NetworkPolicies |

Residual risks, stated plainly: a superuser on the database host can rewrite both the data and the
hashes together (mitigation: ship the chain head to an external store on a schedule, not yet done);
Redis loss degrades rate limiting to per-pod; replica lag makes reports up to a few seconds stale.
