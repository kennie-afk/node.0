FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
RUN npm install -g typescript
COPY src ./src
COPY config ./config
RUN npm run build
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/config ./config
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/package*.json ./
USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "serve"]
