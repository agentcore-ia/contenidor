FROM node:20-slim

ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_TIME_ZONE=America/Argentina/Buenos_Aires

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src

EXPOSE 3000

CMD ["node", "server.js"]
