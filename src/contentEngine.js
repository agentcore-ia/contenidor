import {
  countFuturePendingCalendar,
  createGeneratedPost,
  getBrandById,
  getBrandReferenceImages,
  getCalendarContent,
  getDefaultBrand,
  getExistingCalendarTopics,
  getLatestCalendarDate,
  getPendingContentForToday,
  insertCalendarIdeas,
  listApprovedDuePosts,
  listAutomationBrands,
  listBrandsWithInstagram,
  listCategories,
  markCalendarGenerated,
  markCalendarPosted,
  markPostPublished,
  markPostPublishError,
  setPostRenderError,
  updateBrandFields,
  updateGeneratedPostImageUrl,
  uploadPostImage
} from './supabase.js';
import { fetchRemoteImageBytes, generateContentIdeas, generateImageArtDirection, generatePostContent, generatePostImageAsset } from './openai.js';
import { instagramConfigured, publishToInstagram, refreshLongLivedToken } from './instagram.js';
import { renderPostImage } from './render.js';
import { AI_TEMPLATE_ID } from './templates/index.js';
import { addDays, todayDateString } from './dates.js';
import { AppError } from './errors.js';

function chooseTemplateId(content) {
  return (
    content.category?.default_template_id ||
    content.brand?.default_template_id ||
    'pain_point_01'
  );
}

export async function getTodayContent(brandId = null) {
  return getPendingContentForToday(undefined, brandId);
}

export async function generatePostForCalendar(calendarId) {
  const content = await getCalendarContent(calendarId);
  const generation = await generatePostContent({
    brand: content.brand,
    category: content.category,
    calendar: content.calendar
  });

  return createGeneratedPost({
    content,
    generation,
    templateId: chooseTemplateId(content)
  });
}

async function renderAiPostImage(post) {
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

  // Art-direct this specific piece (typography/colour/layout) before generating.
  const artDirection = await generateImageArtDirection({ post, brand });

  const asset = await generatePostImageAsset(post, { brand, referenceBuffers, artDirection });
  return asset.buffer;
}

export async function renderAndStorePost(post) {
  const imageBuffer = post.template_id === AI_TEMPLATE_ID
    ? await renderAiPostImage(post)
    : await renderPostImage(post);

  const imageUrl = await uploadPostImage(post.id, imageBuffer);

  return updateGeneratedPostImageUrl(post.id, imageUrl);
}

// Renders a post's image without blocking the HTTP response. GPT Image 2 can
// take longer than the reverse proxy's request timeout, so callers return
// immediately and the image lands (or an error is recorded) a bit later.
export function renderPostInBackground(post) {
  Promise.resolve()
    .then(() => setPostRenderError(post.id, null))
    .then(() => renderAndStorePost(post))
    .then((rendered) => {
      console.log(`[render:bg] post ${post.id} rendered -> ${rendered.image_url}`);
    })
    .catch(async (error) => {
      console.error(`[render:bg:error] post ${post.id}:`, error);
      await setPostRenderError(post.id, error.message);
    });
}

export async function generateAndRenderPost(calendarId) {
  const post = await generatePostForCalendar(calendarId);

  await markCalendarGenerated(calendarId, post.id);
  renderPostInBackground(post);

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
  const generation = await generateContentIdeas({
    brand,
    categories,
    existingTopics,
    count: safeCount
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
  if (!instagramConfigured()) return { skipped: true, reason: 'Instagram not configured' };

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
