// Medicion de consumo y aplicacion de topes por plan.
//
// Dos responsabilidades:
//   1. registrar cada llamada facturable (para saber cuanto cuesta cada marca)
//   2. frenar a una marca que ya llego al tope de su plan
//
// Regla de oro: medir NUNCA puede romper una generacion. Si el registro falla,
// se loguea y se sigue. Frenar por tope, en cambio, si corta — pero con un error
// limpio y accionable, no con un 500.

import { supabase } from './supabase.js';
import { AppError } from './errors.js';
import { imageCostUsd, planFor, textCostUsd, videoCostUsd } from './plans.js';

function enforcementOn() {
  return process.env.PLAN_LIMITS_ENFORCED !== 'false';
}

// Primer dia del mes corriente, en UTC. El mes calendario es lo que entiende
// quien paga: "mi plan se renueva el 1".
export function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export async function recordUsage({ brandId, kind, quantity = 1, costUsd = 0, provider = null, model = null, postId = null }) {
  if (!brandId || !kind) return null;
  try {
    const { error } = await supabase.from('usage_events').insert({
      brand_id: brandId,
      kind,
      quantity,
      cost_usd: Math.round(costUsd * 10000) / 10000,
      provider,
      model,
      post_id: postId
    });
    if (error) throw error;
  } catch (error) {
    console.warn(`[usage] no se pudo registrar ${kind} de ${brandId}: ${error.message}`);
  }
  return null;
}

export async function recordImageUsage({ brandId, postId, images = 1 }) {
  return recordUsage({
    brandId,
    postId,
    kind: 'image',
    quantity: images,
    costUsd: imageCostUsd() * images,
    provider: 'openai',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
  });
}

export async function recordVideoUsage({ brandId, postId, engine, seconds = 10 }) {
  return recordUsage({
    brandId,
    postId,
    kind: 'video',
    quantity: seconds,
    costUsd: videoCostUsd(engine, seconds),
    provider: 'gemini',
    model: engine || 'omni'
  });
}

export async function recordTextUsage({ brandId, generations = 1 }) {
  return recordUsage({
    brandId,
    kind: 'ideas',
    quantity: generations,
    costUsd: textCostUsd(generations),
    provider: 'openai',
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini'
  });
}

// Consumo del mes corriente de una marca, ya agregado por tipo.
export async function monthUsage(brandId, { since = monthStart() } = {}) {
  const empty = { posts: 0, videos: 0, images: 0, videoSeconds: 0, costUsd: 0, since };
  if (!brandId) return empty;

  const { data, error } = await supabase
    .from('usage_events')
    .select('kind, quantity, cost_usd')
    .eq('brand_id', brandId)
    .gte('created_at', since);

  if (error || !data) {
    console.warn(`[usage] no se pudo leer el consumo de ${brandId}: ${error?.message}`);
    return empty;
  }

  return data.reduce((acc, row) => {
    const qty = Number(row.quantity) || 0;
    acc.costUsd += Number(row.cost_usd) || 0;
    if (row.kind === 'post') acc.posts += qty;
    if (row.kind === 'image') acc.images += qty;
    if (row.kind === 'video') { acc.videos += 1; acc.videoSeconds += qty; }
    return acc;
  }, { ...empty });
}

// Estado completo del plan de una marca: lo que incluye, lo que va consumido y
// cuanto queda. Es lo que alimenta la tarjeta del dashboard.
export async function planStatus(brand) {
  const plan = planFor(brand);
  const usage = await monthUsage(brand?.id);
  const left = (cap, used) => (cap === null ? null : Math.max(0, cap - used));

  return {
    plan: { id: plan.id, name: plan.name, price_usd: plan.priceUsd, blurb: plan.blurb },
    limits: { posts: plan.posts, videos: plan.videos, brands: plan.brands },
    used: {
      posts: usage.posts,
      videos: usage.videos,
      images: usage.images,
      video_seconds: usage.videoSeconds
    },
    left: { posts: left(plan.posts, usage.posts), videos: left(plan.videos, usage.videos) },
    cost_usd: Math.round(usage.costUsd * 100) / 100,
    margin_usd: Math.round((plan.priceUsd - usage.costUsd) * 100) / 100,
    period_start: usage.since,
    enforced: enforcementOn()
  };
}

const LIMIT_COPY = {
  post: (plan) => `Llegaste a los ${plan.posts} posts del plan ${plan.name} este mes. Pasa a un plan mayor para seguir generando.`,
  video: (plan) => `Llegaste a los ${plan.videos} video${plan.videos === 1 ? '' : 's'} del plan ${plan.name} este mes. Pasa a un plan mayor para generar mas.`
};

// Corta antes de gastar. `kind` es 'post' o 'video'.
export async function assertWithinPlan(brand, kind) {
  if (!enforcementOn()) return;

  const plan = planFor(brand);
  const cap = kind === 'video' ? plan.videos : plan.posts;
  if (cap === null) return;

  const usage = await monthUsage(brand.id);
  const used = kind === 'video' ? usage.videos : usage.posts;
  if (used < cap) return;

  throw new AppError(LIMIT_COPY[kind](plan), 402, 'PLAN_LIMIT');
}
