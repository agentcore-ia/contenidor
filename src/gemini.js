import { AppError } from './errors.js';

// Proveedor de video via Gemini API (Google): Gemini Omni Flash / Veo. Usa el
// mecanismo estandar de "operacion de larga duracion": se crea el job con
// :predictLongRunning, se consulta la operacion hasta done, y se descarga el
// video (la URI requiere la API key). El modelo es configurable.
//
// Env:
//   GEMINI_API_KEY       (obligatoria) key de Google AI Studio
//   GEMINI_VIDEO_MODEL   default 'gemini-omni-flash-preview'
//   GEMINI_BASE_URL      default https://generativelanguage.googleapis.com/v1beta
//   GEMINI_ASPECT_RATIO  default '9:16' (vertical, para redes)

function baseUrl() { return (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''); }
function apiKey() { return process.env.GEMINI_API_KEY || ''; }
function videoModel() { return process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-flash-preview'; }
function aspectRatio() { return process.env.GEMINI_ASPECT_RATIO || '9:16'; }

export function geminiConfigured() {
  return Boolean(apiKey());
}

function assertConfigured() {
  if (!geminiConfigured()) {
    throw new AppError('Gemini no esta configurado (falta GEMINI_API_KEY).', 503, 'GEMINI_NOT_CONFIGURED');
  }
}

function keyHeaders(extra = {}) {
  return { 'x-goog-api-key': apiKey(), ...extra };
}

// Arranca la generacion. imageBytes (Buffer) opcional -> image-to-video.
export async function submitVideo({ prompt, imageBytes, imageMime }) {
  assertConfigured();
  const instance = { prompt: String(prompt || '') };
  if (imageBytes) {
    instance.image = { bytesBase64Encoded: imageBytes.toString('base64'), mimeType: imageMime || 'image/png' };
  }
  const body = { instances: [instance], parameters: { aspectRatio: aspectRatio() } };

  const res = await fetch(`${baseUrl()}/models/${videoModel()}:predictLongRunning`, {
    method: 'POST',
    headers: keyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.name) {
    const msg = json.error?.message || JSON.stringify(json).slice(0, 200) || res.status;
    throw new AppError(`Gemini ${res.status}: ${msg}`, 502, 'GEMINI_FAILED');
  }
  return { jobId: json.name, raw: json }; // name = "models/.../operations/..." o "operations/..."
}

// Busca la URI del video en las formas conocidas de la respuesta.
function extractVideoUri(json) {
  const r = json.response || {};
  return (
    r.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    r.generateVideoResponse?.generatedVideos?.[0]?.video?.uri ||
    r.generatedVideos?.[0]?.video?.uri ||
    r.generatedSamples?.[0]?.video?.uri ||
    r.video?.uri ||
    null
  );
}

export async function getVideoStatus(operationName) {
  assertConfigured();
  const res = await fetch(`${baseUrl()}/${operationName}`, { headers: keyHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`Gemini ${res.status}: ${json.error?.message || 'status error'}`, 502, 'GEMINI_FAILED');
  }
  const done = Boolean(json.done);
  const failed = Boolean(json.error);
  const uri = done ? extractVideoUri(json) : null;
  return { done, failed, uri, error: json.error?.message || null, raw: json };
}

// Descarga los bytes del video (la URI de Gemini requiere autenticacion).
export async function downloadVideo(uri) {
  assertConfigured();
  const url = /[?&]key=/.test(uri) ? uri : `${uri}${uri.includes('?') ? '&' : '?'}alt=media`;
  const res = await fetch(url, { headers: keyHeaders() });
  if (!res.ok) {
    throw new AppError(`No se pudo descargar el video de Gemini: ${res.status}`, 502, 'GEMINI_DOWNLOAD_FAILED');
  }
  return Buffer.from(await res.arrayBuffer());
}
