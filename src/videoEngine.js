import {
  createPostVideo,
  getBrandById,
  listBrandProducts,
  updatePostVideo,
  uploadPostVideoBuffer
} from './supabase.js';
import { generateUgcScript } from './openai.js';
import * as higgsfield from './higgsfield.js';
import * as gemini from './gemini.js';
import { AppError } from './errors.js';

const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

// --- Seleccion de proveedor -------------------------------------------------
// VIDEO_PROVIDER: 'gemini' (Google Omni/Veo, pago por uso) | 'higgsfield'.
function providerName() {
  return (process.env.VIDEO_PROVIDER || 'gemini').toLowerCase() === 'higgsfield' ? 'higgsfield' : 'gemini';
}

export function videoConfigured() {
  return providerName() === 'higgsfield' ? higgsfield.higgsfieldConfigured() : gemini.geminiConfigured();
}

function productMotionPrompt(post) {
  const subject = post.image_headline || post.hook || 'el producto';
  return `Cinematic subtle motion bringing the scene to life: slow push-in and gentle parallax on ${subject}. Keep it premium and appetizing, no text distortion, no new text.`;
}

function ugcScenePrompt(script) {
  return `Vertical UGC-style video: a real, relatable person talking straight to camera in a casual, authentic setting, natural lighting, handheld feel. They say, in a natural spoken tone: "${script}". Lip-synced audio, warm and genuine, not corporate.`;
}

// Envia el job al proveedor. Devuelve un resultado discriminado:
//   { mode:'poll', jobId, script }   -> hay que consultar el estado (Veo, Higgsfield)
//   { mode:'done', videoBuffer, script } -> el video ya vino (Omni, sincrono)
async function submitToProvider({ kind, post, brand, engine }) {
  let script = null;

  const buildScript = async () => {
    const products = await listBrandProducts(brand.id).catch(() => []);
    return (await generateUgcScript({ post, brand, products })).script;
  };

  if (providerName() === 'higgsfield') {
    if (kind === 'product') {
      const s = await higgsfield.submitImageToVideo({ imageUrl: post.image_url, prompt: productMotionPrompt(post) });
      return { mode: 'poll', jobId: s.jobId, script };
    }
    script = await buildScript();
    const s = await higgsfield.submitUgcVideo({ script, imageUrl: post.image_url });
    return { mode: 'poll', jobId: s.jobId, script };
  }

  // Gemini: el motor ('omni' | 'veo') define el modelo y el mecanismo.
  const model = gemini.modelForEngine(engine);
  const { fetchRemoteImageBytes } = await import('./openai.js');
  const prompt = kind === 'product' ? productMotionPrompt(post) : ugcScenePrompt((script = await buildScript()));
  const imageBytes = kind === 'product' ? await fetchRemoteImageBytes(post.image_url).catch(() => null) : null;

  if (gemini.isOmniModel(model)) {
    const videoBuffer = await gemini.generateOmniVideo({ prompt, imageBytes, imageMime: 'image/png', model });
    return { mode: 'done', videoBuffer, script };
  }
  const s = await gemini.submitVideo({ prompt, imageBytes, imageMime: 'image/png', model });
  return { mode: 'poll', jobId: s.jobId, script };
}

// Consulta el estado y, cuando esta listo, deja la URL publica del video.
// Gemini entrega una URI autenticada -> se descarga y se re-hostea en storage.
async function resolveJob(video) {
  if (providerName() === 'higgsfield') {
    const st = await higgsfield.getJobStatus(video.job_id);
    if (st.done && st.url) return { done: true, videoUrl: st.url };
    if (st.failed) return { failed: true, error: `Higgsfield: ${st.status}` };
    return {};
  }
  const st = await gemini.getVideoStatus(video.job_id);
  if (st.failed) return { failed: true, error: st.error || 'Gemini error' };
  if (st.done && st.uri) {
    const bytes = await gemini.downloadVideo(st.uri);
    const url = await uploadPostVideoBuffer(video.id, bytes);
    return { done: true, videoUrl: url };
  }
  if (st.done && !st.uri) return { failed: true, error: 'Gemini no devolvio la URI del video' };
  return {};
}

