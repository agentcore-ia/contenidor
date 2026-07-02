import 'dotenv/config';
import express from 'express';
import { requireRequestField } from './src/errors.js';
import { generateAndRenderPost, generatePostForCalendar, getTodayContent, renderAndStorePost } from './src/contentEngine.js';
import { getGeneratedPost } from './src/supabase.js';
import { registerDashboardRoutes } from './src/dashboard.js';

const app = express();
const port = process.env.PORT || 80;

console.log('[startup] booting...', { port, node: process.version, cwd: process.cwd() });

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'capta-content-engine' });
});

function todayResponse(content) {
  return {
    success: true,
    calendar_id: content.calendar.id,
    publish_date: content.calendar.publish_date,
    topic: content.calendar.topic,
    angle: content.calendar.angle,
    status: content.calendar.status,
    template_id: content.category.default_template_id || content.brand.default_template_id || 'pain_point_01',
    brand: content.brand,
    category: content.category
  };
}

function postResponse(post) {
  return {
    success: true,
    post
  };
}

function handleError(routeName, error, res) {
  console.error(`[${routeName}:error]`, error);

  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Unexpected error',
    code: error.code || 'UNEXPECTED_ERROR'
  });
}

app.get('/today', async (_req, res) => {
  try {
    const content = await getTodayContent();
    return res.json(todayResponse(content));
  } catch (error) {
    return handleError('today', error, res);
  }
});

app.post('/generate', async (req, res) => {
  try {
    const calendarId = requireRequestField(req.body, 'calendar_id');
    const post = await generatePostForCalendar(calendarId);

    return res.json(postResponse(post));
  } catch (error) {
    return handleError('generate', error, res);
  }
});

app.post('/render', async (req, res) => {
  try {
    const postId = requireRequestField(req.body, 'post_id');
    const post = await getGeneratedPost(postId);
    const renderedPost = await renderAndStorePost(post);

    return res.json({
      success: true,
      image_url: renderedPost.image_url
    });
  } catch (error) {
    return handleError('render', error, res);
  }
});

app.post('/generate-and-render', async (req, res) => {
  try {
    const calendarId = requireRequestField(req.body, 'calendar_id');
    const post = await generateAndRenderPost(calendarId);

    return res.json({
      success: true,
      post_id: post.id,
      image_url: post.image_url,
      caption_instagram: post.caption_instagram,
      caption_x: post.caption_x,
      caption_linkedin: post.caption_linkedin
    });
  } catch (error) {
    return handleError('generate-and-render', error, res);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

registerDashboardRoutes(app);
console.log('[startup] routes registered, starting listen...');

app.listen(port, () => {
  console.log(`Capta Content Engine listening on port ${port}`);
});
