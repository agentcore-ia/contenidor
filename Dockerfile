FROM mcr.microsoft.com/playwright:v1.61.1-noble

ENV NODE_ENV=production \
    PORT=80 \
    CONTENT_TIME_ZONE=America/Argentina/Buenos_Aires

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src

EXPOSE 80

USER root
CMD ["node", "server.js"]
