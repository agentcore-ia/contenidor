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
function omniModel() { return process.env.GEMINI_OMNI_MODEL || 'gemini-omni-flash-preview'; }
function veoModel() { return process.env.GEMINI_VEO_MODEL || 'veo-3.1-generate-preview'; }

// Mapea el motor elegido en la UI ('omni' | 'veo') al id de modelo real.
export function modelForEngine(engine) {
  if (engine === 'veo') return veoModel();
  if (engine === 'omni') return omniModel();
  return videoModel();
}

// Omni usa la Interactions API (sincrona); Veo usa predictLongRunning (async).
export function isOmniModel(model) { return /omni/i.test(model || videoModel()); }

// Diagnostico: lista los modelos de la cuenta y sus metodos soportados.
export async function listModels() {
  assertConfigured();
  const res = await fetch(`${baseUrl()}/models?pageSize=1000`, { headers: keyHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`Gemini ${res.status}: ${json.error?.message || 'list models error'}`, 502, 'GEMINI_FAILED');
  }
  return (json.models || []).map((m) => ({
    name: m.name,
    methods: m.supportedGenerationMethods || m.supportedActions || []
  }));
}
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
export async function submitVideo({ prompt, imageBytes, imageMime, model }) {
  assertConfigured();
  const instance = { prompt: String(prompt || '') };
  if (imageBytes) {
    instance.image = { bytesBase64Encoded: imageBytes.toString('base64'), mimeType: imageMime || 'image/png' };
  }
  const body = { instances: [instance], parameters: { aspectRatio: aspectRatio() } };

  const res = await fetch(`${baseUrl()}/models/${model || videoModel()}:predictLongRunning`, {
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

// --- Omni (Interactions API, sincrona) --------------------------------------

function extractOmniVideoBase64(json) {
  if (json.output_video?.data) return json.output_video.data;
  for (const step of json.steps || []) {
    for (const c of step.content || []) {
      if ((c.type === 'video' || /video/i.test(c.mime_type || c.mimeType || '')) && c.data) return c.data;
    }
  }
  for (const cand of json.candidates || []) {
    for (const p of cand.content?.parts || []) {
      if (p.inlineData?.data && /video/i.test(p.inlineData.mimeType || '')) return p.inlineData.data;
      if (p.inline_data?.data && /video/i.test(p.inline_data.mime_type || '')) return p.inline_data.data;
    }
  }
  return null;
}

function extractOmniVideoUri(json) {
  if (json.output_video?.uri) return json.output_video.uri;
  for (const step of json.steps || []) {
    for (const c of step.content || []) {
      if (c.uri && /video/i.test(c.type || c.mime_type || c.mimeType || '')) return c.uri;
    }
  }
  return json.candidates?.[0]?.content?.parts?.find((p) => p.fileData?.fileUri)?.fileData?.fileUri || null;
}

// Genera el video de una sola pasada (bloquea ~1 min). Devuelve el Buffer.
export async function generateOmniVideo({ prompt, imageBytes, imageMime, model }) {
  assertConfigured();
  const input = imageBytes
    ? [
        { type: 'image', data: imageBytes.toString('base64'), mime_type: imageMime || 'image/png' },
        { type: 'text', text: String(prompt || '') }
      ]
    : String(prompt || '');
  const body = {
    model: model || videoModel(),
    input,
    response_format: { type: 'video', delivery: process.env.GEMINI_OMNI_DELIVERY || 'inline', aspect_ratio: aspectRatio() }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  let res;
  try {
    res = await fetch(`${baseUrl()}/interactions`, {
      method: 'POST',
      headers: keyHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(`Gemini Omni ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 200)}`, 502, 'GEMINI_FAILED');
  }
  const status = String(json.status || '').toLowerCase();
  if (status && status !== 'completed' && status !== 'succeeded') {
    throw new AppError(`Gemini Omni estado: ${status}`, 502, 'GEMINI_FAILED');
  }

  const b64 = extractOmniVideoBase64(json);
  if (b64) return Buffer.from(b64, 'base64');
  const uri = extractOmniVideoUri(json);
  if (uri) return downloadVideo(uri);
  throw new AppError('Omni no devolvio el video en la respuesta', 502, 'GEMINI_NO_VIDEO');
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
