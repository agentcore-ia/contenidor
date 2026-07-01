import {
  createGeneratedPost,
  getCalendarContent,
  getPendingContentForToday,
  markCalendarGenerated,
  updateGeneratedPostImageUrl,
  uploadPostImage
} from './supabase.js';
import { generatePostContent } from './openai.js';
import { renderPostImage } from './render.js';

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

export async function renderAndStorePost(post) {
  const imageBuffer = await renderPostImage(post);
  const imageUrl = await uploadPostImage(post.id, imageBuffer);

  return updateGeneratedPostImageUrl(post.id, imageUrl);
}

export async function generateAndRenderPost(calendarId) {
  const post = await generatePostForCalendar(calendarId);
  const renderedPost = await renderAndStorePost(post);

  await markCalendarGenerated(calendarId, renderedPost.id);

  return renderedPost;
}
