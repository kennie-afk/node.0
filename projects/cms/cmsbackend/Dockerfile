FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
# sqlite3 is test-only and has no musl prebuild; compiling TypeScript needs no native addons.
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --chown=appuser:appgroup package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && chown -R appuser:appgroup node_modules
# Migrations are load-bearing: the compose `migrate` service runs them from this image.
COPY --chown=appuser:appgroup config ./config
COPY --chown=appuser:appgroup migrations ./migrations
COPY --chown=appuser:appgroup .sequelizerc ./
USER appuser
ENV NODE_ENV=production PORT=4400
EXPOSE 4400
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:4400/healthz || exit 1
CMD ["npm", "start"]
