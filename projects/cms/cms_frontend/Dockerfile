ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# VITE_API_URL is baked in at build time; the edge profile sets it to the edge URL + /api.
ARG VITE_API_URL=http://localhost:4400
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The unprivileged nginx runs as uid 101 on :8080 and needs no writable paths beyond /tmp,
# so the container runs with a read-only root filesystem.
FROM ${NGINX_IMAGE} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1
