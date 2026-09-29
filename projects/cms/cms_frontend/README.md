# Church CMS console

React 19 + TypeScript + Vite single-page console for the church CMS API in `../cmsbackend`.
Served in production by nginx (port 8080) from the image built by `Dockerfile`.

## Run the whole stack

From `../cmsbackend`:

```
cp .env.example .env          # then set POSTGRES_PASSWORD and a 32+ character JWT_SECRET
docker compose up -d --build
```

Compose starts Postgres and Redis, runs the migrations once (`migrate` service), starts the API
on host port 4400, then the console on `WEB_PORT` (default 8080). If 5432, 4400 or 8080 are
taken, set `POSTGRES_HOST_PORT`, `API_HOST_PORT` or `WEB_PORT`; keep `PUBLIC_API_URL` and
`CORS_ORIGINS` in step with them, because the API URL is baked into the console at build time.

A new church registers itself with `POST /churches` (church plus first administrator), then
signs in with that administrator's e-mail and password.

## Develop

```
npm ci
VITE_API_URL=http://localhost:4400 npm run dev
npm run build      # type-checks, then bundles
npm run lint
```

## Look and feel

Dark theme, 12px root, 6px corner radius everywhere, no shadows for depth, and hover changes
colour only: nothing moves or lifts on hover or press. Type sizes follow the house scale
(10.5, 11.5, 12, 13, 14.5, 16.5, 19px).
