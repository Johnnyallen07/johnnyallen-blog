# syntax=docker/dockerfile:1
# 使用国内镜像加速：构建时设 DOCKER_BUILDKIT=1 并配置 Docker daemon registry-mirrors
FROM node:20-alpine AS base
RUN npm install -g pnpm

# 国内构建加速：使用 npmmirror
ENV PNPM_HOME="/pnpm" PATH="/pnpm:${PATH}"
ENV npm_config_registry=https://registry.npmmirror.com

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/music/package.json apps/music/package.json
COPY packages/ packages/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* 变量在 Next.js 构建时内联到客户端代码中，必须在 build 阶段提供
ARG NEXT_PUBLIC_API_URL=https://api.johnnyallen.blog
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# 恢复 workspace 链接并构建（使用缓存加速）
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile && pnpm --filter web build

# Runtime stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# monorepo standalone：server.js 在 apps/web/ 下，static 和 public 也须在对应位置
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
