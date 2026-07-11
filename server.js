import 'dotenv/config';
import express from 'express';
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

app.get('/', (_req, res) => {
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
