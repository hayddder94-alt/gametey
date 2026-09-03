# ---------- بناء وأساس تشغيل إنتاجي ----------
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app
# مستخدم غير جذر
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.js ./
COPY src ./src
COPY views ./views
COPY public ./public
COPY assets ./assets
RUN mkdir -p data && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
