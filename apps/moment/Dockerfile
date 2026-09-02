# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV PNPM_HOME="/pnpm" PATH="/pnpm:${PATH}" npm_config_registry=https://registry.npmmirror.com

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/music/package.json apps/music/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/moment/package.json apps/moment/package.json
COPY packages/ packages/
COPY apps/api/prisma/ apps/api/prisma/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile && pnpm --filter moment build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/moment/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/moment/.next/static ./apps/moment/.next/static
USER nextjs
EXPOSE 3004
CMD ["node", "apps/moment/server.js"]
