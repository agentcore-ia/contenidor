import {
  countFuturePendingCalendar,
  createGeneratedPost,
  getBrandById,
  getBrandReferenceImages,
  getCalendarContent,
  getDefaultBrand,
  getExistingCalendarTopics,
  getGeneratedPost,
  getLatestCalendarDate,
  getPendingContentForToday,
  insertCalendarIdeas,
  listApprovedDuePosts,
  listAutomationBrands,
  listBrandProducts,
  listBrandsWithInstagram,
  listCategories,
  markCalendarGenerated,
  markCalendarPosted,
  markPostPublished,
  markPostPublishError,
  markPostWaNotified,
  setGeneratedPostStatus,
  setPostRenderError,
  updateBrandFields,
  updateGeneratedPostImageUrl,
  uploadPostImage
} from './supabase.js';
import { fetchRemoteImageBytes, generateContentIdeas, generateImageArtDirection, generatePostContent, generatePostImageAsset } from './openai.js';
import { publishToInstagram, refreshLongLivedToken } from './instagram.js';
import { sendApprovalRequest, sendText, whatsappConfigured } from './whatsapp.js';
import { renderPostImage } from './render.js';
import { AI_TEMPLATE_ID } from './templates/index.js';
import { addDays, todayDateString } from './dates.js';
import { AppError } from './errors.js';

function chooseTemplateId(content) {
  return (
    content.category?.default_template_id ||
    content.brand?.default_template_id ||
    AI_TEMPLATE_ID
  );
}

export async function getTodayContent(brandId = null) {
  return getPendingContentForToday(undefined, brandId);
}

export async function generatePostForCalendar(calendarId) {
  const content = await getCalendarContent(calendarId);
  const products = await listBrandProducts(content.brand.id).catch(() => []);
  const generation = await generatePostContent({
    brand: content.brand,
    category: content.category,
    calendar: content.calendar,
    products
  });

  return createGeneratedPost({
    content,
    generation,
    templateId: chooseTemplateId(content)
  });
}

async function renderAiPostImage(post, opts = {}) {
  const brand = await getBrandById(post.brand_id);
  const referenceRows = await getBrandReferenceImages(brand.id);

  // A single bad reference (e.g. a link to an Instagram post page instead of
  // its photo file) must not block the whole post's image generation — skip
  // it with a warning instead of failing the batch.
  const referenceResults = await Promise.allSettled(
    referenceRows.map((row) => fetchRemoteImageBytes(row.image_url))
  );

  const referenceBuffers = [];
  referenceResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      referenceBuffers.push(result.value);
    } else {
      console.warn(
        `[renderAiPostImage] skipping invalid brand reference image "${referenceRows[index]?.title}" (${referenceRows[index]?.image_url}): ${result.reason?.message}`
      );
    }
  });

  // Official brand logo, integrated physically into the scene when uploaded.
  let logoBuffer = null;
  if (brand.logo_url) {
    try {
      logoBuffer = await fetchRemoteImageBytes(brand.logo_url);
    } catch (error) {
      console.warn(`[renderAiPostImage] skipping brand logo (${brand.logo_url}): ${error.message}`);
    }
  }

  // Art-direct this specific piece (typography/colour/layout) before generating.
  const artDirection = await generateImageArtDirection({ post, brand });

  const asset = await generatePostImageAsset(post, { brand, referenceBuffers, artDirection, logoBuffer, quality: opts.imageQuality });
  return asset.buffer;
}

export async function renderAndStorePost(post, opts = {}) {
  const imageBuffer = post.template_id === AI_TEMPLATE_ID
    ? await renderAiPostImage(post, opts)
    : await renderPostImage(post);

  const imageUrl = await uploadPostImage(post.id, imageBuffer);

  return updateGeneratedPostImageUrl(post.id, imageUrl);
}

// Si el post es de tipo video, arranca la generacion del video (producto o UGC)
// una vez que la imagen ya esta lista. Evita duplicar si ya tiene un video.
async function maybeGenerateVideoForPost(post, opts = {}) {
  const kind = post.content_type === 'ugc_video' ? 'ugc' : (post.content_type === 'product_video' ? 'product' : null);
  if (!kind) return;
  try {
    const { videoConfigured, startPostVideo } = await import('./videoEngine.js');
    if (!videoConfigured() || !post.image_url) return;
    const { listPostVideos } = await import('./supabase.js');
    const existing = await listPostVideos(post.id);
    if (existing.some((v) => v.kind === kind && v.status !== 'error')) return;
    await startPostVideo(post, kind, opts.videoEngine || null);
    console.log(`[render:bg] video ${kind} auto-iniciado para post ${post.id}`);
  } catch (error) {
    console.warn(`[render:bg] no se pudo auto-generar el video de ${post.id}: ${error.message}`);
  }
}

