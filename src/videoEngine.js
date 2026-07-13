import {
  createPostVideo,
  getBrandById,
  getPostVideo,
  listBrandProducts,
  updatePostVideo
} from './supabase.js';
import { generateUgcScript } from './openai.js';
import { getJobStatus, higgsfieldConfigured, submitImageToVideo, submitUgcVideo } from './higgsfield.js';
import { AppError } from './errors.js';

const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // los videos rara vez tardan tanto

// Movimiento de camara por defecto para animar un creativo de producto.
function productMotionPrompt(post) {
  const subject = post.image_headline || post.hook || 'el producto';
  return `Cinematic subtle motion bringing the scene to life: slow push-in and gentle parallax on ${subject}. Keep it premium and appetizing, no text distortion, no new text.`;
}

// Consulta el estado del job en Higgsfield hasta que el video queda listo,
// sin bloquear la respuesta HTTP. Guarda la URL o el error en la fila.
function pollVideoInBackground(videoId, jobId) {
  const startedAt = Date.now();
  const tick = async () => {
    try {
      const status = await getJobStatus(jobId);
      if (status.done && status.url) {
        await updatePostVideo(videoId, { status: 'ready', video_url: status.url, error: null });
        console.log(`[video:bg] ${videoId} listo -> ${status.url}`);
        return;
      }
      if (status.failed) {
        await updatePostVideo(videoId, { status: 'error', error: `Higgsfield: ${status.status}` });
        return;
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        await updatePostVideo(videoId, { status: 'error', error: 'Tiempo de espera agotado' });
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    } catch (error) {
      console.error(`[video:bg:error] ${videoId}:`, error.message);
      await updatePostVideo(videoId, { status: 'error', error: error.message.slice(0, 400) }).catch(() => {});
    }
  };
  setTimeout(tick, POLL_INTERVAL_MS);
}

// Punto de entrada: arranca la generacion de un video para un post.
// kind = 'product' (anima la imagen) | 'ugc' (guion + avatar).
export async function startPostVideo(post, kind = 'product') {
  if (!higgsfieldConfigured()) {
    throw new AppError('Higgsfield no esta configurado en el servidor (falta HIGGSFIELD_API_KEY).', 503, 'HF_NOT_CONFIGURED');
  }
  if (kind !== 'product' && kind !== 'ugc') {
    throw new AppError('Tipo de video invalido', 400, 'BAD_VIDEO_KIND');
  }
  if (!post.image_url) {
    throw new AppError('El post todavia no tiene imagen renderizada.', 400, 'HF_NO_IMAGE');
  }

  const brand = await getBrandById(post.brand_id);

  let jobId;
  let script = null;

  if (kind === 'product') {
    const submitted = await submitImageToVideo({ imageUrl: post.image_url, prompt: productMotionPrompt(post) });
    jobId = submitted.jobId;
  } else {
    const products = await listBrandProducts(brand.id).catch(() => []);
    const gen = await generateUgcScript({ post, brand, products });
    script = gen.script;
    const submitted = await submitUgcVideo({ script, imageUrl: post.image_url });
    jobId = submitted.jobId;
  }

  const row = await createPostVideo({ postId: post.id, brandId: brand.id, kind, jobId, script });
  pollVideoInBackground(row.id, jobId);
  return row;
}

// Reconciliacion: al abrir un post, refresca cualquier video 'processing'
// consultando Higgsfield (util si el server se reinicio a mitad de un job).
export async function refreshPostVideo(video) {
  if (!video || video.status !== 'processing' || !video.job_id || !higgsfieldConfigured()) return video;
  try {
    const status = await getJobStatus(video.job_id);
    if (status.done && status.url) {
      return updatePostVideo(video.id, { status: 'ready', video_url: status.url, error: null });
    }
    if (status.failed) {
      return updatePostVideo(video.id, { status: 'error', error: `Higgsfield: ${status.status}` });
    }
  } catch (error) {
    console.warn(`[video:refresh] ${video.id}: ${error.message}`);
  }
  return video;
}
