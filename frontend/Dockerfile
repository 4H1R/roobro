FROM oven/bun:1.4-alpine AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json ./frontend/package.json

RUN bun install --frozen-lockfile --filter @roobro/web --linker=isolated

COPY frontend/ ./frontend/
RUN bun --filter @roobro/web build

FROM caddy:2-alpine AS runtime

COPY frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/frontend/dist /srv

EXPOSE 3000