// Renders a post's image without blocking the HTTP response. GPT Image 2 can
// take longer than the reverse proxy's request timeout, so callers return
// immediately and the image lands (or an error is recorded) a bit later.
export function renderPostInBackground(post, opts = {}) {
  Promise.resolve()
    .then(() => setPostRenderError(post.id, null))
    .then(() => renderAndStorePost(post, opts))
    .then(async (rendered) => {
      console.log(`[render:bg] post ${post.id} rendered -> ${rendered.image_url}`);
      await notifyPostForReview(rendered);
      await maybeGenerateVideoForPost(rendered, opts);
    })
    .catch(async (error) => {
      console.error(`[render:bg:error] post ${post.id}:`, error);
      await setPostRenderError(post.id, error.message);
    });
}

function approvalBodyText(post, brand) {
  const parts = [];
  if (brand?.name) parts.push(`📣 ${brand.name}`);
  if (post.hook) parts.push(post.hook);
  const caption = post.caption_instagram || post.body || '';
  if (caption) parts.push(caption);
  return parts.join('\n\n');
}

const VIDEO_CONTENT_TYPES = new Set(['product_video', 'ugc_video']);
function isVideoPost(post) { return VIDEO_CONTENT_TYPES.has(post?.content_type); }

// Sends the WhatsApp approval message for a post, if the brand has a WhatsApp
// number and WhatsApp is configured. Fire-and-forget: a failure here never
// breaks rendering.
//   opts.videoUrl  send the video (via the video template) instead of the image
//   opts.force     send now even if it's a video post (fallback if video failed)
export async function notifyPostForReview(post, opts = {}) {
  try {
    if (!whatsappConfigured()) return;
    if (!post?.image_url || post.wa_notified_at) return;
    const brand = await getBrandById(post.brand_id);
    if (!brand.whatsapp_number) return;

    // Para posts de video mandamos el VIDEO, no la imagen: si el video todavia
    // no llego (y se va a generar), esperamos — el aviso saldra cuando este listo.
    if (!opts.force && !opts.videoUrl && isVideoPost(post)) {
      const { videoConfigured } = await import('./videoEngine.js');
      if (videoConfigured()) return;
    }

    await sendApprovalRequest({
      to: brand.whatsapp_number,
      imageUrl: post.image_url,
      videoUrl: opts.videoUrl || null,
      bodyText: approvalBodyText(post, brand),
      postId: post.id
    });
    await markPostWaNotified(post.id);
    console.log(`[whatsapp] approval sent for post ${post.id} (${opts.videoUrl ? 'video' : 'image'}) -> ${brand.whatsapp_number}`);
  } catch (error) {
    console.warn(`[whatsapp] could not notify post ${post?.id}: ${error.message}`);
  }
}

// Llamado desde videoEngine cuando un video queda listo: manda la aprobacion
// por WhatsApp con el video incluido.
export async function notifyPostVideoReady(postId, videoUrl) {
  try {
    const post = await getGeneratedPost(postId);
    await notifyPostForReview(post, { videoUrl });
  } catch (error) {
    console.warn(`[whatsapp] video-ready notify failed for ${postId}: ${error.message}`);
  }
}

// Llamado desde videoEngine cuando la generacion de video falla: como el post de
// video habia esperado al video, mandamos la imagen para que igual se pueda
// aprobar/rechazar por WhatsApp.
export async function notifyPostVideoFailed(postId) {
  try {
    const post = await getGeneratedPost(postId);
    await notifyPostForReview(post, { force: true });
  } catch (error) {
    console.warn(`[whatsapp] video-failed notify failed for ${postId}: ${error.message}`);
  }
}

