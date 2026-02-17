# syntax=docker/dockerfile:1
# 独立构建：仅依赖 apps/api，不依赖 monorepo 根目录或 packages/。
# 构建上下文为 apps/api（docker-compose 中 context: apps/api）。
# 镜像内仅用 package.json + npm install，避免服务器 npm 与 lockfileVersion 3 不兼容导致 npm ci/npm install 报错。
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ---- 依赖安装（仅 package.json，保证本地与服务器一致通过） ----
FROM base AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install

# ---- 构建（API + Prisma） ----
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- 运行时（仅生产依赖） ----
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
# 从 builder 复制构建时生成的 Prisma Client，避免运行时 "@prisma/client did not initialize" 错误
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
