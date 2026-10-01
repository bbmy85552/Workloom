# syntax=docker/dockerfile:1.6

# ---- 构建前端 ----
FROM node:20-bookworm-slim AS web-build
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN ./node_modules/.bin/vite build

# ---- 构建后端 ----
FROM node:20-bookworm-slim AS api-build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund
COPY server/prisma ./prisma
RUN ./node_modules/.bin/prisma generate
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
RUN ./node_modules/.bin/tsc -p tsconfig.json
RUN npm prune --omit=dev

# ---- 运行时 ----
FROM node:20-bookworm-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

# 把后端 + 前端打包合并到一个镜像
COPY --from=api-build /workspace/server/node_modules ./node_modules
COPY --from=api-build /workspace/server/dist ./dist
COPY --from=api-build /workspace/server/prisma ./prisma
COPY --from=api-build /workspace/server/package.json ./package.json
COPY --from=web-build /workspace/dist ./public

RUN mkdir -p /app/data /app/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e 'const port=process.env.PORT||4000; fetch("http://127.0.0.1:"+port+"/api/health").then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'

# 启动前自动应用迁移并启动
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
