// Avisos al operador cuando algo se rompe.
//
// Sin esto, una falla a las 3 AM se descubre cuando un cliente se queja. El
// panel /admin muestra los errores, pero solo si alguien entra a mirarlo.
//
// Se manda por WhatsApp al numero de OPS_WHATSAPP reusando la integracion que
// ya existe. Si no esta configurado, queda solo el log — nunca rompe nada.

import { sendText, whatsappConfigured } from './whatsapp.js';

// Una falla suele venir en rafaga (siete posts del cron que fallan seguidos por
// la misma causa). Se manda un aviso por tipo y por ventana; los demas se
// cuentan y viajan en el proximo.
const THROTTLE_MS = Number(process.env.OPS_ALERT_THROTTLE_MS || 3600_000);
const lastSent = new Map();
const suppressed = new Map();

function opsNumber() {
  return String(process.env.OPS_WHATSAPP || '').trim();
}

export function opsAlertsConfigured() {
  return Boolean(opsNumber()) && whatsappConfigured();
}

export async function alertOps(kind, message) {
  const text = String(message || '').slice(0, 500);
  console.error(`[ops:${kind}] ${text}`);

  if (!opsAlertsConfigured()) return { sent: false, reason: 'OPS_WHATSAPP o WhatsApp sin configurar' };

  const now = Date.now();
  const last = lastSent.get(kind) || 0;
  if (now - last < THROTTLE_MS) {
    suppressed.set(kind, (suppressed.get(kind) || 0) + 1);
    return { sent: false, reason: 'throttled' };
  }

  const extra = suppressed.get(kind) || 0;
  suppressed.delete(kind);
  lastSent.set(kind, now);

  const body = extra
    ? `⚠️ Postia · ${kind}\n\n${text}\n\n(+${extra} avisos iguales en la ultima hora)`
    : `⚠️ Postia · ${kind}\n\n${text}`;

  try {
    await sendText(opsNumber(), body);
    return { sent: true };
  } catch (error) {
    // Que falle el aviso no puede tumbar lo que lo disparo.
    console.warn(`[ops] no se pudo avisar por WhatsApp: ${error.message}`);
    return { sent: false, reason: error.message };
  }
}

// Resumen del cron diario. Solo avisa si hubo errores: un mensaje por dia que
// dice "todo bien" se vuelve ruido y se deja de leer.
export async function alertDailySummary(summary) {
  if (!summary?.errors?.length) return { sent: false, reason: 'sin errores' };

  const lines = summary.errors
    .slice(0, 5)
    .map((error) => `• ${error.step}: ${error.message}`)
    .join('\n');

  return alertOps(
    'automatizacion diaria',
    `La corrida de hoy termino con ${summary.errors.length} error(es):\n${lines}`
  );
}
