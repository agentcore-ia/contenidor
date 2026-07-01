FROM mcr.microsoft.com/playwright:v1.53.0-jammy

ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_TIME_ZONE=America/Argentina/Buenos_Aires

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
