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

// Estado del plan de una marca para el CLIENTE: lo que incluye, lo consumido y
// lo que queda. A proposito NO incluye nuestro costo ni el margen — eso es
// informacion del negocio y vive solo en el panel de operador (/admin).
export async function planStatus(brand) {
  const plan = planFor(brand);
  const usage = await monthUsage(brand?.id);
  const left = (cap, used) => (cap === null ? null : Math.max(0, cap - used));

  return {
    plan: { id: plan.id, name: plan.name, price_usd: plan.priceUsd, blurb: plan.blurb },
    trial_ends_at: plan.id === 'trial' ? (brand?.trial_ends_at || null) : null,
    trial_expired: trialExpired(brand),
    limits: { posts: plan.posts, videos: plan.videos, brands: plan.brands },
    used: {
      posts: usage.posts,
      videos: usage.videos,
      images: usage.images,
      video_seconds: usage.videoSeconds
    },
    left: { posts: left(plan.posts, usage.posts), videos: left(plan.videos, usage.videos) },
    period_start: usage.since,
    enforced: enforcementOn()
  };
}

const LIMIT_COPY = {
  post: (plan) => `Llegaste a los ${plan.posts} posts del plan ${plan.name} este mes. Pasa a un plan mayor para seguir generando.`,
  video: (plan) => `Llegaste a los ${plan.videos} video${plan.videos === 1 ? '' : 's'} del plan ${plan.name} este mes. Pasa a un plan mayor para generar mas.`
};

// La prueba vencio si la marca esta en trial y paso su fecha. Sin fecha (marcas
// de antes de esta regla) la prueba no vence: no se le cambian las condiciones
// a alguien retroactivamente.
export function trialExpired(brand) {
  if (planFor(brand).id !== 'trial') return false;
  if (!brand?.trial_ends_at) return false;
  return new Date(brand.trial_ends_at).getTime() < Date.now();
}

// Corta antes de gastar. `kind` es 'post' o 'video'.
export async function assertWithinPlan(brand, kind) {
  if (!enforcementOn()) return;

  // La prueba es UNA semana, no una mensualidad renovable: vencida, se genera
  // nuevo contenido solo con un plan pago. Lo ya generado no se toca.
  if (trialExpired(brand)) {
    throw new AppError(
      'Tu semana de prueba termino. Elegi un plan en Ajustes para seguir generando contenido — lo que ya creaste queda tuyo.',
      402,
      'TRIAL_EXPIRED'
    );
  }

  const plan = planFor(brand);
  const cap = kind === 'video' ? plan.videos : plan.posts;
  if (cap === null) return;

  // El tope de la prueba tampoco se reinicia por mes: es el total de la semana.
  const usage = await monthUsage(brand.id, plan.id === 'trial' ? { since: brand.created_at || monthStart() } : {});
  const used = kind === 'video' ? usage.videos : usage.posts;
  if (used < cap) return;

  throw new AppError(LIMIT_COPY[kind](plan), 402, 'PLAN_LIMIT');
}

// --- Tope de marcas por CUENTA -----------------------------------------------
// Los topes de piezas y videos se miden por marca. Sin un limite de marcas por
// cuenta eso se esquiva solo: alguien en Emprendedor (15 piezas) crea diez
// marcas y se lleva 150 piezas por los mismos US$15. Este es el cierre de ese
// agujero.
//
// El plan de una CUENTA es el mas alto de sus marcas — si pago un plan mayor
// para una marca, esa capacidad es de la cuenta. Sin marcas todavia, prueba.
export function accountPlan(brands = []) {
  const plans = brands.map((brand) => planFor(brand));
  if (!plans.length) return planFor(null);
  return plans.reduce((best, plan) => (plan.brands > best.brands ? plan : best), plans[0]);
}

export async function assertCanCreateBrand(user, { isOperator = false } = {}) {
  // El operador de Postia maneja las marcas de demo y soporte; no se le aplica.
  if (isOperator || !enforcementOn()) return;

  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, plan')
    .eq('owner_id', user.id);

  if (error) {
    console.warn(`[usage] no se pudo contar las marcas de ${user.id}: ${error.message}`);
    return; // ante la duda no se bloquea a alguien que quiere empezar
  }

  const plan = accountPlan(brands || []);
  const used = brands?.length || 0;
  if (used < plan.brands) return;

  throw new AppError(
    plan.brands === 1
      ? `El plan ${plan.name} incluye una marca. Pasa a un plan mayor para manejar varias.`
      : `Llegaste a las ${plan.brands} marcas del plan ${plan.name}. Pasa a un plan mayor para agregar mas.`,
    402,
    'PLAN_BRAND_LIMIT'
  );
}
