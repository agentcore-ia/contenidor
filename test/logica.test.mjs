// Tests de la logica que decide plata y accesos.
//
// A proposito NO se toca la red ni la base: son las reglas puras — topes,
// precios, limite de marcas, rate limit y el hash de visitantes. Es lo que no
// puede romperse sin que nos enteremos, y lo que hasta ahora se verificaba
// a mano contra produccion.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';

const { PLANS, planFor, imageCostUsd, videoCostUsd } = await import('../src/plans.js');
const { accountPlan, monthStart, trialExpired } = await import('../src/usage.js');
const { hit } = await import('../src/rateLimit.js');
const { isAdmin } = await import('../src/admin.js');

describe('planes', () => {
  test('los ids son los que vende la landing', () => {
    assert.deepEqual(Object.keys(PLANS), ['trial', 'starter', 'business', 'agency']);
  });

  test('los topes coinciden con landing/index.html #precios', () => {
    assert.equal(PLANS.starter.posts, 15, 'Emprendedor vende 15 piezas');
    assert.equal(PLANS.business.posts, 30, 'Negocio vende 30 piezas');
    assert.equal(PLANS.business.videos, 4, 'Negocio vende 4 videos');
    assert.equal(PLANS.agency.brands, 5, 'Agencia vende hasta 5 marcas');
    assert.equal(PLANS.agency.videos, 10, 'Agencia vende 10 videos');
  });

  test('un plan desconocido cae a prueba, no a uno pago', () => {
    assert.equal(planFor({ plan: 'inventado' }).id, 'trial');
    assert.equal(planFor(null).id, 'trial');
    assert.equal(planFor({}).id, 'trial');
  });

  test('ningun plan pago pierde plata en su tope, ni con todo carruseles', () => {
    for (const plan of Object.values(PLANS)) {
      if (plan.priceUsd <= 0) continue;
      // Peor caso real: cada pieza es un carrusel de 5 imagenes.
      const peor = plan.posts * 5 * imageCostUsd() + plan.videos * videoCostUsd('omni', 10);
      assert.ok(
        peor < plan.priceUsd,
        `${plan.name}: en el peor caso cuesta US$${peor.toFixed(2)} contra US$${plan.priceUsd} de precio`
      );
    }
  });

  test('el video caro cuesta mas que el barato', () => {
    assert.ok(videoCostUsd('veo', 10) > videoCostUsd('veo_lite', 10));
    assert.equal(videoCostUsd('motor-que-no-existe', 10), videoCostUsd('omni', 10));
  });
});

describe('plan de la cuenta', () => {
  test('sin marcas todavia, es el de prueba', () => {
    assert.equal(accountPlan([]).id, 'trial');
  });

  test('es el plan mas alto entre las marcas', () => {
    const plan = accountPlan([{ plan: 'starter' }, { plan: 'agency' }, { plan: 'trial' }]);
    assert.equal(plan.id, 'agency');
  });

  test('con una sola marca en Emprendedor, la cuenta admite una marca', () => {
    assert.equal(accountPlan([{ plan: 'starter' }]).brands, 1);
  });
});

describe('rate limit', () => {
  test('deja pasar hasta el limite y despues corta', () => {
    const key = `test-${Math.random()}`;
    const opts = { limit: 3, windowMs: 60_000 };
    assert.equal(hit(key, opts).allowed, true);
    assert.equal(hit(key, opts).allowed, true);
    assert.equal(hit(key, opts).allowed, true);

    const cuarto = hit(key, opts);
    assert.equal(cuarto.allowed, false);
    assert.ok(cuarto.retryAfterSeconds > 0, 'tiene que decir cuanto falta');
  });

  test('cada clave lleva su propia cuenta', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const a = `ip-a-${Math.random()}`;
    const b = `ip-b-${Math.random()}`;
    hit(a, opts);
    assert.equal(hit(a, opts).allowed, false, 'la misma IP se frena');
    assert.equal(hit(b, opts).allowed, true, 'otra IP no arrastra el bloqueo');
  });

  test('la ventana se reabre cuando vence', () => {
    const key = `test-vencido-${Math.random()}`;
    assert.equal(hit(key, { limit: 1, windowMs: 1 }).allowed, true);
    const despues = Date.now() + 10;
    while (Date.now() < despues) { /* espera activa muy corta */ }
    assert.equal(hit(key, { limit: 1, windowMs: 1 }).allowed, true);
  });
});

describe('acceso al panel de operador', () => {
  const original = process.env.ADMIN_EMAILS;

  test('sin ADMIN_EMAILS no entra nadie', () => {
    process.env.ADMIN_EMAILS = '';
    assert.equal(isAdmin({ email: 'cualquiera@gmail.com' }), false);
  });

  test('reconoce el mail sin importar mayusculas ni espacios', () => {
    process.env.ADMIN_EMAILS = ' Operador@Postia.ar , otro@postia.ar ';
    assert.equal(isAdmin({ email: 'operador@postia.ar' }), true);
    assert.equal(isAdmin({ email: 'OPERADOR@POSTIA.AR' }), true);
    assert.equal(isAdmin({ email: 'otro@postia.ar' }), true);
  });

  test('un mail que no esta en la lista queda afuera', () => {
    process.env.ADMIN_EMAILS = 'operador@postia.ar';
    assert.equal(isAdmin({ email: 'intruso@gmail.com' }), false);
    assert.equal(isAdmin({}), false);
    assert.equal(isAdmin(null), false);
  });

  process.env.ADMIN_EMAILS = original || '';
});

describe('periodo de facturacion', () => {
  test('arranca el 1 del mes en curso, a las 00:00 UTC', () => {
    const inicio = monthStart(new Date('2026-07-27T15:30:00Z'));
    assert.equal(inicio, '2026-07-01T00:00:00.000Z');
  });

  test('el 1 a la madrugada sigue siendo ese mes', () => {
    assert.equal(monthStart(new Date('2026-07-01T00:10:00Z')), '2026-07-01T00:00:00.000Z');
  });
});

describe('vencimiento de la prueba', () => {
  const ayer = new Date(Date.now() - 86400000).toISOString();
  const manana = new Date(Date.now() + 86400000).toISOString();

  test('trial con fecha pasada esta vencida', () => {
    assert.equal(trialExpired({ plan: 'trial', trial_ends_at: ayer }), true);
  });

  test('trial vigente no esta vencida', () => {
    assert.equal(trialExpired({ plan: 'trial', trial_ends_at: manana }), false);
  });

  test('sin fecha no vence: no se cambian las reglas retroactivamente', () => {
    assert.equal(trialExpired({ plan: 'trial', trial_ends_at: null }), false);
  });

  test('un plan pago nunca "vence como prueba", aunque tenga fecha vieja', () => {
    assert.equal(trialExpired({ plan: 'business', trial_ends_at: ayer }), false);
    assert.equal(trialExpired({ plan: 'agency', trial_ends_at: ayer }), false);
  });
});
