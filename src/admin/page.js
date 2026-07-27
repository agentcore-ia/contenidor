// Panel de operacion. Reusa la sesion del dashboard (mismo origen, misma clave
// de localStorage): si no hay sesion, manda a la app a loguearse.

const SESSION_KEY = 'contenidor_session';
const S = { days: 30, data: null };

const byId = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const num = (value) => Number(value || 0).toLocaleString('es-AR');
const usd = (value) => `US$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

async function api(path) {
  const sess = session();
  if (!sess?.access_token) {
    location.href = '/dashboard';
    throw new Error('sin sesion');
  }
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${sess.access_token}` },
    cache: 'no-store'
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Error ${res.status}`);
  }
  return body;
}

// Los slugs de la base no son para leer: se traducen antes de mostrarlos.
const STATUS_LABEL = {
  pending: 'Pendiente', generated: 'Generado', needs_review: 'Esperando revision',
  approved: 'Aprobado', posted: 'Publicado', rejected: 'Rechazado', skipped: 'Salteado'
};
const TYPE_LABEL = {
  image: 'Post simple', carousel: 'Carrusel', story: 'Historia',
  ugc_video: 'Video UGC', product_video: 'Video de producto'
};
const label = (dict) => (item) => ({ ...item, name: dict[item.name] || item.name });

// --- Piezas de UI ------------------------------------------------------------

function kpi({ label, value, note, tone = '' }) {
  return `<div class="card">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value ${tone}">${value}</div>
    ${note ? `<div class="kpi-note">${esc(note)}</div>` : ''}
  </div>`;
}

// Sparkline sin librerias: un path para la linea y otro para el area.
function spark(series) {
  const values = series.map((point) => point.value);
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const w = 300;
  const h = 50;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((value, i) => [i * step, h - (value / max) * h]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${area}" /><path class="line" d="${line}" />
  </svg>`;
}

function funnelBlock(steps) {
  const top = steps[0]?.value || 0;
  return `<div class="funnel">${steps.map((step, i) => {
    const prev = i ? steps[i - 1].value : null;
    const pct = top ? Math.round((step.value / top) * 100) : 0;
    const drop = prev !== null && prev > 0 ? Math.round((step.value / prev) * 100) : null;
    return `<div class="fn-row">
      <div class="fn-label">${esc(step.step)}${step.note ? `<small>${esc(step.note)}</small>` : ''}</div>
      <div class="fn-value">${num(step.value)}${drop !== null ? `<small>${drop}% del paso anterior</small>` : ''}</div>
      <div class="fn-track"><div class="fn-fill" style="width:${Math.max(pct, step.value ? 2 : 0)}%"></div></div>
    </div>`;
  }).join('')}</div>`;
}

function rowsBlock(items, { emptyText = 'Sin datos todavia', format = num } = {}) {
  if (!items?.length) return `<div class="empty">${esc(emptyText)}</div>`;
  return `<div class="rows">${items.map((item) => `<div class="row">
    <span>${esc(item.name)}</span><b>${format(item.value)}</b>
  </div>`).join('')}</div>`;
}

function usageBar(used, cap) {
  const ratio = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = ratio >= 100 ? 'over' : (ratio >= 80 ? 'warn' : '');
  return `<div class="bar ${tone}"><i style="width:${Math.max(ratio, used ? 3 : 0)}%"></i></div>`;
}

