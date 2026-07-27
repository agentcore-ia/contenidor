// Planes, topes y precios de proveedor. Fuente unica de verdad: si un tope o un
// precio se toca, se toca aca y no en seis lugares.

// Topes MENSUALES por marca. `posts` cuenta piezas generadas (un carrusel es un
// post, no cinco); `videos` cuenta videos generados. `brands` es cuantas marcas
// puede tener una cuenta con ese plan.
//
// Los precios son la propuesta actual, no un numero cerrado: cambiarlos aca los
// cambia en el dashboard y en la landing.
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Prueba',
    priceUsd: 0,
    posts: 8,
    videos: 1,
    brands: 1,
    blurb: '8 posts para ver como escribe y disena para tu marca.'
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUsd: 15,
    posts: 30,
    videos: 2,
    brands: 1,
    blurb: 'Un post por dia para una marca.'
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 39,
    posts: 90,
    videos: 8,
    brands: 3,
    blurb: 'Tres marcas, carruseles e historias, videos incluidos.'
  },
  agency: {
    id: 'agency',
    name: 'Agencia',
    priceUsd: 99,
    posts: 300,
    videos: 30,
    brands: 15,
    blurb: 'Para quien maneja las redes de varios clientes.'
  }
};

export const DEFAULT_PLAN = 'trial';

export function planFor(brand) {
  return PLANS[brand?.plan] || PLANS[DEFAULT_PLAN];
}

// --- Precios de proveedor (USD) ----------------------------------------------
// ESTIMACIONES, override por env. Sirven para comparar el costo entre marcas y
// para ver si un plan se esta comiendo el margen; la cifra exacta esta en la
// factura de OpenAI/Google, no aca. Revisalos cuando cambien las tarifas.
const num = (envKey, fallback) => {
  const value = Number(process.env[envKey]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

// gpt-image-2, por imagen generada, segun la calidad pedida.
export function imageCostUsd(quality = 'high') {
  const table = {
    low: num('COST_IMAGE_LOW', 0.02),
    medium: num('COST_IMAGE_MEDIUM', 0.07),
    high: num('COST_IMAGE_HIGH', 0.19)
  };
  return table[quality] ?? table.high;
}

// Gemini, por SEGUNDO de video. Los comentarios de src/gemini.js documentan de
// donde sale cada tarifa.
export function videoCostUsd(engine = 'omni', seconds = 10) {
  const table = {
    veo_lite: num('COST_VIDEO_VEO_LITE', 0.05),
    omni: num('COST_VIDEO_OMNI', 0.10),
    veo_fast: num('COST_VIDEO_VEO_FAST', 0.10),
    veo: num('COST_VIDEO_VEO', 0.40)
  };
  const perSecond = table[engine] ?? table.omni;
  return perSecond * (Number(seconds) || 10);
}

// Una tanda de ideas/copy con gpt-5.4-mini. Es el costo chico del sistema; se
// mide igual para que el total del mes no mienta.
export function textCostUsd(generations = 1) {
  return num('COST_TEXT_GENERATION', 0.01) * (Number(generations) || 1);
}
