FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Base dependencies
FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ packages/
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Ensure node artifacts are in PATH
ENV PATH="/app/node_modules/.bin:${PATH}"

RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /prod/api

# Runtime stage
FROM base AS runner
WORKDIR /app
COPY --from=builder /prod/api/node_modules ./node_modules
COPY --from=builder /prod/api/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001
CMD ["node", "dist/src/main"]
