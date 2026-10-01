# Church CMS

Members, giving, double-entry finance, payables, payroll and operations for a church, with
per-church isolation (row-level security) and role-based access.

## Run it (Docker)

```bash
cd cmsbackend
export POSTGRES_PASSWORD=...  APP_DB_PASSWORD=...  JWT_SECRET=...   # JWT_SECRET: 32+ characters
docker compose up -d --build            # console on http://localhost:8080
docker compose up -d --scale api=3 --scale worker=2   # scale out; nothing else to change
```

Demo data and the role picker on the sign-in page:

```bash
DEMO_LOGINS=true docker compose up -d --build web
node tools/seed-demo.mjs                # one account per role, a year of gifts, bills, payroll
```

Demo password is `DemoPass-12345` (override with `DEMO_PASSWORD`). The picker only fills in a seeded
account; the API still checks the password. Never set `DEMO_LOGINS=true` in production.

## Roles

`ADMIN`, `TREASURER`, `APPROVER`, `AUDITOR`, `PASTOR`, `SECRETARY`, `MEMBER`. One matrix in
`cmsbackend/src/auth/permissions.ts` decides who may do what; routes ask for a permission, never a
role, and the console hides what a role cannot use.

## Tests

```bash
cd cmsbackend && npm test        # API, sqlite by default; TEST_DATABASE_URL runs it on Postgres
cd cms_frontend && npm test
```

More: `cmsbackend/docs/` (architecture, capacity, runbook), `cmsbackend/deploy/` (Kubernetes, alerts).
