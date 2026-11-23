# 1) Compila o front-end (React + Vite)
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2) Servidor Node que entrega a API, o chat (Socket.IO) e o front compilado
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web /app/web/dist /app/web/dist
EXPOSE 3001
CMD ["node", "src/index.js"]
