# One image, three roles: api (default), worker, migrate. The command chooses which.
#   api:     node -r module-alias/register dist/server.js
#   worker:  node -r module-alias/register dist/worker.js
#   migrate: node scripts/migrate-locked.js
# Pin by digest in CI for reproducible builds: node:22-alpine@sha256:<digest> (see docs/RUNBOOK.md).
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
# sqlite3 is test-only and has no musl prebuild; compiling TypeScript needs no native addons.
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package*.json ./
# bcrypt ships a musl prebuild; fall back to compiling only if it is missing.
RUN apk add --no-cache --virtual .build python3 make g++ \
 && npm ci --omit=dev \
 && npm cache clean --force \
 && apk del .build

FROM ${NODE_IMAGE} AS production
RUN apk add --no-cache tini \
 && addgroup --system --gid 10001 app && adduser --system --uid 10001 --ingroup app app
WORKDIR /app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package*.json .sequelizerc ./
# Migrations are load-bearing: the migrate role runs them from this image. migrations-lib holds
# the row-level-security helpers every migration requires.
COPY --chown=app:app config ./config
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app migrations-lib ./migrations-lib
COPY --chown=app:app scripts ./scripts
USER 10001:10001
ENV NODE_ENV=production PORT=4400 METRICS_PORT=9100
EXPOSE 4400 9100
# Nothing is written to the filesystem at runtime, so the root filesystem can be mounted read-only.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:4400/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "-r", "module-alias/register", "dist/server.js"]
