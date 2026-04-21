# ============================================
# 阶段1: 构建
# ============================================
FROM node:22-alpine AS build-env

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# 安装构建 native 模块所需的工具链（better-sqlite3）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖描述文件，利用 Docker 缓存
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile && yarn cache clean

# 复制源代码并构建
COPY . .
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN yarn build

# ============================================
# 阶段2: 仅安装生产依赖（native 模块）
# ============================================
FROM node:22-alpine AS prod-deps

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# ============================================
# 阶段3: 运行时
# ============================================
FROM node:22-alpine

ARG VERSION=unknown

LABEL maintainer="findsource@proton.me" \
      version="${VERSION}" \
      description="wechat-article-exporter Docker Image" \
      org.opencontainers.image.source="https://github.com/nichenke/wechat-article-exporter" \
      org.opencontainers.image.description="微信公众号文章批量下载工具" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# 复制构建产物
COPY --from=build-env /app/.output ./

# 复制生产依赖（包含 better-sqlite3 等 native 模块）
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./

# 复制数据库 schema（运行时 initDatabase 读取）
COPY --from=build-env /app/server/database/schema.sql ./server/database/schema.sql

# 创建数据目录并设置权限（node 用户可写）
RUN mkdir -p data && chown -R node:node /app

USER node

EXPOSE 3000

# 默认值 —— 所有数据统一在 /app/data/ 下
# 实际配置通过 docker-compose.yml / .env 覆盖
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=./data/wechat.db \
    NITRO_KV_DRIVER=fs \
    NITRO_KV_BASE=./data/kv \
    LOG_DIR=./data/logs

ENTRYPOINT ["node", "server/index.mjs"]