// Explicit (re)send of the approval message for one post — surfaces errors so
// the caller (a manual "probar WhatsApp" action) can show them.
export async function sendApprovalForPost(postId) {
  if (!whatsappConfigured()) {
    throw new AppError('WhatsApp no esta configurado en el servidor (faltan variables WHATSAPP_*).', 400, 'WA_NOT_CONFIGURED');
  }
  const post = await getGeneratedPost(postId);
  if (!post.image_url) throw new AppError('El post todavia no tiene imagen.', 400, 'WA_NO_IMAGE');
  const brand = await getBrandById(post.brand_id);
  if (!brand.whatsapp_number) throw new AppError('Esta marca no tiene numero de WhatsApp configurado.', 400, 'WA_NO_NUMBER');
  // Si el post ya tiene un video listo, lo mandamos (si no, va la imagen).
  let videoUrl = null;
  try {
    const { listPostVideos } = await import('./supabase.js');
    const ready = (await listPostVideos(postId)).find((v) => v.status === 'ready' && v.video_url);
    if (ready) videoUrl = ready.video_url;
  } catch { /* si no se puede listar, seguimos con la imagen */ }
  await sendApprovalRequest({
    to: brand.whatsapp_number,
    imageUrl: post.image_url,
    videoUrl,
    bodyText: approvalBodyText(post, brand),
    postId: post.id
  });
  await markPostWaNotified(post.id);
  return { sent: true, to: brand.whatsapp_number };
}

