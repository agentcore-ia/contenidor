FROM mcr.microsoft.com/playwright:v1.53.0-jammy

ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_TIME_ZONE=America/Argentina/Buenos_Aires

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
COPY src ./src

EXPOSE 3000

CMD ["./entrypoint.sh"]
