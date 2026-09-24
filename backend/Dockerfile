# syntax=docker/dockerfile:1

# Production image for the Linkora API and click consumer. The same image
# runs both: the default command starts the API; override it with
# `node src/consumers/clickConsumer.js` for a separate consumer.

# ---- dependencies: production packages only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

# The official image's unprivileged user.
USER node

EXPOSE 5001

# Liveness only: no MongoDB or Redis calls, so a slow dependency can't turn
# into a restart loop (see /health/readiness for dependency checks).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5001) + '/health/liveness').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# server.js handles SIGTERM itself (graceful drain), so node can be PID 1.
CMD ["node", "src/server.js"]
