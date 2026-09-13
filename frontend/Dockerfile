FROM oven/bun:1.4-alpine AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json ./frontend/package.json

RUN bun install --frozen-lockfile --filter @roobro/web --linker=isolated

COPY frontend/ ./frontend/
RUN bun --filter @roobro/web build

FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000
COPY --from=builder /app/frontend/.output ./.output

USER bun
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
