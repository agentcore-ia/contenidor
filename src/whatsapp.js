import crypto from 'node:crypto';
import { AppError } from './errors.js';

// WhatsApp Cloud API (Meta) — sends each new post to the brand's approver with
// an image + copy and Aprobar / Rechazar quick-reply buttons, and receives the
// button taps back through a webhook. Docs: developers.facebook.com/docs/whatsapp
//
// Required env:
//   WHATSAPP_PHONE_NUMBER_ID    the sending number's id (WhatsApp > API setup)
//   WHATSAPP_ACCESS_TOKEN       permanent access token
//   WHATSAPP_TEMPLATE_NAME      approved template with image header + 2 quick-reply buttons
//   WHATSAPP_TEMPLATE_NAME_VIDEO (optional) approved template with a VIDEO header + the
//                               same 2 quick-reply buttons — used to send video posts
//   WHATSAPP_TEMPLATE_LANG      template language code (e.g. es_AR, default es)
//   WHATSAPP_VERIFY_TOKEN       shared secret for the webhook verification handshake
//   WHATSAPP_APP_SECRET         (optional) Meta app secret to verify webhook signatures
//   WHATSAPP_FREEFORM           (test mode) '1' to send free-form interactive
//                               messages instead of templates — no approved
//                               template needed, but only works inside the 24h
//                               window (the recipient must have messaged us first)

const GRAPH = 'https://graph.facebook.com/v21.0';

function phoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID || ''; }
function accessToken() { return process.env.WHATSAPP_ACCESS_TOKEN || ''; }
function templateName() { return process.env.WHATSAPP_TEMPLATE_NAME || ''; }
function templateNameVideo() { return process.env.WHATSAPP_TEMPLATE_NAME_VIDEO || ''; }
function templateLang() { return process.env.WHATSAPP_TEMPLATE_LANG || 'es'; }
export function verifyToken() { return process.env.WHATSAPP_VERIFY_TOKEN || ''; }
function appSecret() { return process.env.WHATSAPP_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || ''; }
function freeformMode() {
  const v = String(process.env.WHATSAPP_FREEFORM || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function whatsappConfigured() {
  // En modo de prueba (freeform) no hace falta plantilla aprobada.
  return Boolean(phoneNumberId() && accessToken() && (templateName() || freeformMode()));
}

// Digits only, no '+' — the Cloud API wants the full number with country code.
function normalizeNumber(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

async function postMessage(payload) {
  // Timeout propio: si Meta se cuelga descargando la media del link, cortamos
  // nosotros y devolvemos un error legible en vez de que el proxy responda HTML.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError('WhatsApp tardo demasiado en responder (posible imagen lenta o link inaccesible para Meta).', 504, 'WA_TIMEOUT');
    }
    throw new AppError(`No se pudo contactar a WhatsApp: ${error.message}`, 502, 'WA_NETWORK');
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`WhatsApp API ${res.status}: ${json.error?.message || 'error'}`, 502, 'WA_SEND_FAILED');
  }
  return json;
}

// Sends the approval template with a media header (image or video), body with
// the copy, and two quick-reply buttons whose payloads carry the post id +
// action. When a videoUrl is given and a video template is configured, it sends
// the video; otherwise it falls back to the image header.
export async function sendApprovalRequest({ to, imageUrl, videoUrl, bodyText, postId }) {
  if (!whatsappConfigured()) throw new AppError('WhatsApp no esta configurado', 503, 'WA_NOT_CONFIGURED');
  const recipient = normalizeNumber(to);
  if (!recipient) throw new AppError('Numero de WhatsApp invalido', 400, 'WA_BAD_NUMBER');

  // Modo de prueba: sin plantilla, mensaje interactivo (solo dentro de la
  // ventana de 24h — el destinatario tuvo que escribirnos primero).
  if (freeformMode()) {
    return sendApprovalInteractive({ recipient, imageUrl, videoUrl, bodyText, postId });
  }

  // Solo mandamos video si hay URL de video Y una plantilla con header de video
  // aprobada; si no, caemos a la imagen (que el post de video igual tiene).
  const useVideo = Boolean(videoUrl && templateNameVideo());
  if (!useVideo && !imageUrl) throw new AppError('El post no tiene imagen ni video', 400, 'WA_NO_MEDIA');

  const header = useVideo
    ? { type: 'header', parameters: [{ type: 'video', video: { link: videoUrl } }] }
    : { type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] };

  return postMessage({
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: useVideo ? templateNameVideo() : templateName(),
      language: { code: templateLang() },
      components: [
        header,
        { type: 'body', parameters: [{ type: 'text', text: (bodyText || '').slice(0, 900) || '-' }] },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `approve:${postId}` }] },
        { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `reject:${postId}` }] }
      ]
    }
  });
}

// Free-form interactive approval (test mode). Sends an image/video header, the
// copy, and two reply buttons whose ids carry the post id + action. Works only
// inside the 24h customer-service window (the recipient messaged us first), so
// it's meant for quick testing before templates are approved.
async function sendApprovalInteractive({ recipient, imageUrl, videoUrl, bodyText, postId }) {
  const useVideo = Boolean(videoUrl);
  if (!useVideo && !imageUrl) throw new AppError('El post no tiene imagen ni video', 400, 'WA_NO_MEDIA');

  return postMessage({
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: useVideo
        ? { type: 'video', video: { link: videoUrl } }
        : { type: 'image', image: { link: imageUrl } },
      body: { text: (bodyText || '').slice(0, 1000) || '-' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `approve:${postId}`, title: 'Aprobar' } },
          { type: 'reply', reply: { id: `reject:${postId}`, title: 'Rechazar' } }
        ]
      }
    }
  });
}

// Free-form text reply — allowed because the user just messaged us (button
// tap), which opens the 24h customer-service window.
export async function sendText(to, body) {
  if (!whatsappConfigured()) return null;
  const recipient = normalizeNumber(to);
  if (!recipient) return null;
  return postMessage({
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'text',
    text: { preview_url: false, body: String(body || '').slice(0, 1000) }
  });
}

// GET webhook handshake. Returns the challenge string when the token matches.
export function verifyWebhook({ mode, token, challenge }) {
  if (mode === 'subscribe' && token && token === verifyToken()) {
    return challenge;
  }
  throw new AppError('Verificacion de webhook fallida', 403, 'WA_VERIFY_FAILED');
}

// Confirms the POST body was signed by Meta with the app secret. If no app
// secret is configured we can't verify — allow it but flag it to the caller.
export function isValidSignature(signatureHeader, rawBody) {
  const secret = appSecret();
  if (!secret) return { verified: false, reason: 'no_app_secret' };
  if (!signatureHeader || !rawBody) return { verified: false, reason: 'missing' };
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { verified: ok, reason: ok ? 'ok' : 'mismatch' };
}

// Extracts button taps from a webhook payload. Returns
// [{ action:'approve'|'reject', postId, from }] for each recognized reply.
export function parseWebhookEvents(body) {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const message of change?.value?.messages || []) {
        const from = message.from;
        // Template quick-reply buttons arrive as type 'button' with a payload;
        // interactive replies arrive as 'interactive'/button_reply.
        const payload = message.type === 'button'
          ? message.button?.payload
          : (message.type === 'interactive' && message.interactive?.type === 'button_reply'
            ? message.interactive.button_reply?.id
            : null);
        if (!payload) continue;
        const [action, postId] = String(payload).split(':');
        if ((action === 'approve' || action === 'reject') && postId) {
          events.push({ action, postId, from });
        }
      }
    }
  }
  return events;
}
