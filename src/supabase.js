import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { AppError, assertRequiredEnv } from './errors.js';
import { todayDateString } from './dates.js';

assertRequiredEnv('SUPABASE_URL');
assertRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function wrapSupabaseError(message, error, statusCode = 500) {
  return new AppError(`${message}: ${error.message}`, statusCode, 'SUPABASE_ERROR');
}

function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCalendarContent(row) {
  return {
    calendar: {
      id: row.id,
      brand_id: row.brand_id,
      category_id: row.category_id,
      publish_date: row.publish_date,
      topic: row.topic,
      angle: row.angle,
      content_type: row.content_type,
      status: row.status
    },
    brand: normalizeRelation(row.brand),
    category: normalizeRelation(row.category)
  };
}

function calendarSelect() {
  return `
    id,
    brand_id,
    category_id,
    publish_date,
    topic,
    angle,
    content_type,
    status,
    brand:brands (*),
    category:content_categories (*)
  `;
}

export async function getGeneratedPost(postId) {
  const { data, error } = await supabase
    .from('generated_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error) {
    const notFound = error.code === 'PGRST116';
    throw new AppError(
      notFound ? `Post ${postId} was not found` : error.message,
      notFound ? 404 : 500,
      notFound ? 'POST_NOT_FOUND' : 'SUPABASE_ERROR'
    );
  }

  return data;
}

export async function getPendingContentForToday(date = todayDateString(), brandId = null) {
  let query = supabase
    .from('content_calendar')
    .select(calendarSelect())
    .eq('publish_date', date)
    .eq('status', 'pending');

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load today content', error);
  }

  if (!data) {
    throw new AppError(`No pending content found for ${date}`, 404, 'TODAY_CONTENT_NOT_FOUND');
  }

  return normalizeCalendarContent(data);
}

export async function getCalendarContent(calendarId) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select(calendarSelect())
    .eq('id', calendarId)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load calendar content', error);
  }

  if (!data) {
    throw new AppError(`calendar_id ${calendarId} was not found`, 404, 'CALENDAR_NOT_FOUND');
  }

  return normalizeCalendarContent(data);
}

export async function createGeneratedPost({ content, generation, templateId }) {
  const payload = {
    brand_id: content.brand.id,
    category_id: content.category.id,
    calendar_id: content.calendar.id,
    template_id: templateId,
    content_type: content.calendar.content_type || 'image',
    hook: generation.content.hook,
    body: generation.content.body,
    cta: generation.content.cta,
    caption_instagram: generation.content.caption_instagram,
    caption_x: generation.content.caption_x,
    caption_linkedin: generation.content.caption_linkedin,
    image_headline: generation.content.image_headline || null,
    image_subline: generation.content.image_subline || null,
    visual_direction: generation.content.visual_direction,
    background_idea: generation.content.background_idea,
    status: 'generated',
    model: generation.model,
    raw_generation: generation.raw
  };

  const { data, error } = await supabase
    .from('generated_posts')
    .upsert(payload, { onConflict: 'calendar_id' })
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not save generated post', error);
  }

  return data;
}

export async function uploadPostImage(postId, imageBuffer) {
  const filePath = `generated-posts/${postId}.png`;

  const { error } = await supabase.storage
    .from('post-assets')
    .upload(filePath, imageBuffer, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: true
    });

  if (error) {
    throw new AppError(`Could not upload rendered image: ${error.message}`, 502, 'STORAGE_UPLOAD_FAILED');
  }

  const { data } = supabase.storage
    .from('post-assets')
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new AppError('Supabase Storage did not return a public URL', 502, 'STORAGE_PUBLIC_URL_FAILED');
  }

  await upsertPostAsset({
    postId,
    filePath,
    imageUrl: data.publicUrl
  });

  return data.publicUrl;
}

// Sube el buffer de un video generado y devuelve su URL publica.
export async function uploadPostVideoBuffer(videoId, buffer) {
  const filePath = `post-videos/${videoId}.mp4`;

  const { error } = await supabase.storage
    .from('post-assets')
    .upload(filePath, buffer, { contentType: 'video/mp4', cacheControl: '31536000', upsert: true });

  if (error) {
    throw new AppError(`Could not upload video: ${error.message}`, 502, 'STORAGE_UPLOAD_FAILED');
  }

  const { data } = supabase.storage.from('post-assets').getPublicUrl(filePath);
  if (!data?.publicUrl) {
    throw new AppError('Supabase Storage did not return a public URL', 502, 'STORAGE_PUBLIC_URL_FAILED');
  }
  return data.publicUrl;
}

