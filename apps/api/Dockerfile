# syntax=docker/dockerfile:1
# 独立构建：仅依赖 apps/api，不依赖 monorepo 根目录或 packages/。
# 构建上下文为 apps/api（docker-compose 中 context: apps/api）。
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ---- 依赖安装（全量，含 devDependencies 用于构建） ----
FROM base AS dependencies
COPY package.json ./
# --ignore-scripts: 此阶段仅有 package.json，无 prisma/schema.prisma，
# postinstall(prisma generate) 会失败。prisma generate 在 builder 阶段执行。
RUN npm install --ignore-scripts

# ---- 构建（API + Prisma） ----
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- 运行时（仅生产依赖，最小体积） ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# --ignore-scripts 跳过 postinstall（prisma generate），避免 prisma CLI 不存在报错
# Prisma Client 会从 builder 阶段复制，无需重新生成
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# 从 builder 复制 Prisma Client（运行时引擎 + 生成的客户端）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# 安全：以非 root 用户运行
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
# 确保非 root 用户对 prisma 相关目录有读写权限（migrate deploy 需要）
RUN chown -R 1001:1001 /app/node_modules/.prisma /app/node_modules/@prisma
USER nestjs

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
