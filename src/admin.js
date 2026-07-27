// Panel de operador: la vista de todo Postia en una pantalla.
//
// Acceso: solo los mails de ADMIN_EMAILS. Si la variable esta vacia el panel
// queda cerrado para todos — es preferible a que un default abra la puerta.
//
// Todo lo que devuelve sale de datos que ya existen; no hay metricas inventadas
// ni proyecciones. Donde un numero es estimado, se dice.

import { supabase } from './supabase.js';
import { AppError } from './errors.js';
import { PLANS, planFor } from './plans.js';
import { monthStart } from './usage.js';

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user) {
  const allowed = adminEmails();
  const email = String(user?.email || '').toLowerCase();
  return Boolean(email) && allowed.includes(email);
}

// Responde el mismo en vez de delegar en next(error): sin un error handler
// propio, Express devuelve HTML y el front se come un "Unexpected token '<'".
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'Esta seccion es solo para el operador de Postia.',
      code: 'NOT_ADMIN'
    });
  }
  next();
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const dayKey = (iso) => String(iso || '').slice(0, 10);

// Serie diaria completa: rellena con cero los dias sin datos, para que un
// bajon se vea como un bajon y no como un hueco en el grafico.
function dailySeries(rows, days, pick = () => 1) {
  const counts = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    counts.set(dayKey(new Date(Date.now() - i * 86400000).toISOString()), 0);
  }
  rows.forEach((row) => {
    const key = dayKey(row.created_at);
    if (counts.has(key)) counts.set(key, counts.get(key) + pick(row));
  });
  return [...counts.entries()].map(([date, value]) => ({ date, value: round(value, 2) }));
}

