# Capacity

## What was measured, and how much to trust it

Stack: `docker compose` (Postgres 16 -> PgBouncer transaction pooling -> **3 API replicas**, 2 workers,
Redis, nginx edge), k6 (`tools/loadtest/cms.k6.js`) on the same machine. Machine: **4 cores, 11 GiB,
shared**. During every run below the host **load average was 12-23** because unrelated builds and test
suites were running at the same time, so these are **pessimistic, contended numbers** and not a
benchmark of the software on its own hardware. Treat them as a floor. Re-run on a quiet machine
(`docker run --rm --network host -v "$PWD/tools/loadtest":/t -e BASE=http://127.0.0.1:8088/api -e RUNID=ci -e CHURCHES=4 -e POST_VUS=20 -e READ_VUS=0 grafana/k6 run /t/cms.k6.js`)
before using any figure for sizing. Rate limiting was raised (`RATE_LIMIT_MAX`) for the test only.

Measured 2026-09-30, 30 s per run, every write through `POST /finance/journal` with an
Idempotency-Key (full path: auth, tenant transaction, validation, period check, hash-chain append,
running-balance upsert, idempotency record, COMMIT):

| Scenario | Throughput | Latency | Errors |
|---|---|---|---|
| Post entries, **1 church**, 20 concurrent clients | 14.8 entries/s | avg 1.25 s, median 711 ms, p95 3.82 s, p99 6.49 s | 0 |
| Post entries, **4 churches**, 20 concurrent clients | 19.2 entries/s | avg 835 ms, median 738 ms, p95 1.55 s, p99 2.19 s | 0 real* |
| Reads (trial balance / journal page / funds), 4 churches, 20 clients | 115 req/s | avg 162 ms, p95 351 ms, p99 554 ms | 0 real* |
| Mixed (earlier run): 20 posting + 20 reading clients | 10 entries/s + ~55 reads/s | posts p95 3.2 s; reads p95 705 ms | 0 |

\* k6 counts the expected 409/429 from onboarding in `setup()` as failed requests (0.1%); the API logs
show no 5xx.

What the numbers do and do not say: the 4-church run is faster and has a much tighter tail than the
1-church run with the same 20 clients, which is the per-church chain lock showing up (below). The API
containers were near idle in `docker stats` while Postgres and the host were contended, so absolute
throughput here is bounded by the shared machine, not by the Node processes. No claim about
entries/second on dedicated hardware is made.

## Capacity model

**Where the serialisation is.** Posting takes one row lock per church (`finance_chain`,
`SELECT ... FOR UPDATE`). That serialises **one church's** postings and nothing else: entry numbers stay
gapless and the hash chain stays linear. Two churches never wait for each other. A church posts roughly
`1 / (time a posting holds the lock)` entries per second at most; the lock is held for the ~10 statements
between the lock and COMMIT, i.e. low tens of milliseconds on a quiet database. A real congregation
posts tens to hundreds of entries per *day*, three to five orders of magnitude below that ceiling. A
"month-end bulk import" should be batched into few, larger entries (up to 500 lines each) rather than
thousands of two-line entries.

**What scales horizontally, with no change:** API replicas (stateless; JWT; limits in Redis), workers
(`SKIP LOCKED`), PgBouncer replicas, the web tier, reads via replicas (`DATABASE_REPLICA_URLS`).

**What does not, and the thresholds for acting:**

| Limit | Symptom | Lever |
|---|---|---|
| One Postgres primary's write throughput | sustained CPU/IO on the primary; `cms_db_pool_connections{state="waiting"}` > 0 with PgBouncer pool already right-sized | vertical scale; move reports to replicas; then shard |
| `max_connections` | PgBouncer queueing | PgBouncer `default_pool_size` ~ 2-4x cores of the primary, not more |
| Tenant count (~10^5 churches on one cluster) | vacuum/bloat, catalog size, `journal_lines` partition size | raise partitions (16 now; hash-partitioned by church so this is a re-partition, not a redesign), then **shard by church**: churches are fully independent (every key is `(church_id, ...)`, no cross-church queries exist), so a church-to-cluster routing table at the edge, or Citus distributing on `church_id`, is a mechanical change |
| Verify-ledger nightly job | job runtime grows with a church's history | already per-church and batched (300 entries); split by fiscal year if one church exceeds ~10^7 entries |

Rule of thumb from the structure (not measured): a single well-provisioned primary should carry
thousands of small churches' daily activity many times over; the first thing to fail at scale is
report latency on large ledgers, which the `ledger_balances` roll-up (reads a few hundred rows per
period, asserted equal to the journal in tests) is there to prevent.

## Replica lag semantics

Report endpoints opt in to replicas (`preferReplica` -> read-only transaction on the read pool). They
therefore read data up to the replication lag old (typically under a second; unbounded if a replica
stalls). Writes and every read inside a write path always use the primary, so read-your-writes holds
for the flows that need it (create then fetch). If a screen must show a just-posted entry immediately
(journal list after posting), it must not use the replica; the journal list does not.

## Background work

Queue claim is `FOR UPDATE SKIP LOCKED`; tested with 3 workers draining 60 jobs with no job run twice
(`tests/jobs-queue.test.ts`, Postgres). Delivery is at-least-once. Backlog is exported as
`cms_jobs_queue_depth` / `cms_jobs_oldest_queued_age_seconds`; the KEDA example scales workers on it.
