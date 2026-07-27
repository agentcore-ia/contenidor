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

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || 'desconocida').split(',')[0].trim();
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
