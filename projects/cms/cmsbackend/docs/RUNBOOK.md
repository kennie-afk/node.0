# Runbook

## Deploy (compose)

```
cp .env.example .env            # then set POSTGRES_PASSWORD, APP_DB_PASSWORD, JWT_SECRET
docker compose up -d --build    # postgres -> migrate (owner) -> pgbouncer -> api, worker, web
docker compose up -d --scale api=3 --scale worker=2
docker compose --profile edge --profile observability up -d   # optional: nginx edge, Prometheus, Grafana
```

## Deploy (Kubernetes)

```
kubectl kustomize deploy/k8s/overlays/production | kubectl apply -f -
```
Prerequisites: ingress-nginx, cert-manager, CloudNativePG operator, External Secrets, (KEDA,
kube-prometheus-stack optional). Order of events on a release: migrate Job (advisory-locked) ->
api/worker init containers wait until `cms_migration_count()` equals the number of migration files ->
rolling update with `maxUnavailable: 0`. Jobs are immutable: for a new image delete the old Job first
(`kubectl -n cms delete job cms-migrate --ignore-not-found`), or use the ArgoCD PreSync hook already on it.
Pin images by digest in the pipeline: `kustomize edit set image cms-api=registry/cms-api@sha256:...`.

## Migrations

Always through `node scripts/migrate-locked.js` (owner credentials, direct connection to Postgres, not
PgBouncer). It holds an advisory lock, so concurrent runs queue. Roll back one step:
`node scripts/migrate-locked.js db:migrate:undo`. Migrations that add tenant tables must use
`migrations-lib/tenant.js` (RLS, composite FK anchors).

## Secrets

Three secrets: `JWT_SECRET`, owner password, app-role password. Rotate the JWT secret by deploying the
new value (all sessions end; tokens live 60 min). Rotate the app-role password: `ALTER ROLE cms_app PASSWORD '...'` on the primary as owner (the migration
only sets it the first time it runs), update the secret manager, then roll PgBouncer, api, worker.
Never use the owner credentials in api/worker: the API refuses to boot in production on a role that
bypasses RLS (override `ALLOW_PRIVILEGED_DB_ROLE=true` exists for emergencies only).

## Backup and restore (CloudNativePG)

Continuous WAL archiving plus a daily base backup to the S3 bucket configured in `cnpg-cluster.yaml`;
retention 30 days. **Restore drill (do this quarterly):** create a new `Cluster` with
`bootstrap.recovery` pointing at the backup store and a `recoveryTarget.targetTime`, point a throwaway
api at it, run `GET /finance/integrity` for a church: `ok: true` proves the restored books are intact
and the chain is unbroken. Compose/dev: `docker compose exec postgres pg_dump -U cms cms > cms.sql`.

## When the ledger verification fails

Symptom: alert `CmsLedgerIntegrityFailed`, an `integrity.FAILED` audit event, or `ok:false` from
`GET /finance/integrity`. The `issues` array says what differs.
1. Do **not** "fix" rows. Snapshot the database first.
2. `running balance differs` only: the roll-up drifted but the journal is fine. Rebuild it
   (`rebuildBalances` in `ledger.service.ts`, run from a script as that church) and re-verify. Find out why it drifted (a manual SQL edit?).
3. `entry N has been altered`, `does not link`, or `numbering gap`: the journal itself was modified or
   rows were removed out of band. Restore to a point before the first bad entry into a side cluster,
   diff against production, and treat it as a security incident (check DB audit logs for who held
   owner credentials).
4. Audit-chain failure with a clean ledger: same procedure for `audit_events`.

## Scaling levers (in the order to pull them)

1. `kubectl scale`/HPA on api (stateless). 2. Worker replicas or KEDA on queue depth. 3. Point report
endpoints at replicas (`DATABASE_REPLICA_URLS`; routes using `preferReplica`). 4. PgBouncer pool size
vs Postgres `max_connections`. 5. Vertical Postgres. 6. Beyond that, shard by church (see CAPACITY.md).
Watch: p95 latency, `cms_db_pool_connections{state="waiting"}`, `cms_jobs_oldest_queued_age_seconds`.
