# syntax=docker/dockerfile:1

# Builds the SPA and serves it with nginx, which also proxies /api and
# /health to the API, so the browser sees one origin.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Empty: the SPA calls /api on its own origin, proxied by nginx below.
ENV VITE_API_URL=
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
