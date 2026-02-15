# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache openssl && npm install -g pnpm
ENV PNPM_HOME="/pnpm" PATH="/pnpm:${PATH}"
ENV npm_config_registry=https://registry.npmmirror.com

# ---- 依赖安装（与 Web Dockerfile 共享 pnpm-store 缓存 id） ----
FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ packages/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# ---- 构建 + 导出干净依赖 ----
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile && \
  pnpm --filter api build && \
  cd apps/api && npx prisma generate && \
  cd /app && pnpm --filter api deploy --prod /deploy

# ---- 运行时：零安装，纯复制 ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# 从 pnpm deploy 获取干净的生产依赖（已解析 workspace 符号链接，无需再 npm install）
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./package.json
# 编译产物和 Prisma schema
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
# 复制 builder 阶段已生成的 Prisma Client（同为 alpine，二进制兼容）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
CMD ["node", "dist/src/main"]