function pollVideoInBackground(video) {
  const startedAt = Date.now();
  const tick = async () => {
    try {
      const r = await resolveJob(video);
      if (r.done) {
        await updatePostVideo(video.id, { status: 'ready', video_url: r.videoUrl, error: null });
        console.log(`[video:bg] ${video.id} listo -> ${r.videoUrl}`);
        return;
      }
      if (r.failed) {
        await updatePostVideo(video.id, { status: 'error', error: String(r.error).slice(0, 400) });
        return;
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        await updatePostVideo(video.id, { status: 'error', error: 'Tiempo de espera agotado' });
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    } catch (error) {
      console.error(`[video:bg:error] ${video.id}:`, error.message);
      await updatePostVideo(video.id, { status: 'error', error: error.message.slice(0, 400) }).catch(() => {});
    }
  };
  setTimeout(tick, POLL_INTERVAL_MS);
}

// El submit al proveedor (subir la imagen, encolar el job) puede tardar mas que
// el timeout del proxy, asi que se hace en segundo plano: se crea la fila en
// 'processing' y se devuelve al instante; el job y el polling corren aparte, y
// cualquier error queda guardado en la fila.
function runVideoJobInBackground(row, post, brand, kind, engine) {
  Promise.resolve()
    .then(() => submitToProvider({ kind, post, brand, engine }))
    .then(async (result) => {
      if (result.mode === 'done') {
        // Omni: el video ya vino -> se sube y queda listo.
        const url = await uploadPostVideoBuffer(row.id, result.videoBuffer);
        await updatePostVideo(row.id, { status: 'ready', video_url: url, script: result.script || null, error: null });
        console.log(`[video:bg] ${row.id} listo (sincrono) -> ${url}`);
        return;
      }
      if (!result.jobId) throw new AppError('El proveedor no devolvio un job id', 502, 'VIDEO_NO_JOB');
      await updatePostVideo(row.id, { job_id: result.jobId, script: result.script || null });
      pollVideoInBackground({ ...row, job_id: result.jobId });
    })
    .catch(async (error) => {
      console.error(`[video:submit:error] ${row.id}:`, error.message);
      await updatePostVideo(row.id, { status: 'error', error: String(error.message).slice(0, 400) }).catch(() => {});
    });
}

// Punto de entrada: arranca la generacion de un video para un post.
export async function startPostVideo(post, kind = 'product', engine = null) {
  if (!videoConfigured()) {
    throw new AppError('La generacion de video no esta configurada en el servidor.', 503, 'VIDEO_NOT_CONFIGURED');
  }
  if (kind !== 'product' && kind !== 'ugc') {
    throw new AppError('Tipo de video invalido', 400, 'BAD_VIDEO_KIND');
  }
  if (!post.image_url) {
    throw new AppError('El post todavia no tiene imagen renderizada.', 400, 'VIDEO_NO_IMAGE');
  }

  const brand = await getBrandById(post.brand_id);
  const row = await createPostVideo({ postId: post.id, brandId: brand.id, kind, jobId: null, script: null, provider: providerName() });
  runVideoJobInBackground(row, post, brand, kind, engine);
  return row;
}

// Reconciliacion al abrir un post (por si el server se reinicio a mitad).
export async function refreshPostVideo(video) {
  if (!video || video.status !== 'processing' || !video.job_id || !videoConfigured()) return video;
  try {
    const r = await resolveJob(video);
    if (r.done) return updatePostVideo(video.id, { status: 'ready', video_url: r.videoUrl, error: null });
    if (r.failed) return updatePostVideo(video.id, { status: 'error', error: String(r.error).slice(0, 400) });
  } catch (error) {
    console.warn(`[video:refresh] ${video.id}: ${error.message}`);
  }
  return video;
}