function brandsTable(brands) {
  if (!brands.length) return '<div class="empty">Todavia no hay marcas.</div>';
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Marca</th><th>Plan</th><th>Duena</th><th>Instagram</th>
      <th class="num">Posts del mes</th><th></th>
      <th class="num">Imagenes</th><th class="num">Videos</th>
      <th class="num">Publicados</th><th class="num">Errores</th>
      <th class="num">Costo</th><th class="num">Margen si pagara</th>
    </tr></thead>
    <tbody>${brands.map((brand) => `<tr>
      <td class="name">${esc(brand.name)}</td>
      <td><span class="chip">${esc(brand.plan)}</span></td>
      <td class="dim">${esc(brand.owner_email || '—')}</td>
      <td class="dim">${brand.ig_username ? `@${esc(brand.ig_username)}` : '—'}</td>
      <td class="num">${num(brand.posts_month)} / ${num(brand.posts_cap)}</td>
      <td style="width:90px">${usageBar(brand.posts_month, brand.posts_cap)}</td>
      <td class="num">${num(brand.images_month)}</td>
      <td class="num">${num(brand.videos_month)}</td>
      <td class="num">${num(brand.published_period)}</td>
      <td class="num">${brand.errors ? `<span class="chip bad">${num(brand.errors)}</span>` : '0'}</td>
      <td class="num">${usd(brand.cost_usd)}</td>
      <td class="num">${brand.margin_usd < 0 ? `<span class="chip bad">${usd(brand.margin_usd)}</span>` : usd(brand.margin_usd)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// --- Render ------------------------------------------------------------------

function render() {
  const d = S.data;
  if (!d) return;

  const b = d.business;
  const t = d.traffic;
  const h = d.health;
  const alerts = [
    [h.render_errors, 'imagenes que fallaron'],
    [h.publish_errors, 'publicaciones que fallaron'],
    [h.videos_error, 'videos con error'],
    [h.onboarding_stuck, 'onboardings trabados'],
    [h.tokens_expiring, 'tokens de Instagram por vencer']
  ].filter(([count]) => count > 0);

  byId('app').innerHTML = `
    <h2 class="section">Negocio</h2>
    ${b.billing_connected ? '' : `<div class="card notice">
      <b>Todavia no hay cobro conectado.</b> Ninguna marca esta pagando, asi que no hay MRR real que mostrar.
      De lista, las ${num(b.brands_on_paid_plan)} marcas en plan pago sumarian ${usd(b.mrr_simulated_usd)} al mes —
      es una simulacion, no un ingreso: hoy los planes estan asignados por operacion.
    </div>`}
    <div class="grid g-kpi">
      ${kpi({ label: 'Marcas activas este mes', value: `${num(b.active_brands)} / ${num(b.brands)}`, note: 'generaron algo en el mes en curso' })}
      ${kpi({ label: 'Costo del mes', value: usd(b.cost_month_usd), note: 'estimado con las tarifas de OpenAI y Google' })}
      ${kpi({ label: 'Costo por marca activa', value: usd(b.cost_per_active_brand_usd), tone: b.cost_per_active_brand_usd > 15 ? 'warn' : 'good', note: 'contra US$15 del plan mas barato' })}
      ${kpi({ label: 'Cuentas · marcas', value: `${num(b.owners)} · ${num(b.brands)}`, note: 'duenos unicos y marcas totales' })}
    </div>

    <div class="grid g-2" style="margin-top:14px">
      <div class="card">
        <h3>Marcas por plan</h3>
        ${rowsBlock(b.by_plan.map((plan) => ({ name: `${plan.name}${plan.price_usd ? ` · US$${plan.price_usd}` : ' · gratis'}`, value: plan.brands })))}
      </div>
      <div class="card">
        <h3>Costo diario (${d.period_days} dias)</h3>
        ${spark(d.series.cost)}
        <div class="kpi-note">Pico: ${usd(Math.max(...d.series.cost.map((p) => p.value), 0))} en un dia</div>
      </div>
    </div>

    <h2 class="section">Embudo · ultimos ${d.period_days} dias</h2>
    <div class="grid g-2">
      <div class="card">${funnelBlock(d.funnel)}</div>
      <div class="card">
        <h3>Visitas diarias a la landing</h3>
        ${spark(d.series.visits)}
        <div class="rows" style="margin-top:14px">
          <div class="row"><span>Visitas totales</span><b>${num(t.views)}</b></div>
          <div class="row"><span>Visitantes unicos</span><b>${num(t.unique_visitors)}</b></div>
          <div class="row"><span>Probaron la demo</span><b>${num(t.demos)}</b></div>
          <div class="row"><span>Clics a crear cuenta</span><b>${num(t.cta_clicks)}</b></div>
        </div>
      </div>
    </div>

    <div class="grid g-2" style="margin-top:14px">
      <div class="card">
        <h3>De donde llegan</h3>
        ${rowsBlock(t.referrers, { emptyText: 'Todavia no hay visitas con origen conocido' })}
      </div>
      <div class="card">
        <h3>Paises</h3>
        ${rowsBlock(t.countries, { emptyText: 'Sin datos de pais (los aporta Cloudflare)' })}
      </div>
    </div>

    <h2 class="section">Contenido · ultimos ${d.period_days} dias</h2>
    <div class="grid g-kpi">
      ${kpi({ label: 'Piezas generadas', value: num(d.content.posts_period) })}
      ${kpi({ label: 'Publicadas en Instagram', value: num(d.content.published_period) })}
      ${kpi({ label: 'Marcas con Instagram', value: `${num(h.ig_connected)} / ${num(b.brands)}` })}
      ${kpi({ label: 'Marcas con WhatsApp', value: `${num(h.whatsapp_ready)} / ${num(b.brands)}` })}
    </div>
    <div class="grid g-2" style="margin-top:14px">
      <div class="card"><h3>Por estado</h3>${rowsBlock(d.content.by_status.map(label(STATUS_LABEL)))}</div>
      <div class="card"><h3>Por formato</h3>${rowsBlock(d.content.by_type.map(label(TYPE_LABEL)))}</div>
    </div>

    <h2 class="section">Salud</h2>
    <div class="grid g-kpi">
      ${kpi({ label: 'Fallas de imagen', value: num(h.render_errors), tone: h.render_errors ? 'bad' : 'good' })}
      ${kpi({ label: 'Fallas al publicar', value: num(h.publish_errors), tone: h.publish_errors ? 'bad' : 'good' })}
      ${kpi({ label: 'Videos con error', value: num(h.videos_error), tone: h.videos_error ? 'bad' : 'good', note: `${num(h.videos_processing)} generandose ahora` })}
      ${kpi({ label: 'Tokens por vencer', value: num(h.tokens_expiring), tone: h.tokens_expiring ? 'warn' : 'good', note: 'Instagram, proximos 10 dias' })}
    </div>
    ${alerts.length ? `<div class="card" style="margin-top:14px">
      <h3>Cosas para mirar</h3>
      ${rowsBlock(alerts.map(([count, label]) => ({ name: label, value: count })))}
    </div>` : ''}

    <h2 class="section">Marcas</h2>
    ${brandsTable(d.brands)}

    <p class="foot">
      Consumo y costo del mes calendario en curso; el resto, ultimos ${d.period_days} dias.
      El costo es una estimacion con las tarifas cargadas en el servidor — la cifra exacta esta en la factura de cada proveedor.
      Actualizado ${new Date(d.generated_at).toLocaleString('es-AR')}.
    </p>`;
}

function renderRange() {
  byId('range').innerHTML = [7, 30, 90]
    .map((days) => `<button class="seg-opt ${S.days === days ? 'active' : ''}" data-days="${days}">${days}d</button>`)
    .join('');
}

async function load() {
  renderRange();
  try {
    S.data = await api(`/api/admin/overview?days=${S.days}`);
    render();
  } catch (error) {
    byId('app').innerHTML = `<div class="error-box">${esc(error.message)}</div>`;
  }
}

byId('range').addEventListener('click', (ev) => {
  const days = ev.target.dataset?.days;
  if (!days) return;
  S.days = Number(days);
  load();
});
byId('reload').addEventListener('click', load);

load();
