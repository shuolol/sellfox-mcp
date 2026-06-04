FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

EXPOSE 8099

ENV NODE_ENV=production
ENV SELLFOX_MCP_HOST=0.0.0.0
ENV SELLFOX_MCP_PORT=8099

# 通过 --env-file .env 或 -e 注入 PostgreSQL 连接信息
# 具体配置项见 .env.example

CMD ["node", "dist/http-server.js"]
