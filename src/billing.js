// Cobro con Mercado Pago (suscripciones / preapproval).
//
// Probado contra la API real de MP (2026-07-29): crear preapproval, guardar la
// fila, webhook con estado pending, y cancelar. Lo unico que falta ver con un
// pago real es el paso a 'authorized' — ocurre con el primer cliente.
//
// Como funciona:
//   1. /api/billing/checkout crea un preapproval y devuelve el link de pago.
//   2. El usuario paga en Mercado Pago.
//   3. MP pega en /webhooks/mercadopago; ahi se consulta el estado real contra
//      la API (nunca se confia en el cuerpo del webhook) y recien entonces se
//      cambia el plan de la marca.
//
// Si no hay MP_ACCESS_TOKEN, todo queda desactivado y las rutas responden 503.

import { supabase, updateBrandFields } from './supabase.js';
import { AppError } from './errors.js';
import { PLANS } from './plans.js';
import { alertOps } from './ops.js';

const API = 'https://api.mercadopago.com';

export function billingConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function assertConfigured() {
  if (!billingConfigured()) {
    throw new AppError('El cobro todavia no esta habilitado.', 503, 'BILLING_NOT_CONFIGURED');
  }
}

async function mp(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new AppError(
      `Mercado Pago ${res.status}: ${data?.message || text.slice(0, 200)}`,
      res.status >= 500 ? 502 : 400,
      'MP_ERROR'
    );
  }
  return data;
}

// Los planes estan en dolares y Mercado Pago cobra en pesos. La cotizacion se
// carga a mano (MP_USD_ARS) a proposito: una API de cambio que se cae o que
// devuelve un numero raro no puede terminar cobrandole de mas a un cliente.
export function priceArs(plan) {
  const rate = Number(process.env.MP_USD_ARS || 0);
  if (!rate) throw new AppError('Falta configurar MP_USD_ARS (pesos por dolar).', 503, 'NO_FX_RATE');
  return Math.round(plan.priceUsd * rate);
}

export async function createCheckout({ brand, user, planId, backUrl }) {
  assertConfigured();

  const plan = PLANS[planId];
  if (!plan || plan.priceUsd <= 0) throw new AppError('Plan invalido', 400, 'BAD_PLAN');

  // Una marca tiene una sola suscripcion viva. Si hay una AUTORIZADA, el
  // cliente tiene que cancelarla primero (no le cobramos dos veces por las
  // dudas). Si hay una PENDIENTE, es un checkout que quedo a medias o un
  // cambio de opinion: se cancela sola y se sigue — obligar al cliente a
  // limpiarla a mano es perder la venta en el momento exacto en que queria
  // pagar.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('preapproval_id, status')
    .eq('brand_id', brand.id)
    .in('status', ['pending', 'authorized'])
    .maybeSingle();

  if (existing?.status === 'authorized') {
    throw new AppError('Esta marca ya tiene una suscripcion activa. Cancelala primero desde Ajustes.', 409, 'ALREADY_SUBSCRIBED');
  }
  if (existing) {
    await mp(`/preapproval/${encodeURIComponent(existing.preapproval_id)}`, { method: 'PUT', body: { status: 'cancelled' } }).catch(() => {});
    await supabase.from('subscriptions')
      .update({ status: 'cancelled', last_event_at: new Date().toISOString() })
      .eq('preapproval_id', existing.preapproval_id);
  }

  const amount = priceArs(plan);
  const preapproval = await mp('/preapproval', {
    method: 'POST',
    body: {
      reason: `Postia ${plan.name} · ${brand.name}`,
      external_reference: brand.id,
      payer_email: user.email,
      back_url: backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'ARS'
      },
      status: 'pending'
    }
  });

  // Si nuestra fila no se guarda, el webhook nunca va a poder activar el plan:
  // mejor fallar aca, ruidoso, que dejar un preapproval huerfano en MP.
  const { error } = await supabase.from('subscriptions').upsert({
    brand_id: brand.id,
    owner_id: user.id,
    plan: plan.id,
    status: 'pending',
    preapproval_id: preapproval.id,
    payer_email: user.email,
    amount_ars: amount,
    last_event_at: new Date().toISOString()
  }, { onConflict: 'preapproval_id' });

  if (error) {
    await alertOps('cobro', `Se creo el preapproval ${preapproval.id} en MP pero no se pudo guardar la suscripcion: ${error.message}`);
    // Se intenta cancelar el preapproval para no dejar basura en MP; si tambien
    // falla, el alert de arriba ya aviso y queda para limpiar a mano.
    await mp(`/preapproval/${encodeURIComponent(preapproval.id)}`, { method: 'PUT', body: { status: 'cancelled' } }).catch(() => {});
    throw new AppError('No se pudo registrar la suscripcion. Proba de nuevo.', 500, 'SUBSCRIPTION_SAVE_FAILED');
  }

  return {
    checkout_url: preapproval.init_point || preapproval.sandbox_init_point,
    preapproval_id: preapproval.id,
    plan: plan.id,
    amount_ars: amount
  };
}

