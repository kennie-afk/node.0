ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Empty means "same origin, under /api": nginx forwards /api to the API (see nginx.conf), so one
# image works in every environment. Set it only to point at an API on another origin.
ARG VITE_API_URL=
ARG VITE_DEMO_LOGINS=false
ENV VITE_DEMO_LOGINS=$VITE_DEMO_LOGINS
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The unprivileged nginx runs as uid 101 on :8080 and needs no writable paths beyond /tmp,
# so the container runs with a read-only root filesystem.
FROM ${NGINX_IMAGE} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/30-api-upstream.sh /docker-entrypoint.d/30-api-upstream.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
