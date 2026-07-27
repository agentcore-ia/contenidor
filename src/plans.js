// Planes, topes y precios de proveedor. Fuente unica de verdad: si un tope o un
// precio se toca, se toca aca y no en seis lugares.
//
// IMPORTANTE: estos numeros son la promesa comercial que ya esta publicada en
// landing/index.html (seccion #precios y el FAQ de precios). Si cambias un tope
// aca, cambialo tambien alla — vender 30 piezas y entregar 15 es lo que hace que
// te pidan la baja.

// Topes MENSUALES por marca. `posts` cuenta piezas generadas (un carrusel es una
// pieza, no cinco); `videos` cuenta videos generados. `brands` es cuantas marcas
// admite el plan — hoy informativo, todavia no se aplica.
export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Prueba',
    priceUsd: 0,
    // La prueba se regala a perdida (~US$3,3 por cuenta): es costo de
    // adquisicion, no un plan. El video es US$1 de esos 3,3 y es lo que mas
    // convierte, por eso queda.
    posts: 12,
    videos: 1,
    brands: 1,
    blurb: 'Tu primera semana: 5 posts con sus historias, sin tarjeta.'
  },
  starter: {
    id: 'starter',
    name: 'Emprendedor',
    priceUsd: 15,
    posts: 15,
    videos: 1,
    brands: 1,
    blurb: '15 piezas por mes para una marca.'
  },
  business: {
    id: 'business',
    name: 'Negocio',
    priceUsd: 39,
    posts: 30,
    videos: 4,
    brands: 1,
    blurb: '30 piezas y 4 videos por mes, con carruseles e historias.'
  },
  agency: {
    id: 'agency',
    name: 'Agencia',
    priceUsd: 99,
    // La landing promete "piezas sin limite practico". El techo real es 250:
    // son 50 piezas por marca al mes (~1,7 por dia cada una), bastante arriba
    // del uso real de una agencia que publica a diario, y deja el costo en el
    // peor caso en ~US$58 contra US$99. Con 500 el plan perderia plata en el
    // tope: 500 imagenes en alta ya cuestan mas que la suscripcion.
    posts: 250,
    videos: 10,
    brands: 5,
    blurb: 'Hasta 5 marcas, piezas sin limite practico.'
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
