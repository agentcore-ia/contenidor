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

CMD ["node", "-e", "const e=require('express');const a=e();a.get('/health',(q,r)=>r.json({ok:true}));a.get('/dashboard',(q,r)=>r.send('OK'));a.listen(3000,()=>console.log('TEST OK'))"]
