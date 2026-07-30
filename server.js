import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerDashboardRoutes } from './src/dashboard.js';
import { startScheduler } from './src/scheduler.js';
import { trackLandingEvent } from './src/tracking.js';

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
  res.json({ ok: true, service: 'postia' });
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

// Paginas legales (las pide la verificacion de app de Meta). Son documentos
// HTML completos y se sirven en cualquier host.
const legalCache = new Map();
function legalPage(file) {
  return async (_req, res) => {
    try {
      if (!legalCache.has(file)) legalCache.set(file, await readFile(resolve('landing', file), 'utf8'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(legalCache.get(file));
    } catch (error) {
      console.warn(`[legal] no se pudo servir ${file}:`, error.message);
      res.status(404).send('No encontrado');
    }
  };
}
app.get('/privacidad', legalPage('privacidad.html'));
app.get('/eliminacion-datos', legalPage('eliminacion-datos.html'));
app.get('/terminos', legalPage('terminos.html'));

// Piezas de muestra de la landing (imagenes y videos generados con Postia).
// express.static resuelve tipos MIME y peticiones por rango (necesarias para
// que los <video> se puedan reproducir y buscar).
app.use('/img', express.static(resolve('landing/img'), {
  maxAge: '7d',
  index: false,
  dotfiles: 'ignore'
}));

// Imagen de preview al compartir el link (WhatsApp, X, LinkedIn).
let ogCache = null;
app.get('/og.png', async (_req, res) => {
  try {
    if (!ogCache) ogCache = await readFile(resolve('landing/og.png'));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(ogCache);
  } catch (error) {
    console.warn('[og] no se pudo servir:', error.message);
    res.sendStatus(404);
  }
});

// --- Demo publica de la landing (sin cuenta) --------------------------------
// Cada llamada cuesta tokens, asi que se limita por IP y por dia. Va fuera de
// /api a proposito: ese prefijo exige sesion.
const demoHits = new Map();
let demoDay = new Date().toISOString().slice(0, 10);
let demoDayCount = 0;
const DEMO_PER_IP = Number(process.env.DEMO_LIMIT_PER_IP || 5);
const DEMO_PER_DAY = Number(process.env.DEMO_LIMIT_PER_DAY || 300);

function demoRateLimit(req) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== demoDay) { demoDay = today; demoDayCount = 0; demoHits.clear(); }
  if (demoDayCount >= DEMO_PER_DAY) return 'La demo alcanzo su limite de hoy. Crea tu cuenta para seguir generando.';

  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const entry = demoHits.get(ip) || { count: 0, since: Date.now() };
  if (Date.now() - entry.since > 3600_000) { entry.count = 0; entry.since = Date.now(); }
  if (entry.count >= DEMO_PER_IP) return 'Probaste la demo varias veces. Crea tu cuenta gratis para generar sin limite.';

  entry.count += 1;
  demoHits.set(ip, entry);
  demoDayCount += 1;
  return null;
}

// Beacon de la landing. Publico y a proposito fuera de /api (ese prefijo exige
// sesion). Siempre responde 204: no le devuelve nada al navegador.
app.post('/t', (req, res) => {
  res.sendStatus(204);
  try {
    trackLandingEvent(req, { kind: req.body?.kind });
  } catch (error) {
    console.warn('[tracking]', error.message);
  }
});

app.post('/demo/ideas', async (req, res) => {
  try {
    const limited = demoRateLimit(req);
    if (limited) return res.status(429).json({ success: false, error: limited });

    const { generateDemoIdeas } = await import('./src/openai.js');
    const result = await generateDemoIdeas(req.body?.business);
    trackLandingEvent(req, { kind: 'demo', path: '/demo/ideas' });
    res.json({ success: true, ...result });
  } catch (error) {
    console.warn('[demo:ideas]', error.message);
    res.status(error.statusCode && error.statusCode < 500 ? error.statusCode : 400).json({
      success: false,
      error: error.message || 'No pudimos generar las ideas'
    });
  }
});

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
  console.log(`Postia listening on port ${port}`);
  startScheduler();
});