export async function adminOverview({ days = 30 } = {}) {
  const since = daysAgo(days);
  const month = monthStart();

  const [brandsRes, postsRes, usageRes, visitsRes, videosRes] = await Promise.all([
    supabase.from('brands').select('id, name, slug, plan, owner_id, owner_email, ig_username, ig_connected_at, ig_token_expires_at, whatsapp_number, automation_enabled, onboarding_status, created_at'),
    supabase.from('generated_posts').select('id, brand_id, status, content_type, render_error, publish_error, ig_like_count, ig_comments_count, created_at').gte('created_at', since),
    supabase.from('usage_events').select('brand_id, kind, quantity, cost_usd, provider, created_at').gte('created_at', since),
    supabase.from('landing_events').select('kind, referrer, utm_source, country, visitor_hash, created_at').gte('created_at', since),
    supabase.from('post_videos').select('id, brand_id, status, kind, created_at').gte('created_at', since)
  ]);

  for (const res of [brandsRes, postsRes, usageRes, visitsRes, videosRes]) {
    if (res.error) throw new AppError(res.error.message, 500, 'SUPABASE_ERROR');
  }

  const brands = brandsRes.data || [];
  const posts = postsRes.data || [];
  const usage = usageRes.data || [];
  const visits = visitsRes.data || [];
  const videos = videosRes.data || [];

  // --- Negocio -------------------------------------------------------------
  // OJO con el MRR: no hay cobro conectado, asi que NADIE paga. Sumar el precio
  // de lista de cada marca daria un numero grande y falso (hoy todas estan en
  // Agencia por operacion, no por venta). Se expone como simulacion explicita y
  // el panel no lo usa como titular ni calcula margen contra el.
  const onPaidPlan = brands.filter((brand) => planFor(brand).priceUsd > 0);
  const mrrSimulated = onPaidPlan.reduce((acc, brand) => acc + planFor(brand).priceUsd, 0);

  const usageMonth = usage.filter((row) => row.created_at >= month);
  const costMonth = usageMonth.reduce((acc, row) => acc + (Number(row.cost_usd) || 0), 0);

  // Marca activa = genero algo este mes. Es el denominador que importa: el
  // costo por marca activa es el numero que decide si un plan cierra.
  const activeBrandIds = new Set(usageMonth.map((row) => row.brand_id));
  const costPerActive = activeBrandIds.size ? costMonth / activeBrandIds.size : 0;

  const byPlan = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price_usd: plan.priceUsd,
    brands: brands.filter((brand) => planFor(brand).id === plan.id).length
  }));

  // --- Embudo --------------------------------------------------------------
  // Cada escalon es un hecho verificable en la base, no una estimacion.
  const uniqueVisitors = new Set(visits.filter((v) => v.kind === 'view').map((v) => v.visitor_hash)).size;
  const demoUsers = new Set(visits.filter((v) => v.kind === 'demo').map((v) => v.visitor_hash)).size;
  const ctaClicks = new Set(visits.filter((v) => v.kind === 'signup_click').map((v) => v.visitor_hash)).size;
  const brandsWithPost = new Set(posts.map((post) => post.brand_id));
  const brandsPublished = new Set(posts.filter((post) => post.status === 'posted').map((post) => post.brand_id));

  const funnel = [
    { step: 'Visitantes de la landing', value: uniqueVisitors, note: 'unicos por dia' },
    { step: 'Probaron la demo', value: demoUsers },
    { step: 'Clic a crear cuenta', value: ctaClicks },
    { step: 'Marcas creadas', value: brands.filter((brand) => brand.created_at >= since).length },
    { step: 'Generaron al menos un post', value: brandsWithPost.size },
    { step: 'Publicaron en Instagram', value: brandsPublished.size }
  ];

  // --- Salud ---------------------------------------------------------------
  const soon = Date.now() + 10 * 86400000;
  const health = {
    render_errors: posts.filter((post) => post.render_error).length,
    publish_errors: posts.filter((post) => post.publish_error).length,
    videos_error: videos.filter((video) => video.status === 'error').length,
    videos_processing: videos.filter((video) => video.status === 'processing').length,
    ig_connected: brands.filter((brand) => brand.ig_username).length,
    whatsapp_ready: brands.filter((brand) => brand.whatsapp_number).length,
    onboarding_stuck: brands.filter((brand) => brand.onboarding_status && brand.onboarding_status !== 'ready').length,
    tokens_expiring: brands.filter((brand) => {
      const at = brand.ig_token_expires_at ? new Date(brand.ig_token_expires_at).getTime() : 0;
      return at > 0 && at < soon;
    }).length,
    automation_off: brands.filter((brand) => brand.automation_enabled === false).length
  };

  // --- Por marca -----------------------------------------------------------
  const perBrand = brands.map((brand) => {
    const rows = usage.filter((row) => row.brand_id === brand.id && row.created_at >= month);
    const cost = rows.reduce((acc, row) => acc + (Number(row.cost_usd) || 0), 0);
    const plan = planFor(brand);
    const brandPosts = posts.filter((post) => post.brand_id === brand.id);
    return {
      id: brand.id,
      name: brand.name,
      plan: plan.name,
      plan_price: plan.priceUsd,
      owner_email: brand.owner_email,
      ig_username: brand.ig_username,
      created_at: brand.created_at,
      posts_month: rows.filter((row) => row.kind === 'post').reduce((acc, row) => acc + Number(row.quantity || 0), 0),
      posts_cap: plan.posts,
      images_month: rows.filter((row) => row.kind === 'image').reduce((acc, row) => acc + Number(row.quantity || 0), 0),
      videos_month: rows.filter((row) => row.kind === 'video').length,
      posts_period: brandPosts.length,
      published_period: brandPosts.filter((post) => post.status === 'posted').length,
      errors: brandPosts.filter((post) => post.render_error || post.publish_error).length,
      cost_usd: round(cost),
      margin_usd: round(plan.priceUsd - cost)
    };
  }).sort((a, b) => b.cost_usd - a.cost_usd);

  // --- Contenido -----------------------------------------------------------
  const tally = (rows, key) => {
    const acc = {};
    rows.forEach((row) => { const k = key(row) || 'image'; acc[k] = (acc[k] || 0) + 1; });
    return Object.entries(acc).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const referrers = tally(
    visits.filter((visit) => visit.kind === 'view' && visit.referrer),
    (visit) => {
      try { return new URL(visit.referrer).hostname.replace(/^www\./, ''); } catch { return null; }
    }
  ).slice(0, 8);

  return {
    period_days: days,
    generated_at: new Date().toISOString(),
    business: {
      brands: brands.length,
      active_brands: activeBrandIds.size,
      owners: new Set(brands.map((brand) => brand.owner_id || brand.owner_email).filter(Boolean)).size,
      brands_on_paid_plan: onPaidPlan.length,
      cost_month_usd: round(costMonth),
      cost_per_active_brand_usd: round(costPerActive),
      billing_connected: false,
      mrr_simulated_usd: mrrSimulated,
      by_plan: byPlan
    },
    funnel,
    health,
    content: {
      posts_period: posts.length,
      published_period: posts.filter((post) => post.status === 'posted').length,
      by_status: tally(posts, (post) => post.status),
      by_type: tally(posts, (post) => post.content_type)
    },
    traffic: {
      views: visits.filter((visit) => visit.kind === 'view').length,
      unique_visitors: uniqueVisitors,
      demos: visits.filter((visit) => visit.kind === 'demo').length,
      cta_clicks: visits.filter((visit) => visit.kind === 'signup_click').length,
      referrers,
      countries: tally(visits.filter((visit) => visit.country), (visit) => visit.country).slice(0, 6)
    },
    series: {
      visits: dailySeries(visits.filter((visit) => visit.kind === 'view'), days),
      posts: dailySeries(posts, days),
      cost: dailySeries(usage, days, (row) => Number(row.cost_usd) || 0)
    },
    brands: perBrand
  };
}
