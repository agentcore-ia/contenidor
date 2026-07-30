// Limitador de tasa en memoria, por proceso.
//
// No usa Redis a proposito: Postia corre en un solo contenedor y una dependencia
// mas es una cosa mas que se puede caer. La contra es que los contadores se
// reinician en cada deploy y no se comparten si algun dia hay varias replicas —
// aceptable para frenar abuso, NO suficiente como control de seguridad unico.

const buckets = new Map();

// Limpieza perezosa: cada tanto se barren las ventanas vencidas para que el Map
// no crezca sin techo con IPs que pasaron una vez.
let lastSweep = Date.now();
function sweep(now) {
  if (now - lastSweep < 600_000) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

// La IP del cliente, de una fuente que el cliente NO controla.
//
// El primer valor de x-forwarded-for lo puede escribir el atacante en su
// request (el proxy AGREGA al final, no reemplaza): usarlo permitia esquivar
// cualquier limite por IP mandando un header inventado. El ULTIMO valor lo
// puso nuestro proxy y es el unico confiable. cf-connecting-ip (si algun dia
// la app queda detras de Cloudflare) tiene la misma garantia.
export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).trim();
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return String(req.ip || 'desconocida');
}

// Devuelve { allowed, retryAfterSeconds }. `key` identifica el cubo (accion + ip
// o + email); `limit` es cuantas veces se permite dentro de `windowMs`.
export function hit(key, { limit, windowMs }) {
  const now = Date.now();
  sweep(now);

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true };
}

// Middleware de Express. `by` arma la clave: por defecto la IP.
//
// Responde 429 con JSON (nunca HTML: el proxy de Easypanel reemplaza los 5xx
// por su propia pagina y el front se come un "Unexpected token '<'").
export function rateLimit({ name, limit, windowMs, by = clientIp, message }) {
  return (req, res, next) => {
    const result = hit(`${name}:${by(req)}`, { limit, windowMs });
    if (result.allowed) return next();

    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      success: false,
      error: message || 'Demasiados intentos. Espera un momento y proba de nuevo.',
      code: 'RATE_LIMITED',
      retry_after_seconds: result.retryAfterSeconds
    });
  };
}

// El email va normalizado y en minuscula para que no se esquive el limite
// cambiando el casing o metiendo espacios.
export function byIpAndEmail(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${clientIp(req)}|${email}`;
}

// --- Limite persistente de altas por IP ---------------------------------------
// El limite en memoria de arriba frena la rafaga; este frena al paciente: las
// altas quedan en la base (hasheadas) y se cuentan por ventana de 30 dias, asi
// sobreviven a los deploys. No es "una cuenta por IP": detras de un CGNAT o de
// una oficina hay muchas personas legitimas compartiendo la misma salida.

import { createHash } from 'node:crypto';
import { supabase } from './supabase.js';

const SIGNUPS_PER_IP_30D = () => Number(process.env.SIGNUP_PER_IP_30D || 3);

function signupIpHash(req) {
  const salt = process.env.TRACKING_SALT || 'sin-sal';
  return createHash('sha256').update(`signup|${clientIp(req)}|${salt}`).digest('hex').slice(0, 32);
}

export async function assertSignupAllowed(req) {
  const limit = SIGNUPS_PER_IP_30D();
  if (!limit) return; // 0 = desactivado

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count, error } = await supabase
    .from('signup_events')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', signupIpHash(req))
    .gte('created_at', since);

  if (error) {
    // Si la tabla no responde no se bloquea el registro: preferimos un alta
    // de mas antes que una landing que no convierte por un error nuestro.
    console.warn(`[signup] no se pudo chequear el limite por IP: ${error.message}`);
    return;
  }

  if ((count || 0) >= limit) {
    const err = new Error('Ya se crearon varias cuentas desde esta conexion este mes. Escribinos si necesitas mas.');
    err.statusCode = 429;
    err.code = 'SIGNUP_IP_LIMIT';
    throw err;
  }
}

// Se registra DESPUES de crear la cuenta, y sin bloquear la respuesta.
export function recordSignup(req, email) {
  supabase.from('signup_events')
    .insert({ ip_hash: signupIpHash(req), email: String(email || '').slice(0, 200) })
    .then(({ error }) => { if (error) console.warn(`[signup] no se pudo registrar el alta: ${error.message}`); });
}
