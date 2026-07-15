import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerDashboardRoutes } from './src/dashboard.js';
import { startScheduler } from './src/scheduler.js';

const app = express();
const port = process.env.PORT || 80;

console.log('[startup] booting...', { port, node: process.version, cwd: process.cwd() });

// Keep the raw body so WhatsApp webhook signatures (X-Hub-Signature-256) can
// be verified against the exact bytes Meta signed.
app.use(express.json({
  limit: '30mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'capta-content-engine' });
});

// La raiz depende del dominio: postia.ar muestra la landing publica;
// app.postia.ar (y el dominio viejo) van directo a la app.
let landingCache = null;
async function landingHtml() {
  if (!landingCache) {
    const body = await readFile(resolve('landing/index.html'), 'utf8');
    landingCache =
      '<!doctype html>\n<html lang="es">\n' +
      '<meta name="description" content="Postia piensa las ideas, disena las imagenes, genera los videos y publica en tu Instagram. Vos solo aprobas desde WhatsApp.">\n' +
      body;
  }
  return landingCache;
}

app.get('/', async (req, res) => {
  const host = String(req.headers['x-forwarded-host'] || req.hostname || '').toLowerCase();
  if (host === 'postia.ar' || host === 'www.postia.ar') {
    try {
      const html = await landingHtml();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(html);
    } catch (error) {
      console.warn('[landing] no se pudo servir:', error.message);
    }
  }
  res.redirect('/dashboard');
});

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

registerDashboardRoutes(app);
console.log('[startup] routes registered, starting listen...');

app.listen(port, () => {
  console.log(`Capta Content Engine listening on port ${port}`);
  startScheduler();
});
