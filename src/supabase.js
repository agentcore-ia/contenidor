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

export async function getPendingContentForToday(date = todayDateString()) {
  const { data, error } = await supabase
    .from('content_calendar')
    .select(calendarSelect())
    .eq('publish_date', date)
    .eq('status', 'pending')
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
    hook: generation.content.hook,
    body: generation.content.body,
    cta: generation.content.cta,
    caption_instagram: generation.content.caption_instagram,
    caption_x: generation.content.caption_x,
    caption_linkedin: generation.content.caption_linkedin,
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
      status: 'needs_review'
    })
    .eq('id', postId)
    .select('*')
    .single();

  if (error) {
    throw wrapSupabaseError('Could not update generated_posts.image_url', error);
  }

  return data;
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
