// Metricas de la landing, sin servicios de terceros y sin datos personales.
//
// No se guarda la IP ni el user agent. Lo unico que persiste es un hash con
// sal que ademas incluye la fecha: alcanza para contar visitantes unicos de un
// dia y deja de servir al siguiente. No hay forma de seguir a una persona
// entre dias, ni de volver desde el hash a la IP.

import { createHash, randomBytes } from 'node:crypto';
import { supabase } from './supabase.js';

// Si no hay sal configurada se genera una por arranque: peor para las series
// historicas, mejor que una sal fija y publica.
const SALT = process.env.TRACKING_SALT || randomBytes(32).toString('hex');

const KINDS = new Set(['view', 'demo', 'signup_click']);

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

function visitorHash(req) {
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${clientIp(req)}|${req.headers['user-agent'] || ''}|${SALT}|${day}`)
    .digest('hex')
    .slice(0, 32);
}

const trim = (value, max = 300) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
};

// Registrar una visita nunca puede romper la pagina ni demorarla: se hace de
// fondo y los errores solo se loguean.
export function trackLandingEvent(req, { kind = 'view', path = null } = {}) {
  const type = KINDS.has(kind) ? kind : 'view';
  const url = (() => {
    try {
      return new URL(trim(req.body?.url) || `https://postia.ar${path || req.path}`);
    } catch {
      return null;
    }
  })();

  const row = {
    kind: type,
    path: trim(path || url?.pathname || req.path, 200),
    referrer: trim(req.body?.referrer || req.headers.referer, 300),
    utm_source: trim(url?.searchParams.get('utm_source'), 80),
    utm_medium: trim(url?.searchParams.get('utm_medium'), 80),
    utm_campaign: trim(url?.searchParams.get('utm_campaign'), 80),
    country: trim(req.headers['cf-ipcountry'], 8),
    visitor_hash: visitorHash(req)
  };

  supabase
    .from('landing_events')
    .insert(row)
    .then(({ error }) => {
      if (error) console.warn('[tracking] no se pudo registrar la visita:', error.message);
    })
    .catch((error) => console.warn('[tracking]', error.message));
}
