# ===== builder: devDeps + tsc 컴파일 =====
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ===== runtime: 프로덕션 의존성 + dist만 =====
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# 비루트 실행 (베스트 프랙티스)
USER node
# Cloud Run이 PORT(기본 8080)를 주입한다
EXPOSE 8080
CMD ["node", "dist/index.js"]
