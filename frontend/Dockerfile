# Multi-stage build for the rosneft frontend (Next.js 16 + React 19).
# Layout:
#   deps    — yarn install with cache mount (lockfile is the only invalidation)
#   build   — yarn build, requires deps + the source tree
#   runtime — slim image with only the standalone output + static assets
#
# Final image is ~200 MB (Alpine base + node + .next/standalone bundle).
# Without output: "standalone" in next.config.ts the runtime would have
# to ship the full node_modules, ~700 MB.

FROM node:22-alpine AS deps
WORKDIR /app

# Yarn classic (the project uses 1.22). Alpine ships node + yarn together
# in node:22-alpine — no extra install step needed.
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_API_URL is read by next.config.ts at build time AND baked
# into the client bundle. Default to the in-network gateway address so a
# default `docker compose up` works end-to-end. Override via --build-arg
# for other deployments.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# GATEWAY_URL is the compose-internal hostname. Next.js 16 standalone
# bakes the rewrite destination into the routes-manifest at build time,
# so this MUST be set during `next build` — runtime env is too late.
ARG GATEWAY_URL=http://gateway:8080
ENV GATEWAY_URL=${GATEWAY_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user — Next's standalone server doesn't need root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output is a self-contained server.js + minimal node_modules
# under .next/standalone. Static chunks live separately under .next/static
# and need to be copied alongside, plus the public/ tree for fonts / wasm
# (Draco + KTX2 transcoder).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