const REFERENCE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Uploads a user-provided reference image (as a Buffer) to storage and returns
// its public URL, so brand style references are real image files instead of
// links to pages (e.g. Instagram) that GPT Image 2 can't consume.
export async function uploadReferenceImage(buffer, contentType) {
  const ext = REFERENCE_EXT[contentType];
  if (!ext) {
    throw new AppError('Formato de imagen no soportado. Usa PNG, JPG o WEBP.', 400, 'UNSUPPORTED_IMAGE_TYPE');
  }

  const filePath = `references/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('post-assets')
    .upload(filePath, buffer, { contentType, cacheControl: '31536000', upsert: true });

  if (error) {
    throw new AppError(`Could not upload reference image: ${error.message}`, 502, 'STORAGE_UPLOAD_FAILED');
  }

  const { data } = supabase.storage.from('post-assets').getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new AppError('Supabase Storage did not return a public URL', 502, 'STORAGE_PUBLIC_URL_FAILED');
  }

  return data.publicUrl;
}

async function upsertPostAsset({ postId, filePath, imageUrl }) {
  const { error } = await supabase
    .from('post_assets')
    .upsert(
      {
        post_id: postId,
        asset_type: 'rendered_image',
        storage_bucket: 'post-assets',
        storage_path: filePath,
        public_url: imageUrl,
        metadata: {
          width: 1080,
          height: 1350,
          format: 'png'
        }
      },
      { onConflict: 'post_id,asset_type' }
    );

  if (error) {
    throw wrapSupabaseError('Could not save post asset metadata', error);
  }
}

export async function updateGeneratedPostImageUrl(postId, imageUrl) {
  const { data, error } = await supabase
    .from('generated_posts')
    .update({
      image_url: imageUrl,
      status: 'needs_review',
      render_error: null
    })
    .eq('id', postId)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update generated_posts.image_url', error);
  }

  return data;
}

export async function setPostRenderError(postId, message) {
  const { error } = await supabase
    .from('generated_posts')
    .update({ render_error: message ? String(message).slice(0, 500) : null })
    .eq('id', postId);

  if (error) {
    console.error('[setPostRenderError] could not persist render error', error.message);
  }
}

export async function getBrandById(brandId) {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load brand', error);
  }

  if (!data) {
    throw new AppError(`Brand ${brandId} was not found`, 404, 'BRAND_NOT_FOUND');
  }

  return data;
}

// Reference images for AI image generation: inspirations with no category_id
// act as global brand-level style references, used on every AI-rendered post.
export async function getBrandReferenceImages(brandId, limit = 5) {
  const { data, error } = await supabase
    .from('inspirations')
    .select('id, title, image_url')
    .eq('brand_id', brandId)
    .is('category_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw wrapSupabaseError('Could not load brand reference images', error);
  }

  return data ?? [];
}

export async function listCustomTemplates(brandId) {
  const { data, error } = await supabase
    .from('custom_templates')
    .select('id, brand_id, name, slug, html, created_at, updated_at')
    .eq('brand_id', brandId)
    .order('name', { ascending: true });

  if (error) {
    throw wrapSupabaseError('Could not load custom templates', error);
  }

  return data ?? [];
}

export async function getCustomTemplateBySlug(brandId, slug) {
  const { data, error } = await supabase
    .from('custom_templates')
    .select('id, brand_id, name, slug, html')
    .eq('brand_id', brandId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load custom template', error);
  }

  return data ?? null;
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'template';
}

export async function createCustomTemplate({ brandId, name, html }) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let attempt = 1;

  // Ensure slug uniqueness per brand without a round trip transaction.
  while (await getCustomTemplateBySlug(brandId, slug)) {
    attempt += 1;
    slug = `${baseSlug}_${attempt}`;
  }

  const { data, error } = await supabase
    .from('custom_templates')
    .insert({ brand_id: brandId, name, slug, html })
    .select('id, brand_id, name, slug, html, created_at, updated_at')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not create custom template', error);
  }

  return data;
}

export async function updateCustomTemplate(id, { name, html }) {
  const updates = {};
  if (typeof name === 'string') updates.name = name;
  if (typeof html === 'string') updates.html = html;

  const { data, error } = await supabase
    .from('custom_templates')
    .update(updates)
    .eq('id', id)
    .select('id, brand_id, name, slug, html, created_at, updated_at')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update custom template', error);
  }

  return data;
}

export async function deleteCustomTemplate(id) {
  const { error } = await supabase.from('custom_templates').delete().eq('id', id);

  if (error) {
    throw wrapSupabaseError('Could not delete custom template', error);
  }
}

// --- Videos (Higgsfield) --------------------------------------------------

export async function createPostVideo({ postId, brandId, kind, jobId, script, provider }) {
  const row = { post_id: postId, brand_id: brandId, kind, job_id: jobId, script: script || null, status: 'processing' };
  if (provider) row.provider = provider;
  const { data, error } = await supabase
    .from('post_videos')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not create post video', error);
  }

  return data;
}

export async function updatePostVideo(id, fields) {
  const { data, error } = await supabase
    .from('post_videos')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update post video', error);
  }

  return data;
}

export async function listPostVideos(postId) {
  const { data, error } = await supabase
    .from('post_videos')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    throw wrapSupabaseError('Could not list post videos', error);
  }

  return data ?? [];
}

export async function getPostVideo(id) {
  const { data, error } = await supabase.from('post_videos').select('*').eq('id', id).maybeSingle();
  if (error) throw wrapSupabaseError('Could not load post video', error);
  return data;
}

// --- Multi-tenant helpers -------------------------------------------------

// Brands whose owner_email matches the user's email get claimed on first
// login, so pre-existing brands (Capta) attach to their operator's account.
export async function listBrandsForUser(user) {
  await supabase
    .from('brands')
    .update({ owner_id: user.id })
    .eq('owner_email', user.email)
    .is('owner_id', null);

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, description, default_template_id, instagram_handle, onboarding_status, onboarding_error, automation_enabled, auto_publish, ig_username, ig_connected_at, ig_token_expires_at, whatsapp_number, logo_url, video_engine, image_quality, analysis, brand_manual, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw wrapSupabaseError('Could not list brands', error);
  }

  return data ?? [];
}

export async function getBrandForUser(brandId, userId) {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load brand', error);
  }

  if (!data) {
    throw new AppError('Marca no encontrada o sin acceso', 403, 'BRAND_FORBIDDEN');
  }

  return data;
}

export async function listAutomationBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug')
    .eq('automation_enabled', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw wrapSupabaseError('Could not list automation brands', error);
  }

  return data ?? [];
}

async function brandSlugExists(slug) {
  const { data } = await supabase.from('brands').select('id').eq('slug', slug).maybeSingle();
  return Boolean(data);
}

export async function createBrandShell({ ownerId, ownerEmail, name, instagramHandle }) {
  const baseSlug = String(name || 'marca')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'marca';

  let slug = baseSlug;
  let attempt = 1;
  while (await brandSlugExists(slug)) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data, error } = await supabase
    .from('brands')
    .insert({
      slug,
      name,
      owner_id: ownerId,
      owner_email: ownerEmail,
      instagram_handle: instagramHandle,
      onboarding_status: 'analyzing',
      default_template_id: 'ai_gpt_image_2',
      brand_manual: {}
    })
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not create brand', error);
  }

  return data;
}

export async function updateBrandFields(brandId, fields) {
  const { data, error } = await supabase
    .from('brands')
    .update(fields)
    .eq('id', brandId)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update brand', error);
  }

  return data;
}

// Approved posts whose scheduled publish date has arrived and that still have
// a rendered image but haven't been posted to Instagram yet.
export async function listApprovedDuePosts(brandId, date = todayDateString()) {
  const { data, error } = await supabase
    .from('generated_posts')
    .select('id, brand_id, caption_instagram, image_url, status, calendar:content_calendar!generated_posts_calendar_id_fkey(id, publish_date)')
    .eq('brand_id', brandId)
    .eq('status', 'approved')
    .not('image_url', 'is', null)
    .is('posted_at', null);

  if (error) {
    throw wrapSupabaseError('Could not load due posts', error);
  }

  return (data ?? []).filter((post) => {
    const publishDate = normalizeRelation(post.calendar)?.publish_date;
    return publishDate && publishDate <= date;
  });
}

export async function markPostPublished(postId, mediaId) {
  const { data, error } = await supabase
    .from('generated_posts')
    .update({ status: 'posted', ig_media_id: mediaId, posted_at: new Date().toISOString(), publish_error: null })
    .eq('id', postId)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not mark post as published', error);
  }

  return data;
}

export async function setGeneratedPostStatus(postId, status) {
  const { data, error } = await supabase
    .from('generated_posts')
    .update({ status })
    .eq('id', postId)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update post status', error);
  }

  return data;
}

export async function markPostWaNotified(postId) {
  const { error } = await supabase
    .from('generated_posts')
    .update({ wa_notified_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) {
    console.warn('[markPostWaNotified] failed:', error.message);
  }
}

export async function markPostPublishError(postId, message) {
  const { error } = await supabase
    .from('generated_posts')
    .update({ publish_error: message ? String(message).slice(0, 500) : null })
    .eq('id', postId);

  if (error) {
    console.error('[markPostPublishError] could not persist publish error', error.message);
  }
}

// Brands with a connected Instagram account (for scheduled publishing and
// token refresh).
export async function listBrandsWithInstagram() {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .not('ig_access_token', 'is', null);

  if (error) {
    throw wrapSupabaseError('Could not list Instagram brands', error);
  }

  return data ?? [];
}

export async function insertCategories(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from('content_categories')
    .insert(rows)
    .select('id, name, slug');

  if (error) {
    throw wrapSupabaseError('Could not insert categories', error);
  }

  return data ?? [];
}

export async function insertInspiration(row) {
  const { error } = await supabase.from('inspirations').insert(row);
  if (error) {
    console.warn('[insertInspiration] failed:', error.message);
  }
}

export async function getDefaultBrand() {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load brand', error);
  }

  if (!data) {
    throw new AppError('No brand configured', 404, 'NO_BRAND');
  }

  return data;
}

export async function listCategories(brandId) {
  let query = supabase
    .from('content_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data, error } = await query;

  if (error) {
    throw wrapSupabaseError('Could not load categories', error);
  }

  return data ?? [];
}

// Active products/services of a brand, used to ground ideas and copy in the
// real catalog (names and prices must never be invented).
export async function listBrandProducts(brandId, { activeOnly = true } = {}) {
  let query = supabase
    .from('brand_products')
    .select('id, name, description, price, image_url, source, active, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;

  if (error) {
    throw wrapSupabaseError('Could not load brand products', error);
  }

  return data ?? [];
}

export async function getExistingCalendarTopics(brandId, limit = 400) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select('topic')
    .eq('brand_id', brandId)
    .order('publish_date', { ascending: false })
    .limit(limit);

  if (error) {
    throw wrapSupabaseError('Could not load existing topics', error);
  }

  return (data ?? []).map((row) => row.topic).filter(Boolean);
}

export async function getLatestCalendarDate(brandId) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select('publish_date')
    .eq('brand_id', brandId)
    .order('publish_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError('Could not load latest calendar date', error);
  }

  return data?.publish_date ?? null;
}

export async function countFuturePendingCalendar(brandId, fromDate = todayDateString()) {
  const { count, error } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('status', 'pending')
    .gte('publish_date', fromDate);

  if (error) {
    throw wrapSupabaseError('Could not count pending calendar items', error);
  }

  return count ?? 0;
}

export async function insertCalendarIdeas(rows) {
  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('content_calendar')
    .insert(rows)
    .select('id, publish_date, topic, angle, status, category_id');

  if (error) {
    throw wrapSupabaseError('Could not insert calendar ideas', error);
  }

  return data ?? [];
}

export async function markCalendarPosted(calendarId) {
  if (!calendarId) return;
  const { error } = await supabase
    .from('content_calendar')
    .update({ status: 'posted' })
    .eq('id', calendarId);

  if (error) {
    console.warn('[markCalendarPosted] failed:', error.message);
  }
}

export async function markCalendarGenerated(calendarId, postId) {
  const { error } = await supabase
    .from('content_calendar')
    .update({
      status: 'generated',
      generated_post_id: postId
    })
    .eq('id', calendarId);

  if (error) {
    throw wrapSupabaseError('Could not mark calendar item as generated', error);
  }
}