// Mercado Pago -> nuestro vocabulario.
const STATUS_MAP = {
  authorized: 'authorized',
  pending: 'pending',
  paused: 'paused',
  cancelled: 'cancelled'
};

// Consulta el estado REAL contra la API y sincroniza el plan de la marca.
// Nunca se confia en lo que viene en el cuerpo del webhook: cualquiera puede
// pegarle a esa URL.
export async function syncPreapproval(preapprovalId) {
  assertConfigured();
  if (!preapprovalId) throw new AppError('Falta el id de suscripcion', 400, 'NO_PREAPPROVAL');

  const remote = await mp(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const status = STATUS_MAP[remote.status] || 'pending';
  const brandId = remote.external_reference;

  const { data: row } = await supabase
    .from('subscriptions')
    .select('id, brand_id, plan')
    .eq('preapproval_id', preapprovalId)
    .maybeSingle();

  const plan = row?.plan && PLANS[row.plan] ? row.plan : null;
  const targetBrand = row?.brand_id || brandId;

  await supabase.from('subscriptions').update({
    status,
    last_event_at: new Date().toISOString()
  }).eq('preapproval_id', preapprovalId);

  if (!targetBrand || !plan) {
    await alertOps('cobro', `Llego un webhook de MP (${preapprovalId}) sin suscripcion nuestra asociada.`);
    return { status, applied: false };
  }

  // Autorizada -> la marca sube al plan pago. Cancelada/pausada/rechazada ->
  // vuelve a prueba: si dejo de pagar, pierde la capacidad del plan.
  //
  // 'pending' NO toca el plan: es el estado normal MIENTRAS el cliente esta
  // pagando, y MP puede mandar un webhook en ese momento — si lo tratamos como
  // terminal, le pisamos el plan a una marca en medio del checkout.
  if (status === 'pending') {
    console.log(`[billing] ${preapprovalId} -> pending; el plan de ${targetBrand} no se toca`);
    return { status, applied: false, reason: 'pending no cambia el plan' };
  }

  const nextPlan = status === 'authorized' ? plan : 'trial';
  await updateBrandFields(targetBrand, { plan: nextPlan });

  console.log(`[billing] ${preapprovalId} -> ${status}; marca ${targetBrand} queda en ${nextPlan}`);
  return { status, applied: true, brand_id: targetBrand, plan: nextPlan };
}

export async function cancelSubscription(brand) {
  assertConfigured();

  const { data: row } = await supabase
    .from('subscriptions')
    .select('preapproval_id')
    .eq('brand_id', brand.id)
    .in('status', ['pending', 'authorized'])
    .maybeSingle();

  if (!row?.preapproval_id) throw new AppError('Esta marca no tiene una suscripcion activa.', 404, 'NO_SUBSCRIPTION');

  await mp(`/preapproval/${encodeURIComponent(row.preapproval_id)}`, {
    method: 'PUT',
    body: { status: 'cancelled' }
  });

  await supabase.from('subscriptions')
    .update({ status: 'cancelled', last_event_at: new Date().toISOString() })
    .eq('preapproval_id', row.preapproval_id);

  await updateBrandFields(brand.id, { plan: 'trial' });
  return { cancelled: true };
}

export async function subscriptionFor(brandId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, amount_ars, currency, preapproval_id, created_at')
    .eq('brand_id', brandId)
    .in('status', ['pending', 'authorized', 'paused'])
    .maybeSingle();
  return data || null;
}