// Applies an Aprobar/Rechazar button tap coming from WhatsApp: updates the post
// status and replies with a confirmation. Publishing (for approvals) still
// follows the normal schedule via the daily autopilot.
export async function applyWhatsappDecision({ action, postId, from }) {
  let post;
  try {
    post = await getGeneratedPost(postId);
  } catch {
    if (from) await sendText(from, 'No encontramos ese post (quiza fue eliminado).');
    return { ok: false, reason: 'post_not_found' };
  }

  if (post.status === 'posted') {
    if (from) await sendText(from, 'Ese post ya fue publicado, no se puede cambiar.');
    return { ok: false, reason: 'already_posted' };
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  await setGeneratedPostStatus(postId, status);

  if (from) {
    await sendText(
      from,
      action === 'approve'
        ? '✅ Aprobado. Se publicara en su fecha programada.'
        : '❌ Rechazado. No se va a publicar.'
    );
  }
  return { ok: true, status };
}

export async function generateAndRenderPost(calendarId, opts = {}) {
  const post = await generatePostForCalendar(calendarId);

  await markCalendarGenerated(calendarId, post.id);
  renderPostInBackground(post, opts);

  return post;
}

// Uses OpenAI to propose fresh calendar ideas and appends them to the queue,
// starting the day after the last scheduled item so publish_date never collides.
export async function generateCalendarIdeas({ brandId = null, count = 7 } = {}) {
  const safeCount = Math.max(1, Math.min(Number(count) || 7, 30));

  const brand = brandId ? await getBrandById(brandId) : await getDefaultBrand();
  const categories = await listCategories(brand.id);

  if (!categories.length) {
    throw new AppError('No hay categorias configuradas para generar ideas', 400, 'NO_CATEGORIES');
  }

  const existingTopics = await getExistingCalendarTopics(brand.id);
  const products = await listBrandProducts(brand.id).catch(() => []);
  const generation = await generateContentIdeas({
    brand,
    categories,
    existingTopics,
    count: safeCount,
    products
  });

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const today = todayDateString();
  const latestDate = await getLatestCalendarDate(brand.id);
  let cursor = latestDate && latestDate >= today ? addDays(latestDate, 1) : today;

  const seenTopics = new Set(existingTopics.map((topic) => topic.toLowerCase()));
  const rows = [];

  for (const idea of generation.ideas) {
    const topicKey = idea.topic.toLowerCase();
    if (seenTopics.has(topicKey)) continue;
    seenTopics.add(topicKey);

    const category = categoryBySlug.get(idea.category_slug);
    if (!category) continue;

    rows.push({
      brand_id: brand.id,
      category_id: category.id,
      publish_date: cursor,
      topic: idea.topic,
      angle: idea.angle || null,
      content_type: idea.content_type || 'image',
      status: 'pending'
    });

    cursor = addDays(cursor, 1);
  }

  const inserted = await insertCalendarIdeas(rows);

  return {
    model: generation.model,
    requested: safeCount,
    inserted: inserted.length,
    items: inserted
  };
}

// Keeps the calendar queue filled to `target` future pending items.
export async function ensureIdeaQueue({ brandId = null, target = 7 } = {}) {
  const brand = brandId ? await getBrandById(brandId) : await getDefaultBrand();
  const pending = await countFuturePendingCalendar(brand.id);
  const missing = target - pending;

  if (missing <= 0) {
    return { pending, inserted: 0, items: [] };
  }

  const result = await generateCalendarIdeas({ brandId: brand.id, count: missing });
  return { pending, ...result };
}

// Publishes one approved post to the brand's connected Instagram account,
// updating both the post and its calendar item on success.
export async function publishPost(post, brand) {
  const mediaId = await publishToInstagram({
    brand,
    imageUrl: post.image_url,
    caption: post.caption_instagram || ''
  });
  await markCalendarPosted(post.calendar?.id || post.calendar_id);
  const updated = await markPostPublished(post.id, mediaId);
  return { ...updated, ig_media_id: mediaId };
}

// Publishes every approved, due, not-yet-posted post for a connected brand.
export async function publishDuePosts(brand) {
  if (!brand?.ig_access_token) {
    return { skipped: true, reason: 'Instagram not connected' };
  }

  const due = await listApprovedDuePosts(brand.id);
  const published = [];
  const failed = [];

  for (const post of due) {
    try {
      const result = await publishPost(post, brand);
      published.push({ id: post.id, ig_media_id: result.ig_media_id });
    } catch (error) {
      await markPostPublishError(post.id, error.message);
      failed.push({ id: post.id, message: error.message, code: error.code });
    }
  }

  return { due: due.length, published, failed };
}

// Refreshes long-lived Instagram tokens that are within `withinDays` of
// expiring. Long-lived tokens last 60 days and can be refreshed once they're
// at least 24h old.
export async function refreshInstagramTokens({ withinDays = 10 } = {}) {
  const brands = await listBrandsWithInstagram();
  const threshold = Date.now() + withinDays * 24 * 3600 * 1000;
  const refreshed = [];

  for (const brand of brands) {
    const expiresAt = brand.ig_token_expires_at ? new Date(brand.ig_token_expires_at).getTime() : 0;
    if (expiresAt && expiresAt > threshold) continue;
    try {
      const { token, expiresInSeconds } = await refreshLongLivedToken(brand.ig_access_token);
      await updateBrandFields(brand.id, {
        ig_access_token: token,
        ig_token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      });
      refreshed.push(brand.slug);
    } catch (error) {
      console.warn(`[refreshInstagramTokens] ${brand.slug}: ${error.message}`);
    }
  }

  return { checked: brands.length, refreshed };
}

// Full daily autopilot step for one brand: top up the idea queue, generate +
// render today's pending post, then publish any approved due posts.
export async function runDailyAutomation({ brandId = null, queueTarget = 7, autoRender = true, autoPublish = true } = {}) {
  const startedAt = new Date().toISOString();
  const summary = { brand_id: brandId, started_at: startedAt, queue: null, post: null, publish: null, errors: [] };

  try {
    summary.queue = await ensureIdeaQueue({ brandId, target: queueTarget });
  } catch (error) {
    summary.errors.push({ step: 'ensure_queue', message: error.message, code: error.code });
  }

  if (autoRender) {
    try {
      const content = await getTodayContent(brandId);
      const rendered = await generateAndRenderPost(content.calendar.id);
      summary.post = {
        id: rendered.id,
        calendar_id: content.calendar.id,
        image_url: rendered.image_url,
        status: rendered.status
      };
    } catch (error) {
      if (error.code === 'TODAY_CONTENT_NOT_FOUND') {
        summary.post = { skipped: true, reason: 'No pending content for today' };
      } else {
        summary.errors.push({ step: 'render_today', message: error.message, code: error.code });
      }
    }
  }

  if (autoPublish && brandId) {
    try {
      const brand = await getBrandById(brandId);
      if (brand.ig_access_token && brand.auto_publish !== false) {
        summary.publish = await publishDuePosts(brand);
      } else {
        summary.publish = { skipped: true, reason: brand.ig_access_token ? 'auto_publish off' : 'Instagram not connected' };
      }
    } catch (error) {
      summary.errors.push({ step: 'publish_due', message: error.message, code: error.code });
    }
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

// SaaS autopilot: run the daily automation for every brand that has it on.
export async function runAllDailyAutomation({ queueTarget = 7, autoRender = true, autoPublish = true } = {}) {
  const tokens = autoPublish ? await refreshInstagramTokens().catch((error) => ({ error: error.message })) : null;
  const brands = await listAutomationBrands();
  const runs = [];

  for (const brand of brands) {
    try {
      const summary = await runDailyAutomation({ brandId: brand.id, queueTarget, autoRender, autoPublish });
      runs.push({ brand: brand.slug, ...summary });
    } catch (error) {
      runs.push({ brand: brand.slug, error: error.message });
    }
  }

  return { brands: brands.length, tokens, runs };
}
