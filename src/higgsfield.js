import { AppError } from './errors.js';

// Higgsfield Cloud API — genera videos cortos (5-15s) de forma asincrona:
// se crea un job, se consulta su estado hasta que el video queda listo.
// Docs: cloud.higgsfield.ai. Todo el contrato es configurable por env para
// absorber diferencias de version sin tocar codigo.
//
// Env:
//   HIGGSFIELD_API_KEY      (obligatoria) Bearer token de Higgsfield Cloud
//   HIGGSFIELD_BASE_URL     default https://api.higgsfield.ai/v1
//   HIGGSFIELD_VIDEO_MODEL  modelo image-to-video (default 'default-video-model')
//   HIGGSFIELD_UGC_TASK     task para UGC (default 'text-to-video')
//   HIGGSFIELD_DURATION     duracion en segundos (default 5)

function baseUrl() { return (process.env.HIGGSFIELD_BASE_URL || 'https://api.higgsfield.ai/v1').replace(/\/+$/, ''); }
function apiKey() { return process.env.HIGGSFIELD_API_KEY || ''; }
function videoModel() { return process.env.HIGGSFIELD_VIDEO_MODEL || 'default-video-model'; }
function ugcTask() { return process.env.HIGGSFIELD_UGC_TASK || 'text-to-video'; }
function defaultDuration() { return Number(process.env.HIGGSFIELD_DURATION) || 5; }

export function higgsfieldConfigured() {
  return Boolean(apiKey());
}

function assertConfigured() {
  if (!higgsfieldConfigured()) {
    throw new AppError('Higgsfield no esta configurado (falta HIGGSFIELD_API_KEY).', 503, 'HF_NOT_CONFIGURED');
  }
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${apiKey()}`, ...extra };
}

async function hfRequest(method, path, body) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || json.message || json.detail || JSON.stringify(json).slice(0, 200) || res.status;
    throw new AppError(`Higgsfield ${res.status}: ${msg}`, 502, 'HF_FAILED');
  }
  return json;
}

// Different API versions name the job id differently — accept the common ones.
function extractJobId(json) {
  const id = json.id || json.generation_id || json.request_id || json.job_id || json.data?.id;
  if (!id) {
    throw new AppError('Higgsfield no devolvio un id de job', 502, 'HF_NO_JOB_ID');
  }
  return String(id);
}

// Crea un job de video de producto animando la imagen del creativo.
export async function submitImageToVideo({ imageUrl, prompt, duration }) {
  assertConfigured();
  if (!imageUrl) throw new AppError('Falta la imagen para animar', 400, 'HF_NO_IMAGE');
  const json = await hfRequest('POST', '/generations', {
    task: 'image-to-video',
    model: videoModel(),
    input_image: imageUrl,
    prompt: prompt || undefined,
    duration: Number(duration) || defaultDuration()
  });
  return { jobId: extractJobId(json), raw: json };
}

// Crea un job de video UGC a partir de un guion (avatar/persona hablando).
export async function submitUgcVideo({ script, imageUrl, duration }) {
  assertConfigured();
  if (!script) throw new AppError('Falta el guion para el video UGC', 400, 'HF_NO_SCRIPT');
  const payload = {
    task: ugcTask(),
    model: videoModel(),
    prompt: script,
    duration: Number(duration) || defaultDuration()
  };
  if (imageUrl) payload.input_image = imageUrl;
  const json = await hfRequest('POST', '/generations', payload);
  return { jobId: extractJobId(json), raw: json };
}

const READY_STATES = new Set(['completed', 'succeeded', 'success', 'done', 'finished', 'ready']);
const FAILED_STATES = new Set(['failed', 'error', 'errored', 'canceled', 'cancelled', 'rejected']);

// Busca la URL del video en las distintas formas que puede devolver la API.
function extractVideoUrl(json) {
  return (
    json.output_url ||
    json.video_url ||
    json.result?.url ||
    json.result?.video_url ||
    json.output?.url ||
    json.output?.video_url ||
    (Array.isArray(json.output) ? json.output.find((o) => typeof o === 'string' || o?.url)?.url || json.output.find((o) => typeof o === 'string') : null) ||
    (Array.isArray(json.assets) ? json.assets[0]?.url : null) ||
    null
  );
}

export async function getJobStatus(jobId) {
  assertConfigured();
  const json = await hfRequest('GET', `/generations/${encodeURIComponent(jobId)}`);
  const status = String(json.status || json.state || '').toLowerCase();
  const url = extractVideoUrl(json);
  const done = READY_STATES.has(status) || Boolean(url);
  const failed = FAILED_STATES.has(status);
  return { status: status || (url ? 'completed' : 'processing'), url, done, failed, raw: json };
}
