import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  supabase,
  getGeneratedPost,
  getBrandForUser,
  listBrandsForUser,
  listCustomTemplates,
  createCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
  updateBrandFields,
  uploadReferenceImage
} from './supabase.js';
import { AppError } from './errors.js';
import { generateAndRenderPost, generateCalendarIdeas, generatePostForCalendar, publishPost, renderPostInBackground, runDailyAutomation } from './contentEngine.js';
import { buildAuthUrl, connectFromCode, instagramConfigured, verifyState } from './instagram.js';
import { getSchedulerState } from './scheduler.js';
import { authMiddleware, requireBrand, signUp, signIn, refreshSession } from './auth.js';
import { startOnboarding } from './onboarding.js';
import { templates } from './templates/index.js';
import { addDays, todayDateString } from './dates.js';

const CUSTOM_PREFIX = 'custom_';

function isValidTemplateId(tid) {
  return Boolean(tid) && (Boolean(templates[tid]) || tid.startsWith(CUSTOM_PREFIX));
}

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

export function registerDashboardRoutes(app) {
  app.get('/dashboard', wrap(staticFile('page.html', 'text/html; charset=utf-8')));
  app.get('/dashboard/page.css', wrap(staticFile('page.css', 'text/css; charset=utf-8')));
  app.get('/dashboard/page.js', wrap(staticFile('page.js', 'application/javascript; charset=utf-8')));

  // --- Auth (public) ---
  app.post('/auth/signup', wrap(async (req, res) => {
    const session = await signUp(req.body?.email, req.body?.password);
    res.json({ success: true, session });
  }));

  app.post('/auth/login', wrap(async (req, res) => {
    const session = await signIn(req.body?.email, req.body?.password);
    res.json({ success: true, session });
  }));

  app.post('/auth/refresh', wrap(async (req, res) => {
    const session = await refreshSession(req.body?.refresh_token);
    res.json({ success: true, session });
  }));

  // --- Instagram OAuth callback (public: the browser is redirected here by
  // Instagram, without our bearer token). The signed `state` carries and
  // authenticates which brand to attach. ---
  app.get('/oauth/instagram/callback', async (req, res) => {
    const back = (params) => res.redirect(`/dashboard?${new URLSearchParams(params).toString()}`);
    try {
      if (req.query.error) {
        return back({ ig: 'error', msg: String(req.query.error_description || req.query.error).slice(0, 140) });
      }
      const code = req.query.code;
      const state = verifyState(req.query.state);
      if (!code) throw new AppError('Falta el code de autorizacion', 400);
      const fields = await connectFromCode(code);
      await updateBrandFields(state.brandId, fields);
      back({ ig: 'connected', handle: fields.ig_username || '' });
    } catch (error) {
      console.error('[instagram:callback:error]', error);
      back({ ig: 'error', msg: String(error.message || 'No se pudo conectar').slice(0, 140) });
    }
  });

  // Everything under /api requires a logged-in user.
  app.use('/api', authMiddleware);

  // --- Onboarding ---
  app.post('/api/onboarding', wrap(async (req, res) => {
    const brand = await startOnboarding({
      user: req.user,
      instagramUrl: req.body?.instagram_url,
      answers: req.body?.answers || {}
    });
    res.json({ success: true, brand });
  }));

  app.post('/api/generate-and-render', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const calendarId = req.body?.calendar_id;
    if (!calendarId) throw new AppError('calendar_id requerido', 400);
    const { data: cal } = await supabase.from('content_calendar').select('id').eq('id', calendarId).eq('brand_id', brand.id).maybeSingle();
    if (!cal) throw new AppError('Item de calendario no encontrado', 404);
    const post = await generateAndRenderPost(calendarId);
    res.json({ success: true, post_id: post.id, status: post.status, rendering: true });
  }));

  app.get('/api/templates', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const custom = await listCustomTemplates(brand.id);
    const customIds = custom.map((tpl) => `${CUSTOM_PREFIX}${tpl.slug}`);
    res.json({ success: true, templates: [...Object.keys(templates), ...customIds] });
  }));

  app.get('/api/custom-templates', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const items = await listCustomTemplates(brand.id);
    res.json({ success: true, custom_templates: items });
  }));

  app.post('/api/custom-templates', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { name, html } = req.body ?? {};
    if (!name || !html) throw new AppError('name y html son requeridos', 400);
    const created = await createCustomTemplate({ brandId: brand.id, name, html });
    res.json({ success: true, custom_template: created });
  }));

  async function requireOwnTemplate(req) {
    const brand = await requireBrand(req);
    const owned = await listCustomTemplates(brand.id);
    if (!owned.some((tpl) => tpl.id === req.params.id)) throw new AppError('Template no encontrado', 404, 'NOT_FOUND');
  }

  app.put('/api/custom-templates/:id', wrap(async (req, res) => {
    await requireOwnTemplate(req);
    const { name, html } = req.body ?? {};
    const updated = await updateCustomTemplate(req.params.id, { name, html });
    res.json({ success: true, custom_template: updated });
  }));

  app.delete('/api/custom-templates/:id', wrap(async (req, res) => {
    await requireOwnTemplate(req);
    await deleteCustomTemplate(req.params.id);
    res.json({ success: true });
  }));

  app.get('/api/me', wrap(async (req, res) => {
    res.json({ success: true, user: { id: req.user.id, email: req.user.email } });
  }));

  // --- Instagram connection ---
  app.get('/api/instagram/connect-url', wrap(async (req, res) => {
    if (!instagramConfigured()) throw new AppError('Instagram no esta configurado en el servidor (falta INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).', 503, 'IG_NOT_CONFIGURED');
    const brand = await requireBrand(req);
    const url = buildAuthUrl({ brandId: brand.id, userId: req.user.id });
    res.json({ success: true, url });
  }));

  app.post('/api/instagram/disconnect', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    await updateBrandFields(brand.id, {
      ig_user_id: null,
      ig_username: null,
      ig_access_token: null,
      ig_token_expires_at: null,
      ig_connected_at: null
    });
    res.json({ success: true });
  }));

  app.patch('/api/instagram/settings', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    if (typeof req.body?.auto_publish !== 'boolean') throw new AppError('auto_publish (boolean) requerido', 400);
    const updated = await updateBrandFields(brand.id, { auto_publish: req.body.auto_publish });
    res.json({ success: true, auto_publish: updated.auto_publish });
  }));

  // Monday..Sunday window containing `dateStr` (YYYY-MM-DD).
  function weekRange(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addDays(dateStr, mondayOffset);
    return { start, end: addDays(start, 6) };
  }

  app.get('/api/overview', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const today = todayDateString();
    const [posts, calendar, categories, inspirations] = await Promise.all([
      supabase
        .from('generated_posts')
        .select('id, hook, body, cta, image_url, status, render_error, template_id, created_at, calendar_id')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('content_calendar')
        .select('id, publish_date, topic, angle, status, generated_post_id, category:content_categories(name, slug)')
        .eq('brand_id', brand.id)
        .order('publish_date', { ascending: true })
        .limit(300),
      supabase.from('content_categories').select('id, name, slug, default_template_id, sort_order').eq('brand_id', brand.id),
      supabase.from('inspirations').select('id, title, category_id').eq('brand_id', brand.id)
    ]);

    const firstError = [posts, calendar, categories, inspirations].find((result) => result.error)?.error;
    if (firstError) throw new AppError(firstError.message, 500, 'SUPABASE_ERROR');

    const byStatus = (rows) => (rows ?? []).reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

    const postRows = posts.data ?? [];
    const calendarRows = calendar.data ?? [];
    const postsById = new Map(postRows.map((post) => [post.id, post]));

    const todayItem = calendarRows.find((item) => item.publish_date === today) ?? null;
    const nextItems = calendarRows.filter((item) => item.publish_date >= today).slice(0, 4);

    // This/last week post generation volume, for the "posts generated" metric.
    const thisWeek = weekRange(today);
    const lastWeek = weekRange(addDays(thisWeek.start, -1));
    const dateOf = (iso) => String(iso).slice(0, 10);
    const inRange = (dateStr, range) => dateStr >= range.start && dateStr <= range.end;
    const postsThisWeek = postRows.filter((post) => inRange(dateOf(post.created_at), thisWeek)).length;
    const postsLastWeek = postRows.filter((post) => inRange(dateOf(post.created_at), lastWeek)).length;

    // Approval rate among reviewed posts (approved vs rejected) as a real,
    // available proxy for "brand consistency" — no invented metric.
    const postStatus = byStatus(postRows);
    const reviewed = (postStatus.approved || 0) + (postStatus.rejected || 0);
    const approvalRate = reviewed > 0 ? Math.round(((postStatus.approved || 0) / reviewed) * 100) : null;

    const monthOf = (dateStr) => dateStr.slice(0, 7);
    const thisMonth = today.slice(0, 7);
    const lastMonthDate = addDays(`${thisMonth}-01`, -1);
    const lastMonth = lastMonthDate.slice(0, 7);
    const scheduledThisMonth = calendarRows.filter((item) => monthOf(item.publish_date) === thisMonth).length;
    const scheduledLastMonth = calendarRows.filter((item) => monthOf(item.publish_date) === lastMonth).length;

    // Monday..Sunday strip for the current week, each day paired with its
    // calendar item (and that item's rendered image, if any) for the
    // "weekly schedule" widget.
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(thisWeek.start, i);
      const item = calendarRows.find((row) => row.publish_date === date) ?? null;
      const post = item?.generated_post_id ? postsById.get(item.generated_post_id) ?? null : null;
      return { date, item, image_url: post?.image_url ?? null };
    });

    const todayPost = todayItem?.generated_post_id ? postsById.get(todayItem.generated_post_id) ?? null : null;

    res.json({
      success: true,
      overview: {
        today,
        counts: {
          posts: postRows.length,
          calendar: calendarRows.length,
          categories: categories.data?.length ?? 0,
          inspirations: inspirations.data?.length ?? 0,
          templates: Object.keys(templates).length
        },
        posts_by_status: postStatus,
        calendar_by_status: byStatus(calendarRows),
        today_item: todayItem,
        today_post: todayPost,
        next_items: nextItems,
        recent_posts: postRows.slice(0, 6),
        needs_review_posts: postRows.filter((post) => post.status === 'needs_review').slice(0, 6),
        week_days: weekDays,
        metrics: {
          posts_this_week: postsThisWeek,
          posts_last_week: postsLastWeek,
          approval_rate: approvalRate,
          approved_count: postStatus.approved || 0,
          scheduled_this_month: scheduledThisMonth,
          scheduled_last_month: scheduledLastMonth
        }
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

  async function requirePost(req) {
    const brand = await requireBrand(req);
    const post = await getGeneratedPost(req.params.id);
    if (post.brand_id !== brand.id) throw new AppError('Post no encontrado', 404, 'NOT_FOUND');
    return { brand, post };
  }

  app.get('/api/posts', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200);
    const { data, error } = await supabase
      .from('generated_posts')
      .select('id, hook, body, cta, caption_instagram, caption_x, caption_linkedin, image_url, status, render_error, template_id, visual_direction, background_idea, model, created_at, calendar_id, category_id')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, posts: data ?? [] });
  }));

  app.get('/api/posts/:id', wrap(async (req, res) => {
    const { post } = await requirePost(req);
    const { data: cal } = await supabase.from('content_calendar').select('id, publish_date, topic, angle, status, category:content_categories(name, slug)').eq('id', post.calendar_id).single();
    res.json({ success: true, post: { ...post, calendar: cal ?? null } });
  }));

  app.post('/api/posts/:id/regenerate-copy', wrap(async (req, res) => {
    const { post } = await requirePost(req);
    const updated = await generatePostForCalendar(post.calendar_id);
    res.json({ success: true, post: updated });
  }));

  app.post('/api/posts/:id/regenerate-render', wrap(async (req, res) => {
    const { post } = await requirePost(req);
    renderPostInBackground(post);
    res.json({ success: true, post, rendering: true });
  }));

  app.post('/api/posts/:id/approve', wrap(async (req, res) => {
    const { brand } = await requirePost(req);
    const { data, error } = await supabase.from('generated_posts').update({ status: 'approved' }).eq('id', req.params.id).eq('brand_id', brand.id).select().single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, post: data });
  }));

  app.post('/api/posts/:id/reject', wrap(async (req, res) => {
    const { brand } = await requirePost(req);
    const { data, error } = await supabase.from('generated_posts').update({ status: 'rejected' }).eq('id', req.params.id).eq('brand_id', brand.id).select().single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, post: data });
  }));

  app.post('/api/posts/:id/publish', wrap(async (req, res) => {
    const { brand, post } = await requirePost(req);
    if (!brand.ig_access_token) throw new AppError('Conecta Instagram para esta marca antes de publicar.', 400, 'IG_NOT_CONNECTED');
    if (!post.image_url) throw new AppError('El post todavia no tiene imagen renderizada.', 400, 'IG_NO_IMAGE');
    if (post.posted_at) throw new AppError('Este post ya fue publicado.', 409, 'IG_ALREADY_POSTED');
    const published = await publishPost(post, brand);
    res.json({ success: true, post: published });
  }));

  app.patch('/api/posts/:id/template', wrap(async (req, res) => {
    const { brand } = await requirePost(req);
    const tid = req.body?.template_id;
    if (!isValidTemplateId(tid)) throw new AppError(`Template "${tid}" no existe`, 400, 'BAD_REQUEST');
    const { data: updated } = await supabase.from('generated_posts').update({ template_id: tid }).eq('id', req.params.id).eq('brand_id', brand.id).select().single();
    if (!updated) throw new AppError('Post no encontrado', 404, 'NOT_FOUND');
    renderPostInBackground(updated);
    res.json({ success: true, post: updated, rendering: true });
  }));

  app.get('/api/calendar', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { data, error } = await supabase
      .from('content_calendar')
      .select('id, publish_date, topic, angle, status, category_id, generated_post_id, created_at, category:content_categories(id, name, slug)')
      .eq('brand_id', brand.id)
      .order('publish_date', { ascending: true });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, calendar: data ?? [] });
  }));

  app.patch('/api/calendar/:id', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const updates = {};
    if (typeof req.body?.topic === 'string') updates.topic = req.body.topic.trim();
    if (typeof req.body?.angle === 'string') updates.angle = req.body.angle.trim();
    if (typeof req.body?.status === 'string') {
      if (!CAL_STATUSES.includes(req.body.status)) throw new AppError(`status invalido. Valores: ${CAL_STATUSES.join(', ')}`, 400);
      updates.status = req.body.status;
    }
    if (Object.keys(updates).length === 0) throw new AppError('Nada para actualizar', 400);
    const { data, error } = await supabase.from('content_calendar').update(updates).eq('id', req.params.id).eq('brand_id', brand.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, item: data });
  }));

  app.post('/api/ideas/generate', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const count = parseInt(req.body?.count ?? '7', 10) || 7;
    const result = await generateCalendarIdeas({ brandId: brand.id, count });
    res.json({ success: true, ...result });
  }));

  app.get('/api/automation', wrap(async (_req, res) => {
    res.json({ success: true, automation: getSchedulerState() });
  }));

  app.post('/api/automation/run', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const result = await runDailyAutomation({ brandId: brand.id });
    res.json({ success: true, result, automation: getSchedulerState() });
  }));

  app.get('/api/brands', wrap(async (req, res) => {
    const brands = await listBrandsForUser(req.user);
    res.json({ success: true, brands });
  }));

  app.put('/api/brands/:id', wrap(async (req, res) => {
    await getBrandForUser(req.params.id, req.user.id);
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.description === 'string') updates.description = req.body.description;
    if (req.body?.brand_manual && typeof req.body.brand_manual === 'object') updates.brand_manual = req.body.brand_manual;
    if (typeof req.body?.default_template_id === 'string') {
      if (!isValidTemplateId(req.body.default_template_id)) throw new AppError(`Template ${req.body.default_template_id} no existe`, 400);
      updates.default_template_id = req.body.default_template_id;
    }
    const { data, error } = await supabase.from('brands').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, brand: data });
  }));

  app.get('/api/categories', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { data, error } = await supabase.from('content_categories').select('*').eq('brand_id', brand.id).order('sort_order', { ascending: true });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, categories: data ?? [] });
  }));

  app.patch('/api/categories/:id', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.description === 'string') updates.description = req.body.description;
    if (typeof req.body?.objective === 'string') updates.objective = req.body.objective;
    if (typeof req.body?.prompt_guidance === 'string') updates.prompt_guidance = req.body.prompt_guidance;
    if (req.body?.hook_examples && Array.isArray(req.body.hook_examples)) updates.hook_examples = req.body.hook_examples;
    if (req.body?.avoid_rules && Array.isArray(req.body.avoid_rules)) updates.avoid_rules = req.body.avoid_rules;
    if (typeof req.body?.default_template_id === 'string') {
      if (!isValidTemplateId(req.body.default_template_id)) throw new AppError(`Template invalido`, 400);
      updates.default_template_id = req.body.default_template_id;
    }
    if (typeof req.body?.sort_order === 'number') updates.sort_order = req.body.sort_order;
    const { data, error } = await supabase.from('content_categories').update(updates).eq('id', req.params.id).eq('brand_id', brand.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, category: data });
  }));

  app.get('/api/inspirations', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { data, error } = await supabase.from('inspirations').select('*, category:content_categories(id, name, slug)').eq('brand_id', brand.id).order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspirations: data ?? [] });
  }));

  app.post('/api/uploads/reference', wrap(async (req, res) => {
    const dataUrl = req.body?.data_url;
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!match) throw new AppError('Imagen invalida. Subi un archivo PNG, JPG o WEBP.', 400);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 20 * 1024 * 1024) throw new AppError('La imagen supera 20MB.', 400);
    const url = await uploadReferenceImage(buffer, match[1]);
    res.json({ success: true, image_url: url });
  }));

  app.post('/api/inspirations', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { title, image_url, notes, why_it_works, category_id } = req.body ?? {};
    if (!title || !image_url) throw new AppError('title e image_url son requeridos', 400);
    const { data, error } = await supabase.from('inspirations').insert({
      brand_id: brand.id, category_id: category_id || null, title, image_url, notes: notes ?? null, why_it_works: why_it_works ?? null
    }).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspiration: data });
  }));

  app.patch('/api/inspirations/:id', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const updates = {};
    if (typeof req.body?.title === 'string') updates.title = req.body.title;
    if (typeof req.body?.image_url === 'string') updates.image_url = req.body.image_url;
    if (typeof req.body?.notes === 'string') updates.notes = req.body.notes;
    if (typeof req.body?.why_it_works === 'string') updates.why_it_works = req.body.why_it_works;
    if (req.body?.category_id) updates.category_id = req.body.category_id;
    const { data, error } = await supabase.from('inspirations').update(updates).eq('id', req.params.id).eq('brand_id', brand.id).select('*').single();
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true, inspiration: data });
  }));

  app.delete('/api/inspirations/:id', wrap(async (req, res) => {
    const brand = await requireBrand(req);
    const { error } = await supabase.from('inspirations').delete().eq('id', req.params.id).eq('brand_id', brand.id);
    if (error) throw new AppError(error.message, 500, 'SUPABASE_ERROR');
    res.json({ success: true });
  }));
}
