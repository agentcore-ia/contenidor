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
  listCategories,
  markCalendarGenerated,
  updateGeneratedPostImageUrl,
  uploadPostImage
} from './supabase.js';
import { fetchRemoteImageBytes, generateContentIdeas, generatePostContent, generatePostImageAsset } from './openai.js';
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

export async function getTodayContent() {
  return getPendingContentForToday();
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

  const asset = await generatePostImageAsset(post, { brand, referenceBuffers });
  return asset.buffer;
}

export async function renderAndStorePost(post) {
  const imageBuffer = post.template_id === AI_TEMPLATE_ID
    ? await renderAiPostImage(post)
    : await renderPostImage(post);

  const imageUrl = await uploadPostImage(post.id, imageBuffer);

  return updateGeneratedPostImageUrl(post.id, imageUrl);
}

export async function generateAndRenderPost(calendarId) {
  const post = await generatePostForCalendar(calendarId);
  const renderedPost = await renderAndStorePost(post);

  await markCalendarGenerated(calendarId, renderedPost.id);

  return renderedPost;
}

// Uses OpenAI to propose fresh calendar ideas and appends them to the queue,
// starting the day after the last scheduled item so publish_date never collides.
export async function generateCalendarIdeas({ count = 7 } = {}) {
  const safeCount = Math.max(1, Math.min(Number(count) || 7, 30));

  const brand = await getDefaultBrand();
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
export async function ensureIdeaQueue({ target = 7 } = {}) {
  const brand = await getDefaultBrand();
  const pending = await countFuturePendingCalendar(brand.id);
  const missing = target - pending;

  if (missing <= 0) {
    return { pending, inserted: 0, items: [] };
  }

  const result = await generateCalendarIdeas({ count: missing });
  return { pending, ...result };
}

// Full daily autopilot step: top up the idea queue, then generate + render
// today's pending post so it lands in `needs_review` for manual approval.
export async function runDailyAutomation({ queueTarget = 7, autoRender = true } = {}) {
  const startedAt = new Date().toISOString();
  const summary = { started_at: startedAt, queue: null, post: null, errors: [] };

  try {
    summary.queue = await ensureIdeaQueue({ target: queueTarget });
  } catch (error) {
    summary.errors.push({ step: 'ensure_queue', message: error.message, code: error.code });
  }

  if (autoRender) {
    try {
      const content = await getTodayContent();
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

  summary.finished_at = new Date().toISOString();
  return summary;
}
