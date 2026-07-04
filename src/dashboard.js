import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { supabase, getGeneratedPost } from './supabase.js';
import { AppError } from './errors.js';
import { generateCalendarIdeas, generatePostForCalendar, renderAndStorePost } from './contentEngine.js';
import { getSchedulerState, runAutomationNow } from './scheduler.js';
import { templates } from './templates/index.js';
import { todayDateString } from './dates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, 'dashboard');

const CAL_STATUSES = ['pending', 'generated', 'needs_review', 'approved', 'posted', 'rejected', 'skipped'];

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error(`[dashboard:${req.method} ${req.path}:error]`, error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Unexpected error',
        code: error.code || 'UNEXPECTED_ERROR'
      });
    }
  };
}

function staticFile(filename, contentType) {
  return async (_req, res) => {
    const body = await readFile(resolve(DASHBOARD_DIR, filename), 'utf8');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  };
}

async function getDefaultBrand() {
  const { data, error } = await supabase.from('brands').select('id').order('created_at', { ascending: true }).limit(1).single();
  if (error) throw new AppError('No brands found', 404, 'NO_BRAND');
  return data;
}

export function registerDashboardRoutes(app) {
  app.get('/dashboard', wrap(staticFile('page.html', 'text/html; charset=utf-8')));
  app.get('/dashboard/page.css', wrap(staticFile('page.css', 'text/css; charset=utf-8')));
  app.get('/dashboard/page.js', wrap(staticFile('page.js', 'application/javascript; charset=utf-8')));

  app.get('/api/templates', wrap(async (_req, res) => {
    res.json({ success: true, templates: Object.keys(templates) });
  }));

  app.get('/api/overview', wrap(async (_req, res) => {
    const today = todayDateString();
    const [posts, calendar, brands, categories, inspirations] = await Promise.all([
      supabase
        .from('generated_posts')
        .select('id, hook, status, image_url, template_id, created_at, calendar_id')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('content_calendar')
        .select('id, publish_date, topic, angle, status, generated_post_id, category:content_categories(name, slug)')
        .order('publish_date', { ascending: true })
        .limit(200),
      supabase.from('brands').select('id, name, slug, default_template_id'),
      supabase.from('content_categories').select('id, name, slug, default_template_id, sort_order'),
      supabase.from('inspirations').select('id, title, category_id')
    ]);

    const firstError = [posts, calendar, brands, categories, inspirations].find((result) => result.error)?.error;
    if (firstError) throw new AppError(firstError.message, 500, 'SUPABASE_ERROR');

    const byStatus = (rows) => (rows ?? []).reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

    const calendarRows = calendar.data ?? [];
    const todayItem = calendarRows.find((item) => item.publish_date === today) ?? null;
    const nextItems = calendarRows
      .filter((item) => item.publish_date >= today)
      .slice(0, 7);

    res.json({
      success: true,
      overview: {
        today,
        counts: {
          posts: posts.data?.length ?? 0,
          calendar: calendarRows.length,
          brands: brands.data?.length ?? 0,
          categories: categories.data?.length ?? 0,
          inspirations: inspirations.data?.length ?? 0,
          templates: Object.keys(templates).length
        },
        posts_by_status: byStatus(posts.data),
        calendar_by_status: byStatus(calendarRows),
        today_item: todayItem,
        next_items: nextItems,
        recent_posts: posts.data?.slice(0, 6) ?? []
      }
    });
  }));

  app.get('/api/system', wrap(async (_req, res) => {
    res.json({
      success: true,
      system: {
        service: 'capta-content-engine',
        node: process.version,
        uptime_seconds: Math.round(process.uptime()),
        content_time_zone: process.env.CONTENT_TIME_ZONE || 'America/Argentina/Buenos_Aires',
        today: todayDateString(),
        model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        templates: Object.keys(templates),
        env: {
          SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY)
        }
      }
    });
  }));

  app.get('/api/posts', wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200);
    const { data, error } = await supabase
      .from('generated_posts')
      .select('id, hook, body, cta, caption_instagram, caption_x, caption_linkedin, image_url, status, template_id, visual_direction, background_idea, model, created_at, calendar_id, category_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, posts: data ?? [] });
  }));

  app.get('/api/posts/:id', wrap(async (req, res) => {
    const post = await getGeneratedPost(req.params.id);
    const { data: cal } = await supabase.from('content_calendar').select('id, publish_date, topic, angle, status, category:content_categories(name, slug)').eq('id', post.calendar_id).single();
    res.json({ success: true, post: { ...post, calendar: cal ?? null } });
  }));

  app.post('/api/posts/:id/regenerate-copy', wrap(async (req, res) => {
    const post = await getGeneratedPost(req.params.id);
    const updated = await generatePostForCalendar(post.calendar_id);
    res.json({ success: true, post: updated });
  }));

  app.post('/api/posts/:id/regenerate-render', wrap(async (req, res) => {
    const post = await getGeneratedPost(req.params.id);
    const rendered = await renderAndStorePost(post);
    res.json({ success: true, post: rendered });
  }));

  app.post('/api/posts/:id/approve', wrap(async (req, res) => {
    const { data, error } = await supabase.from('generated_posts').update({ status: 'approved' }).eq('id', req.params.id).select().single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, post: data });
  }));

  app.post('/api/posts/:id/reject', wrap(async (req, res) => {
    const { data, error } = await supabase.from('generated_posts').update({ status: 'rejected' }).eq('id', req.params.id).select().single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, post: data });
  }));

  app.patch('/api/posts/:id/template', wrap(async (req, res) => {
    const tid = req.body?.template_id;
    if (!tid || !templates[tid]) throw new AppError(`Template "${tid}" no existe`, 400, 'BAD_REQUEST');
    const { data: updated } = await supabase.from('generated_posts').update({ template_id: tid }).eq('id', req.params.id).select().single();
    if (!updated) throw new AppError('Post no encontrado', 404, 'NOT_FOUND');
    const rendered = await renderAndStorePost(updated);
    res.json({ success: true, post: rendered });
  }));

  app.get('/api/calendar', wrap(async (_req, res) => {
    const { data, error } = await supabase
      .from('content_calendar')
      .select('id, publish_date, topic, angle, status, category_id, generated_post_id, created_at, category:content_categories(id, name, slug), brand:brands(id, name, slug)')
      .order('publish_date', { ascending: true });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, calendar: data ?? [] });
  }));

  app.patch('/api/calendar/:id', wrap(async (req, res) => {
    const updates = {};
    if (typeof req.body?.topic === 'string') updates.topic = req.body.topic.trim();
    if (typeof req.body?.angle === 'string') updates.angle = req.body.angle.trim();
    if (typeof req.body?.status === 'string') {
      if (!CAL_STATUSES.includes(req.body.status)) throw new AppError(`status invalido. Valores: ${CAL_STATUSES.join(', ')}`, 400);
      updates.status = req.body.status;
    }
    if (Object.keys(updates).length === 0) throw new AppError('Nada para actualizar', 400);
    const { data, error } = await supabase.from('content_calendar').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, item: data });
  }));

  app.post('/api/ideas/generate', wrap(async (req, res) => {
    const count = parseInt(req.body?.count ?? '7', 10) || 7;
    const result = await generateCalendarIdeas({ count });
    res.json({ success: true, ...result });
  }));

  app.get('/api/automation', wrap(async (_req, res) => {
    res.json({ success: true, automation: getSchedulerState() });
  }));

  app.post('/api/automation/run', wrap(async (_req, res) => {
    const result = await runAutomationNow();
    res.json({ success: true, result, automation: getSchedulerState() });
  }));

  app.get('/api/brands', wrap(async (_req, res) => {
    const { data, error } = await supabase.from('brands').select('*').order('name', { ascending: true });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, brands: data ?? [] });
  }));

  app.put('/api/brands/:id', wrap(async (req, res) => {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.description === 'string') updates.description = req.body.description;
    if (req.body?.brand_manual && typeof req.body.brand_manual === 'object') updates.brand_manual = req.body.brand_manual;
    if (typeof req.body?.default_template_id === 'string') {
      if (!templates[req.body.default_template_id]) throw new AppError(`Template ${req.body.default_template_id} no existe`, 400);
      updates.default_template_id = req.body.default_template_id;
    }
    const { data, error } = await supabase.from('brands').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, brand: data });
  }));

  app.get('/api/categories', wrap(async (_req, res) => {
    const { data, error } = await supabase.from('content_categories').select('*').order('sort_order', { ascending: true });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, categories: data ?? [] });
  }));

  app.patch('/api/categories/:id', wrap(async (req, res) => {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.description === 'string') updates.description = req.body.description;
    if (typeof req.body?.objective === 'string') updates.objective = req.body.objective;
    if (typeof req.body?.prompt_guidance === 'string') updates.prompt_guidance = req.body.prompt_guidance;
    if (req.body?.hook_examples && Array.isArray(req.body.hook_examples)) updates.hook_examples = req.body.hook_examples;
    if (req.body?.avoid_rules && Array.isArray(req.body.avoid_rules)) updates.avoid_rules = req.body.avoid_rules;
    if (typeof req.body?.default_template_id === 'string') {
      if (!templates[req.body.default_template_id]) throw new AppError(`Template invalido`, 400);
      updates.default_template_id = req.body.default_template_id;
    }
    if (typeof req.body?.sort_order === 'number') updates.sort_order = req.body.sort_order;
    const { data, error } = await supabase.from('content_categories').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, category: data });
  }));

  app.get('/api/inspirations', wrap(async (_req, res) => {
    const { data, error } = await supabase.from('inspirations').select('*, category:content_categories(id, name, slug)').order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspirations: data ?? [] });
  }));

  app.post('/api/inspirations', wrap(async (req, res) => {
    const brand = await getDefaultBrand();
    const { title, image_url, notes, why_it_works, category_id } = req.body ?? {};
    if (!title || !image_url) throw new AppError('title e image_url son requeridos', 400);
    const { data, error } = await supabase.from('inspirations').insert({
      brand_id: brand.id, category_id, title, image_url, notes: notes ?? null, why_it_works: why_it_works ?? null
    }).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspiration: data });
  }));

  app.patch('/api/inspirations/:id', wrap(async (req, res) => {
    const updates = {};
    if (typeof req.body?.title === 'string') updates.title = req.body.title;
    if (typeof req.body?.image_url === 'string') updates.image_url = req.body.image_url;
    if (typeof req.body?.notes === 'string') updates.notes = req.body.notes;
    if (typeof req.body?.why_it_works === 'string') updates.why_it_works = req.body.why_it_works;
    if (req.body?.category_id) updates.category_id = req.body.category_id;
    const { data, error } = await supabase.from('inspirations').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspiration: data });
  }));

  app.delete('/api/inspirations/:id', wrap(async (req, res) => {
    const { error } = await supabase.from('inspirations').delete().eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true });
  }));
}
