const S = {
  tab: 'overview',
  brandId: null,
  templates: [],
  posts: [],
  calendar: [],
  categories: [],
  brands: [],
  inspirations: [],
  customTemplates: [],
  overview: null,
  system: null,
  automation: null,
  postFilter: 'all',
  searchQuery: '',
  userEmail: null,
  needsReviewPosts: [],
  onb: { step: 0, data: {} },
  calMonth: null,
  calView: 'agenda',
  calPosts: null,
};

const POST_STATUSES = ['generated', 'needs_review', 'approved', 'posted', 'rejected'];
const CAL_STATUSES = ['pending', 'generated', 'needs_review', 'approved', 'posted', 'rejected', 'skipped'];

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function byId(id) {
  return document.getElementById(id);
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  byId('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

const SESSION_KEY = 'contenidor_session';
const BRAND_KEY = 'contenidor_brand';

function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function storeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function rawApi(path, opts = {}) {
  const session = getStoredSession();
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (S.brandId) headers['x-brand-id'] = S.brandId;

  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok || data.success === false) {
    const error = new Error(data.error || `${res.status} ${res.statusText}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

let refreshing = null;
async function tryRefreshSession() {
  const session = getStoredSession();
  if (!session?.refresh_token) return false;
  refreshing = refreshing || fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  }).then(async (res) => {
    const data = await res.json();
    if (res.ok && data.session) { storeSession(data.session); return true; }
    return false;
  }).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

async function api(path, opts = {}) {
  try {
    return await rawApi(path, opts);
  } catch (error) {
    if (error.status === 401 && getStoredSession()) {
      if (await tryRefreshSession()) return rawApi(path, opts);
      storeSession(null);
      window.location.reload();
    }
    throw error;
  }
}

function modal(html) {
  const root = byId('modal-root');
  root.innerHTML = `<div class="modal-bg" onclick="closeModal()"></div><div class="modal">${html}</div>`;
  root.classList.add('open');
}

window.closeModal = function closeModal() {
  const root = byId('modal-root');
  root.classList.remove('open');
  root.innerHTML = '';
};

function statusBadge(status) {
  const safe = esc(status || 'unknown');
  return `<span class="status status-${safe}">${safe.replace(/_/g, ' ')}</span>`;
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
}

function showLoading(label = 'Cargando...') {
  byId('content').innerHTML = `<div class="loading-state">${esc(label)}</div>`;
}

function pageHead(title, subtitle = '', actions = '') {
  return `<div class="page-head">
    <div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="toolbar">${actions}</div>` : ''}
  </div>`;
}

function metric(label, value, note = '') {
  return `<div class="metric-card">
    <div class="metric-label">${esc(label)}</div>
    <div class="metric-value">${esc(value)}</div>
    ${note ? `<div class="metric-note">${esc(note)}</div>` : ''}
  </div>`;
}

function empty(label) {
  return `<div class="empty">${esc(label)}</div>`;
}

async function loadBootstrap() {
  const [templates, categories, brands] = await Promise.all([
    api('/api/templates'),
    api('/api/categories'),
    api('/api/brands'),
  ]);
  S.templates = templates.templates || [];
  S.categories = categories.categories || [];
  S.brands = brands.brands || [];
}

async function loadTab() {
  if (!S.brandId) {
    if (typeof renderNoBrand === 'function') renderNoBrand();
    return;
  }
  showLoading();
  try {
    if (S.tab === 'overview') await loadOverview();
    if (S.tab === 'posts') await loadPosts();
    if (S.tab === 'calendar') await loadCalendar();
    if (S.tab === 'analytics') await loadAnalytics();
    if (S.tab === 'brand') await loadBrand();
    if (S.tab === 'products') await loadProducts();
    if (S.tab === 'categories') await loadCategories();
    if (S.tab === 'design') await loadDesign();
    if (S.tab === 'system') await loadSystem();
  } catch (error) {
    byId('content').innerHTML = empty(error.message);
    toast(error.message, 'error');
  }
}

// Hash routing: each section lives at /dashboard#<tab> so refresh keeps you in
// place, back/forward navigate sections, and sections are linkable.
const NAV_TABS = [...document.querySelectorAll('.tab[data-tab]')];
const VALID_TABS = NAV_TABS.map((tab) => tab.dataset.tab);
// On mobile only 3 tabs live in the bottom bar; the rest sit behind "Mas".
const SECONDARY_TABS = NAV_TABS.filter((tab) => tab.dataset.nav === 'secondary').map((tab) => tab.dataset.tab);

function activateTab(tabName, { load = true } = {}) {
  const tab = VALID_TABS.includes(tabName) ? tabName : 'overview';
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
  // On mobile, light up "Mas" when the active section lives inside it.
  const moreBtn = document.querySelector('.tab-more');
  if (moreBtn) moreBtn.classList.toggle('active', SECONDARY_TABS.includes(tab));
  if (load) loadTab();
}

function currentHashTab() {
  return window.location.hash.replace(/^#\/?/, '') || 'overview';
}

NAV_TABS.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (currentHashTab() === tab.dataset.tab) activateTab(tab.dataset.tab);
    else window.location.hash = tab.dataset.tab;
  });
});

// Bottom-bar "Mas" sheet: lists the sections not shown in the mobile bar.
window.openMoreSheet = function openMoreSheet() {
  const items = SECONDARY_TABS.map((name) => {
    const btn = NAV_TABS.find((t) => t.dataset.tab === name);
    const label = btn.querySelector('span')?.textContent || name;
    const icon = btn.querySelector('svg')?.outerHTML || '';
    const active = S.tab === name ? ' active' : '';
    return `<button class="more-item${active}" onclick="goSection('${name}')">
      <span class="more-icon">${icon}</span>
      <span class="more-label">${esc(label)}</span>
      <svg class="more-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
    </button>`;
  }).join('');
  modal(`<div class="more-sheet">
    <h3>Todas las secciones</h3>
    <div class="more-list">${items}</div>
  </div>`);
};

window.goSection = function goSection(name) {
  closeModal();
  if (currentHashTab() === name) activateTab(name);
  else window.location.hash = name;
};

window.addEventListener('hashchange', () => activateTab(currentHashTab()));

const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.4 2.6a2 2 0 1 1 2.8 2.8L11 15.7 7 17l1.3-4L18.4 2.6Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4l-5.3 2.7 1-5.8L3.5 9.2l5.9-.9Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10.5h18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 4.6-5.3"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 20"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
};

async function loadOverview() {
  const overview = await api('/api/overview');
  S.overview = overview.overview;
  renderOverview();
}

function metricCard({ icon, tone = '', label, value, note, noteTone }) {
  return `<div class="metric-card">
    <div class="metric-top">
      <div class="metric-icon ${tone}">${icon}</div>
      <div class="metric-label">${esc(label)}</div>
    </div>
    <div class="metric-value">${esc(value)}</div>
    ${note ? `<div class="metric-note ${noteTone ? `metric-delta ${noteTone}` : ''}">${note}</div>` : ''}
  </div>`;
}

function deltaNote(current, previous, suffix) {
  if (!previous) return { text: `${current} ${suffix}`, tone: '' };
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (diff === 0) return { text: `Igual que antes`, tone: '' };
  const sign = diff > 0 ? '+' : '';
  return { text: `${sign}${pct}% vs periodo anterior`, tone: diff > 0 ? 'up' : 'down' };
}

function renderOverview() {
  const o = S.overview;
  const m = o.metrics;
  const today = o.today_item;
  const todayPost = o.today_post;
  const brand = S.brands.find((b) => b.id === S.brandId) || S.brands[0] || null;

  updateBellBadge(o.needs_review_posts || []);

  const postsWeekNote = deltaNote(m.posts_this_week, m.posts_last_week, 'esta semana');
  const monthNote = deltaNote(m.scheduled_this_month, m.scheduled_last_month, 'este mes');
  const approvalLabel = m.approval_rate === null ? '—' : `${m.approval_rate}%`;
  const approvalNote = m.approval_rate === null
    ? 'Sin revisiones todavia'
    : m.approval_rate >= 90 ? 'Excelente' : m.approval_rate >= 70 ? 'Buena' : 'A mejorar';
  const approvalTone = m.approval_rate === null ? '' : m.approval_rate >= 70 ? 'up' : 'down';

  const metrics = `<div class="grid metrics">
    ${metricCard({ icon: ICON.edit, label: 'Posts generados', value: m.posts_this_week, note: postsWeekNote.text, noteTone: postsWeekNote.tone })}
    ${metricCard({ icon: ICON.star, tone: 'tone-warn', label: 'Tasa de aprobacion', value: approvalLabel, note: approvalNote, noteTone: approvalTone })}
    ${metricCard({ icon: ICON.calendar, tone: 'tone-info', label: 'Programados este mes', value: m.scheduled_this_month, note: monthNote.text, noteTone: monthNote.tone })}
    ${metricCard({ icon: ICON.check, tone: 'tone-good', label: 'Creativos aprobados', value: m.approved_count, note: `${o.counts.posts} generados en total` })}
  </div>`;

  const creative = todayPost
    ? `<div class="creative-media">
        ${todayPost.image_url ? `<img src="${esc(todayPost.image_url)}" alt="" />` : `<div class="empty" style="border:0">${todayPost.render_error ? 'Error al generar la imagen' : 'Generando imagen...'}</div>`}
        <div class="platform-chip">${ICON.instagram}</div>
      </div>
      <div class="creative-info">
        <div>${statusBadge(todayPost.status)}</div>
        <div class="body-text">${esc(todayPost.caption_instagram || '')}</div>
        <div class="toolbar">
          <button class="btn btn-primary" onclick="showPost('${todayPost.id}')">Editar contenido</button>
          <button class="btn" onclick="regRender('${todayPost.id}')">Regenerar imagen</button>
        </div>
      </div>`
    : today
      ? `<div class="creative-media empty">
          ${ICON.image}
          <span>Todavia no se genero el creativo de hoy</span>
        </div>
        <div class="creative-info">
          <div class="title">${esc(today.topic)}</div>
          <div class="subtle">${esc(today.angle || '')}</div>
          <div class="toolbar">
            <button class="btn btn-primary" onclick="generateCalendar('${today.id}')">Generar ahora</button>
          </div>
        </div>`
      : `<div class="creative-media empty">${ICON.image}<span>Sin contenido cargado para hoy</span></div>
        <div class="creative-info"><div class="subtle">Agrega ideas al calendario para ver el creativo del dia.</div>
          <div class="toolbar"><button class="btn" onclick="setTab('calendar')">Ir al calendario</button></div>
        </div>`;

  const postLookup = new Map(o.recent_posts.map((post) => [post.id, post]));
  if (todayPost) postLookup.set(todayPost.id, todayPost);

  const upcoming = o.next_items.length
    ? o.next_items.map((item) => {
      const post = item.generated_post_id ? (postLookup.get(item.generated_post_id) || null) : null;
      const thumb = post?.image_url
        ? `<img class="thumb" src="${esc(post.image_url)}" alt="" />`
        : `<div class="thumb-empty">${ICON.image}</div>`;
      return `<div class="upcoming-row">
        <div class="date-chip">${fmtDate(item.publish_date)}</div>
        ${thumb}
        <div>
          <div class="title">${esc(item.topic)}</div>
          <div class="subtle">${esc(item.category?.name || '')}</div>
        </div>
        ${statusBadge(item.status)}
      </div>`;
    }).join('')
    : empty('No hay proximos items');

  const weekStrip = `<div class="week-strip">${o.week_days.map((day) => {
    const dow = new Date(`${day.date}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short' });
    const dom = day.date.slice(-2);
    const isToday = day.date === o.today;
    const status = day.item?.status;
    const content = day.image_url
      ? `<img src="${esc(day.image_url)}" alt="" />`
      : day.item
        ? (day.item.status === 'pending' ? `<span onclick="generateCalendar('${day.item.id}')" title="Generar">${ICON.edit}</span>` : ICON.image)
        : ICON.calendar;
    return `<div class="week-col ${isToday ? 'is-today' : ''}">
      <div class="week-col-head"><div class="dow">${esc(dow)}</div><div class="dom">${esc(dom)}</div></div>
      <div class="week-thumb" onclick="setTab('calendar')" title="${esc(day.item?.topic || 'Sin item')}">${content}</div>
      <div class="week-dot ${status ? `status-${status}` : ''}"></div>
    </div>`;
  }).join('')}</div>`;

  const manual = brand?.brand_manual || {};
  const colors = Object.entries(manual.colors || {});
  const brandSummary = brand
    ? `<div class="brand-summary-head">
        <div class="brand-avatar">${esc((brand.name || '?').slice(0, 1).toUpperCase())}</div>
        <div><strong>${esc(brand.name)}</strong><span>Marca activa</span></div>
      </div>
      ${colors.length ? `<div class="swatch-row">${colors.map(([name, value]) => `<span class="swatch" style="background:${esc(value)}" title="${esc(name)} ${esc(value)}"></span>`).join('')}</div>` : `<div class="subtle">Sin paleta configurada</div>`}
      <div class="font-row">
        <div class="font-chip"><div class="sample" style="font-family:${esc(manual.typography?.heading_font || 'inherit')}">Ag</div><div class="label">${esc(manual.typography?.heading_font || 'Titulo')}</div></div>
        <div class="font-chip"><div class="sample" style="font-family:${esc(manual.typography?.body_font || 'inherit')}">Ag</div><div class="label">${esc(manual.typography?.body_font || 'Texto')}</div></div>
      </div>
      <div class="toolbar" style="margin-top:16px"><button class="btn btn-sm" onclick="setTab('brand')">Editar marca</button></div>`
    : empty('Sin marca configurada');

  const recentList = o.recent_posts.length
    ? o.recent_posts.map((post) => `<div class="recent-row" onclick="showPost('${post.id}')">
        ${post.image_url ? `<img class="thumb" src="${esc(post.image_url)}" alt="" />` : `<div class="thumb-empty">${ICON.image}</div>`}
        <div>
          <div class="title">${esc(post.hook || 'Post sin hook')}</div>
          <div class="recent-meta">Instagram Post · ${timeAgo(post.created_at)}</div>
        </div>
        ${statusBadge(post.status)}
      </div>`).join('')
    : empty('Todavia no hay posts generados');

  let todayHero;
  if (todayPost) {
    todayHero = `<div class="today-hero done">
      ${todayPost.image_url ? `<img class="th-thumb" src="${esc(todayPost.image_url)}" alt="" />` : ''}
      <div class="th-main">
        <div class="th-eyebrow">${ICON.check} Contenido de hoy listo</div>
        <div class="th-title">${esc(todayPost.hook || 'Tu creativo de hoy esta generado')}</div>
      </div>
      <button class="btn btn-primary" onclick="showPost('${todayPost.id}')">Ver post</button>
    </div>`;
  } else if (today) {
    todayHero = `<div class="today-hero">
      <div class="th-main">
        <div class="th-eyebrow">✨ Contenido de hoy ${ctypeChip(today.content_type)}</div>
        <div class="th-title">${esc(today.topic)}</div>
        <div class="th-sub">${esc(today.angle || 'Listo para generar')}</div>
      </div>
      <button class="btn btn-primary" onclick="openGenerateModal('${today.id}')">Generar ahora</button>
    </div>`;
  } else {
    todayHero = `<div class="today-hero">
      <div class="th-main">
        <div class="th-eyebrow">✨ Contenido de hoy</div>
        <div class="th-title">No hay una idea para hoy</div>
        <div class="th-sub">Genera ideas nuevas y empeza a crear.</div>
      </div>
      <button class="btn btn-primary" onclick="generateIdeas()">+ Generar ideas</button>
    </div>`;
  }

  // Los dos pasos que activan el producto, arriba de todo del Resumen y de a
  // uno por vez (dos banners a la vez compiten y no se hace ninguno):
  // 1) Instagram -> lo aprobado se publica solo.
  // 2) WhatsApp  -> las imagenes llegan al chat para aprobar con un toque.
  // Cada banner desaparece al completarse.
  const igConnected = brand && (brand.ig_username || brand.ig_connected_at);
  let igCta = '';
  if (brand && !igConnected) {
    igCta = `
    <div class="ig-cta" id="ig-connect-cta">
      <div class="platform-chip">${ICON.instagram}</div>
      <div class="ig-cta-text">
        <b>Conecta tu Instagram</b>
        <span>Es el ultimo paso: con la cuenta conectada, lo que aprobes se publica solo.</span>
      </div>
      <button class="btn btn-primary" onclick="connectInstagram()">Conectar Instagram</button>
    </div>`;
  } else if (brand && !brand.whatsapp_number) {
    igCta = `
    <div class="ig-cta" id="wa-setup-cta">
      <div class="platform-chip">💬</div>
      <div class="ig-cta-text">
        <b>¿A que WhatsApp te mandamos los posts?</b>
        <span>Cada creativo nuevo te llega al chat con botones Aprobar / Rechazar. Sin abrir la app.</span>
      </div>
      <form class="wa-cta-form" onsubmit="saveWhatsappNumber(event)">
        <input name="wa" inputmode="numeric" placeholder="54 9 341 1234567" required />
        <button class="btn btn-primary">Guardar</button>
      </form>
    </div>`;
  }

  byId('content').innerHTML = `
    <div class="dash-head">
      <div><h1>Hola${S.userEmail ? `, ${esc(S.userEmail.split('@')[0])}` : ''}</h1><p>Resumen de ${brand ? esc(brand.name) : 'tu marca'} · ${o.today}</p></div>
    </div>
    ${igCta}
    ${todayHero}
    ${metrics}
    <div class="grid two" style="margin-top:14px">
      <div class="section">
        <div class="card-head"><h2>Vista previa del creativo</h2><button class="btn btn-sm" onclick="loadOverview()" title="Actualizar">&#8635;</button></div>
        <div class="creative-preview">${creative}</div>
      </div>
      <div class="section">
        <div class="card-head"><h2>Proximos posts</h2><button class="btn btn-sm" onclick="setTab('calendar')">Ver calendario</button></div>
        ${upcoming}
      </div>
    </div>
    <div class="section" style="margin-top:14px">
      <div class="card-head"><h2>Calendario semanal</h2><span class="meta">Semana actual</span></div>
      ${weekStrip}
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="section">
        <div class="card-head"><h2>Resumen de marca</h2></div>
        ${brandSummary}
      </div>
      <div class="section">
        <div class="card-head"><h2>Posts recientes</h2><button class="btn btn-sm" onclick="setTab('posts')">Ver todos</button></div>
        ${recentList}
      </div>
    </div>`;
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function updateBellBadge(needsReview) {
  const badge = byId('bell-badge');
  if (!badge) return;
  if (needsReview.length) {
    badge.hidden = false;
    badge.textContent = needsReview.length > 9 ? '9+' : String(needsReview.length);
  } else {
    badge.hidden = true;
  }
  S.needsReviewPosts = needsReview;
}

window.toggleNotifications = function toggleNotifications(event) {
  event?.stopPropagation();
  const panel = byId('notif-panel');
  if (!panel) return;
  if (!panel.hidden) { panel.hidden = true; return; }

  const items = S.needsReviewPosts || [];
  panel.innerHTML = `
    <div class="notif-head">En revision</div>
    ${items.length ? items.map((post) => `<button class="notif-item" onclick="closeNotifAndOpen('${post.id}')">
      <span class="title">${esc(post.hook || 'Post sin hook')}</span>
      <span class="subtle">Esperando tu aprobacion</span>
    </button>`).join('') : `<div class="notif-item subtle">Sin pendientes por revisar</div>`}
    ${items.length ? `<button class="notif-item" style="text-align:center;color:var(--accent);font-weight:700" onclick="S.postFilter='needs_review';setTab('posts');toggleNotifications()">Ver todos</button>` : ''}
  `;
  panel.hidden = false;
};

window.closeNotifAndOpen = function closeNotifAndOpen(postId) {
  toggleNotifications();
  showPost(postId);
};

document.addEventListener('click', (event) => {
  const panel = byId('notif-panel');
  const wrap = event.target.closest?.('.notif-wrap');
  if (panel && !panel.hidden && !wrap) panel.hidden = true;
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    byId('global-search')?.focus();
  }
});

window.runGlobalSearch = function runGlobalSearch(value) {
  S.searchQuery = value.trim();
  S.postFilter = 'all';
  setTab('posts');
};

window.generateTodayFromTopbar = async function generateTodayFromTopbar() {
  if (!S.brandId) { toast('Crea o selecciona una marca primero', 'error'); return; }
  const today = S.overview?.today_item;
  if (today && today.status === 'pending') {
    await generateCalendar(today.id);
    return;
  }
  if (today) {
    toast('El contenido de hoy ya fue generado. Mira Posts o Calendario.');
    setTab('calendar');
    return;
  }
  toast('No hay contenido cargado para hoy. Generando ideas...');
  try {
    const data = await api('/api/ideas/generate', { method: 'POST', body: { count: 7 } });
    toast(`${data.inserted} ideas agregadas al calendario`);
    setTab('calendar');
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.setTab = function setTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab) tab.click();
};

async function loadPosts() {
  const data = await api('/api/posts?limit=200');
  S.posts = data.posts || [];
  renderPosts();
}

const POST_FILTER_LABELS = {
  all: 'Todos', generated: 'Generados', needs_review: 'En revision',
  approved: 'Aprobados', posted: 'Publicados', rejected: 'Rechazados',
};

// Los valores son motores internos; las etiquetas hablan de calidad, no de
// proveedores ni de lo que nos cuesta cada clip — eso es informacion nuestra.
const VIDEO_ENGINE_OPTS = [
  ['veo_lite', 'Ligero · rapido y simple'],
  ['omni', 'Estándar · ideal para UGC con avatar'],
  ['veo_fast', 'Alta · mas nitido y fluido'],
  ['veo', 'Cine · calidad maxima'],
];
function videoEngineOptions(selected) {
  const sel = selected || 'omni';
  return VIDEO_ENGINE_OPTS.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
}

const CONTENT_TYPE_LABEL = { product_video: '🎬 Video producto', ugc_video: '🗣️ Video UGC', story: '📱 Historia', carousel: '🎠 Carrusel' };
function ctypeChip(type) {
  const label = CONTENT_TYPE_LABEL[type];
  return label ? `<span class="ctype-chip">${label}</span>` : '';
}

function renderPosts() {
  const query = (S.searchQuery || '').toLowerCase();
  let posts = S.postFilter === 'all' ? S.posts : S.posts.filter((post) => post.status === S.postFilter);
  if (query) {
    posts = posts.filter((post) => [post.hook, post.body, post.caption_instagram].filter(Boolean).some((text) => text.toLowerCase().includes(query)));
  }

  const counts = S.posts.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, { all: S.posts.length });
  counts.all = S.posts.length;

  const segmented = `<div class="segmented">${['all', ...POST_STATUSES].map((status) => `
    <button class="seg-opt ${S.postFilter === status ? 'active' : ''}" onclick="S.postFilter='${status}';renderPosts()">
      ${POST_FILTER_LABELS[status] || status}${counts[status] ? `<span class="seg-count">${counts[status]}</span>` : ''}
    </button>`).join('')}</div>`;

  const body = posts.length ? `<div class="posts-grid">${posts.map(postCard).join('')}</div>` : empty(query ? `Sin resultados para "${S.searchQuery}"` : 'No hay posts para este filtro');

  byId('content').innerHTML = `
    ${pageHead('Posts', query ? `${posts.length} resultados para "${S.searchQuery}"` : `Tu contenido generado, listo para revisar y aprobar`, `
      ${query ? `<button class="btn" onclick="S.searchQuery='';renderPosts()">Limpiar busqueda</button>` : ''}
      <button class="btn" onclick="loadPosts()">Actualizar</button>
    `)}
    <div style="margin-bottom:18px">${segmented}</div>
    ${body}`;

  // Auto-refresca mientras haya videos generandose, para que aparezcan solos.
  const anyProcessing = S.posts.some((p) => (p.videos || []).some((v) => v.status === 'processing'));
  if (anyProcessing) {
    clearTimeout(S.postsVideoPoll);
    S.postsVideoPoll = setTimeout(() => { if (S.tab === 'posts') loadPosts(); }, 15000);
  }
}

const IG_ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.3a5 5 0 1 1 7.5 6.3Z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3c-1.6 0-3-.4-4.3-1L3 20l1.3-4.9a8 8 0 0 1-1.3-4.4A8.4 8.4 0 0 1 11.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3 9.2 12.7M22 3l-7.3 19-3.5-9.3L2 9.5 22 3Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21 12 16.8 6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21Z"/></svg>',
};

function postCard(post) {
  const brand = S.brands.find((b) => b.id === S.brandId) || {};
  const category = S.categories.find((cat) => cat.id === post.category_id);
  const username = brand.ig_username || brand.slug || (brand.name || 'tumarca').toLowerCase().replace(/\s+/g, '');
  const avatar = brand.logo_url
    ? `<span class="igp-avatar"><img src="${esc(brand.logo_url)}" alt="" /></span>`
    : `<span class="igp-avatar igp-avatar-initial">${esc((brand.name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const date = fmtDate(String(post.created_at || '').slice(0, 10));

  const videos = post.videos || [];
  const readyVideo = videos.find((v) => v.status === 'ready' && v.video_url);
  const processingVideo = videos.find((v) => v.status === 'processing');

  let media;
  if (readyVideo) {
    media = `<div class="igp-media">
      <video src="${esc(readyVideo.video_url)}" ${post.image_url ? `poster="${esc(post.image_url)}"` : ''} controls playsinline preload="metadata"></video>
      <span class="igp-play-badge">▶ Video</span>
    </div>`;
  } else if (post.image_url) {
    const slideUrls = Array.isArray(post.image_urls) ? post.image_urls : [];
    if (slideUrls.length > 1) {
      // Carrusel navegable como en Instagram: swipe/flechas + contador + puntos.
      media = `<div class="igp-media igc" id="igc-${post.id}">
        <div class="igc-track" onscroll="igcScroll('${post.id}')">
          ${slideUrls.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" onclick="showPost('${post.id}')" />`).join('')}
        </div>
        <span class="igc-counter" id="igc-cnt-${post.id}">1/${slideUrls.length}</span>
        <button class="igc-nav igc-prev" hidden onclick="igcNav(event,'${post.id}',-1)" aria-label="Anterior">‹</button>
        <button class="igc-nav igc-next" onclick="igcNav(event,'${post.id}',1)" aria-label="Siguiente">›</button>
        <div class="igc-dots" id="igc-dots-${post.id}">${slideUrls.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
      </div>`;
    } else {
      media = `<div class="igp-media ${post.content_type === 'story' ? 'igp-media-story' : ''}" onclick="showPost('${post.id}')">
        <img src="${esc(post.image_url)}" alt="" loading="lazy" />
        ${post.content_type === 'story' ? '<span class="igp-play-badge">📱 Historia</span>' : ''}
        ${processingVideo ? '<span class="igp-video-processing">🎬 Generando video...</span>' : ''}
      </div>`;
    }
  } else {
    media = `<div class="igp-media igp-media-empty" onclick="showPost('${post.id}')">
      ${post.render_error ? `<span class="pc-render-error">Error al generar la imagen</span>` : `<span class="pc-generating">Generando imagen...</span>`}
    </div>`;
  }

  // Real workflow actions depend on where the post is in the flow.
  let actions = '';
  if (post.status === 'posted') {
    actions = `<span class="pc-published">${ICON.check} Publicado en Instagram</span>`;
  } else if (post.status === 'approved') {
    actions = `
      ${post.image_url ? `<button class="btn btn-sm btn-primary" onclick="publishPost('${post.id}')">Publicar ahora</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="rejectPost('${post.id}')">Rechazar</button>`;
  } else if (post.status === 'rejected') {
    actions = `<button class="btn btn-sm btn-good" onclick="approvePost('${post.id}')">Aprobar igual</button>`;
  } else {
    actions = `
      <button class="btn btn-sm btn-good" onclick="approvePost('${post.id}')">Aprobar</button>
      <button class="btn btn-sm btn-danger" onclick="rejectPost('${post.id}')">Rechazar</button>`;
  }

  // Las historias se muestran como una historia real de Instagram: 9:16 con
  // barra de progreso, avatar arriba, sin iconos de feed y sin caption.
  if (post.content_type === 'story') {
    const storyMedia = post.image_url
      ? `<img src="${esc(post.image_url)}" alt="" loading="lazy" />`
      : `<div class="igs-empty">${post.render_error ? '<span class="pc-render-error">Error al generar la imagen</span>' : '<span class="pc-generating">Generando historia...</span>'}</div>`;
    return `<article class="card post-card igs">
      <div class="igs-frame" onclick="showPost('${post.id}')">
        <div class="igs-progress"><i class="on"></i><i></i><i></i></div>
        <div class="igs-head">
          ${avatar}
          <span class="igs-user">${esc(username)}</span>
          <span class="igs-time">${esc(date)}</span>
          ${statusBadge(post.status)}
        </div>
        ${storyMedia}
        <span class="igs-chip">📱 Historia · 24 hs</span>
      </div>
      <div class="pc-actions">
        <div class="pc-primary">${actions}</div>
        <button class="btn btn-sm btn-plain" onclick="showPost('${post.id}')">Ver detalle</button>
      </div>
    </article>`;
  }

  return `<article class="card post-card igp">
    <div class="igp-head">
      ${avatar}
      <div class="igp-user">
        <span class="igp-username">${esc(username)}</span>
        ${category ? `<span class="igp-sub">${esc(category.name)}</span>` : ''}
      </div>
      ${ctypeChip(post.content_type)}
      ${statusBadge(post.status)}
    </div>
    ${media}
    ${post.ig_stats_at ? `<div class="igp-iconbar igp-iconbar-real">
      <span><i>${IG_ICONS.heart}${post.ig_like_count || 0}</i><i>${IG_ICONS.comment}${post.ig_comments_count || 0}</i></span>
      ${post.ig_permalink ? `<a class="igp-permalink" href="${esc(post.ig_permalink)}" target="_blank" rel="noopener">Ver en Instagram</a>` : ''}
    </div>` : `<div class="igp-iconbar" aria-hidden="true">
      <span>${IG_ICONS.heart}${IG_ICONS.comment}${IG_ICONS.share}</span>
      ${IG_ICONS.bookmark}
    </div>`}
    <div class="igp-caption" onclick="showPost('${post.id}')">
      <span class="igp-username">${esc(username)}</span> ${esc(post.caption_instagram || post.hook || '')}
    </div>
    <div class="igp-date">${esc(date)}</div>
    <div class="pc-actions">
      <div class="pc-primary">${actions}</div>
      <button class="btn btn-sm btn-plain" onclick="showPost('${post.id}')">Ver detalle</button>
    </div>
  </article>`;
}

// --- Carrusel estilo Instagram en la card ---
window.igcNav = function igcNav(ev, id, dir) {
  ev.stopPropagation();
  const track = document.querySelector(`#igc-${CSS.escape(id)} .igc-track`);
  if (track) track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
};

window.igcScroll = function igcScroll(id) {
  const wrap = byId(`igc-${id}`);
  if (!wrap) return;
  const track = wrap.querySelector('.igc-track');
  const total = track.children.length;
  const idx = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)));
  const counter = byId(`igc-cnt-${id}`);
  if (counter) counter.textContent = `${idx + 1}/${total}`;
  const dots = byId(`igc-dots-${id}`);
  if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
  const prev = wrap.querySelector('.igc-prev');
  const next = wrap.querySelector('.igc-next');
  if (prev) prev.hidden = idx === 0;
  if (next) next.hidden = idx === total - 1;
};

window.sendWhatsapp = async function sendWhatsapp(id) {
  toast('Enviando a WhatsApp...');
  try {
    const res = await api(`/api/posts/${id}/whatsapp`, { method: 'POST' });
    toast(`Enviado a WhatsApp (${res.to})`, 'success');
  } catch (error) {
    toast(error.message || 'No se pudo enviar a WhatsApp', 'error');
  }
};

window.publishPost = async function publishPost(id) {
  if (!confirm('Publicar este post en Instagram ahora?')) return;
  toast('Publicando en Instagram...');
  try {
    await api(`/api/posts/${id}/publish`, { method: 'POST' });
    toast('Publicado en Instagram', 'success');
    await loadPosts();
  } catch (error) {
    toast(error.message || 'No se pudo publicar', 'error');
  }
};

window.showPost = async function showPost(id) {
  try {
    const data = await api(`/api/posts/${id}`);
    const post = data.post;
    const slideUrls = Array.isArray(post.image_urls) ? post.image_urls : [];
    const mediaBlock = slideUrls.length > 1
      ? `<div class="carousel-strip">${slideUrls.map((u, i) => `<div class="carousel-slide"><img src="${esc(u)}" alt="" /><span class="carousel-n">${i + 1}/${slideUrls.length}</span></div>`).join('')}</div>`
      : (post.image_url ? `<img class="modal-image ${post.content_type === 'story' ? 'modal-image-story' : ''}" src="${esc(post.image_url)}" alt="" />` : '');
    modal(`<h3>Post ${ctypeChip(post.content_type)}</h3>
      ${mediaBlock}
      ${post.render_error ? `<div class="empty" style="border-color:#7a2b2b;color:#ffb4b4">Error al generar imagen: ${esc(post.render_error)}</div>` : (!post.image_url ? `<div class="empty">Imagen aun no generada. Toca "Regenerar render" o espera a que termine.</div>` : '')}
      ${post.image_url ? `<section class="video-section">
        <div class="video-head">
          <div><strong>Videos</strong><span class="subtle"> · animá el creativo o generá un UGC</span></div>
          <select style="width:auto;max-width:230px" onchange="S.videoEngine=this.value">
            ${videoEngineOptions(S.videoEngine || (S.brands.find((b)=>b.id===S.brandId)||{}).video_engine || 'omni')}
          </select>
        </div>
        <div class="toolbar" style="margin-bottom:12px">
          <button class="btn btn-sm" onclick="generateVideo('${post.id}','product')">🎬 Video de producto</button>
          <button class="btn btn-sm" onclick="generateVideo('${post.id}','ugc')">🗣️ Video UGC</button>
        </div>
        <div id="post-videos"><div class="subtle">Cargando videos...</div></div>
      </section>` : ''}
      <div class="form-grid">
        ${readOnlyField('Texto del post', post.caption_instagram, 5)}
      </div>
      <div class="toolbar" style="justify-content:flex-start;margin-top:14px">
        <button class="btn btn-good" onclick="approvePost('${post.id}');closeModal()">Aprobar</button>
        <button class="btn btn-danger" onclick="rejectPost('${post.id}');closeModal()">Rechazar</button>
        ${post.status === 'posted'
          ? '<span class="status status-posted">Publicado</span>'
          : (post.image_url ? `<button class="btn btn-primary" onclick="publishPost('${post.id}');closeModal()">Publicar en Instagram</button>` : '')}
        <button class="btn" onclick="regCopy('${post.id}');closeModal()" title="Vuelve a escribir el texto del post (hook, captions) con IA">Regenerar texto</button>
        <button class="btn" onclick="regRender('${post.id}');closeModal()" title="Vuelve a generar la imagen del post con IA">Regenerar imagen</button>
        ${post.image_url ? `<button class="btn" onclick="sendWhatsapp('${post.id}')">Enviar a WhatsApp</button>` : ''}
        <button class="btn btn-plain" onclick="closeModal()">Cerrar</button>
      </div>`);
    if (post.image_url) loadPostVideos(post.id);
  } catch (error) {
    toast(error.message, 'error');
  }
};

const VIDEO_KIND_LABEL = { product: 'Producto', ugc: 'UGC' };

function videoCard(v) {
  if (v.status === 'ready' && v.video_url) {
    return `<div class="video-card">
      <video src="${esc(v.video_url)}" controls playsinline preload="metadata"></video>
      <div class="video-meta"><span class="tag">${VIDEO_KIND_LABEL[v.kind] || v.kind}</span>
        <a class="btn btn-sm" href="${esc(v.video_url)}" target="_blank" rel="noopener">Descargar</a></div>
    </div>`;
  }
  if (v.status === 'error') {
    return `<div class="video-card video-err">
      <div class="video-ph">⚠️ Error<div class="subtle">${esc(v.error || 'No se pudo generar')}</div></div>
      <div class="video-meta"><span class="tag">${VIDEO_KIND_LABEL[v.kind] || v.kind}</span></div>
    </div>`;
  }
  return `<div class="video-card">
    <div class="video-ph"><span class="pc-generating">Generando video...</span><div class="subtle">Tarda ~1 min</div></div>
    <div class="video-meta"><span class="tag">${VIDEO_KIND_LABEL[v.kind] || v.kind}</span></div>
  </div>`;
}

async function loadPostVideos(id) {
  const box = byId('post-videos');
  if (!box) return;
  try {
    const data = await api(`/api/posts/${id}/videos`);
    const videos = data.videos || [];
    if (!videos.length) {
      box.innerHTML = data.video_configured
        ? '<div class="subtle">Todavia no generaste videos para este post.</div>'
        : '<div class="subtle">La generacion de video no esta configurada en el servidor (falta la API key del proveedor de video).</div>';
      return;
    }
    box.innerHTML = `<div class="video-grid">${videos.map(videoCard).join('')}</div>`;
    // Si hay alguno procesando, refresca en unos segundos.
    if (videos.some((v) => v.status === 'processing') && byId('post-videos')) {
      setTimeout(() => { if (byId('post-videos')) loadPostVideos(id); }, 12000);
    }
  } catch (error) {
    box.innerHTML = `<div class="subtle">${esc(error.message)}</div>`;
  }
}

window.setVideoEngine = function setVideoEngine(engine, btn) {
  S.videoEngine = engine;
  btn.parentElement.querySelectorAll('.seg-opt').forEach((b) => b.classList.toggle('active', b === btn));
};

window.generateVideo = async function generateVideo(id, kind) {
  const engine = S.videoEngine || 'omni';
  toast(kind === 'ugc' ? 'Escribiendo el guion y generando tu video UGC...' : 'Generando el video de tu producto...');
  try {
    await api(`/api/posts/${id}/videos`, { method: 'POST', body: { kind, engine } });
    toast('Video en proceso (~1 min). Se actualiza solo.', 'success');
    loadPostVideos(id);
  } catch (error) {
    toast(error.message || 'No se pudo iniciar el video', 'error');
  }
};

function readOnlyField(label, value, rows) {
  return `<div class="form-group full">
    <label>${esc(label)}</label>
    <textarea rows="${rows}" readonly>${esc(value || '')}</textarea>
  </div>`;
}

window.regCopy = async function regCopy(id) {
  try {
    await api(`/api/posts/${id}/regenerate-copy`, { method: 'POST' });
    toast('Texto regenerado');
    await loadTab();
  } catch (error) {
    toast(error.message, 'error');
  }
};

// Image rendering (GPT Image 2) runs in the background and can take ~1 min, so
// refresh the current tab a few times to pick up the result automatically.
function pollTabForRender() {
  [20000, 45000, 75000].forEach((ms) => setTimeout(() => { if (!byId('modal-root').classList.contains('open')) loadTab(); }, ms));
}

window.regRender = async function regRender(id) {
  try {
    const res = await api(`/api/posts/${id}/regenerate-render`, { method: 'POST' });
    toast(res.rendering ? 'Generando imagen en segundo plano (~1 min)...' : 'Imagen regenerada');
    closeModal();
    await loadTab();
    pollTabForRender();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.approvePost = async function approvePost(id) {
  try {
    await api(`/api/posts/${id}/approve`, { method: 'POST' });
    toast('Post aprobado');
    await loadTab();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.rejectPost = async function rejectPost(id) {
  try {
    await api(`/api/posts/${id}/reject`, { method: 'POST' });
    toast('Post rechazado');
    await loadTab();
  } catch (error) {
    toast(error.message, 'error');
  }
};

async function loadCalendar() {
  const [cal, posts] = await Promise.all([
    api('/api/calendar'),
    api('/api/posts?limit=200').catch(() => ({ posts: [] })),
  ]);
  S.calendar = cal.calendar || [];
  S.calPosts = new Map((posts.posts || []).map((p) => [p.id, p]));
  if (!S.calMonth) S.calMonth = todayStr().slice(0, 7);
  if (!S.calView) S.calView = 'agenda';
  renderCalendar();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CAL_STATUS_LABEL = {
  pending: 'Idea', generated: 'Generado', needs_review: 'En revision',
  approved: 'Aprobado', posted: 'Publicado', rejected: 'Rechazado', skipped: 'Omitido',
};

window.navCalMonth = function navCalMonth(delta) {
  const [y, m] = S.calMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  S.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCalendar();
};
window.calGoToday = function calGoToday() { S.calMonth = todayStr().slice(0, 7); renderCalendar(); };
window.setCalView = function setCalView(view) { S.calView = view; renderCalendar(); };

function calMiniCard(item) {
  const post = item.generated_post_id ? S.calPosts?.get(item.generated_post_id) : null;
  const thumb = post?.image_url
    ? `<img class="cm-thumb" src="${esc(post.image_url)}" alt="" />`
    : `<span class="cm-thumb">${ICON.image}</span>`;
  return `<button class="cal-mini st-${esc(item.status)}" onclick="calItemModal('${item.id}')" title="${esc(item.topic)}">
    ${thumb}
    <span class="cm-body">
      <span class="cm-status">${item.content_type === 'ugc_video' ? '🗣️ ' : item.content_type === 'product_video' ? '🎬 ' : ''}${CAL_STATUS_LABEL[item.status] || item.status}</span>
      <span class="cm-title">${esc(item.topic)}</span>
    </span>
  </button>`;
}

function renderCalMonth() {
  const today = todayStr();
  const [y, m] = S.calMonth.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const byDate = {};
  for (const item of S.calendar) (byDate[item.publish_date] ??= []).push(item);

  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(y, m, 0).getDate();
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  let cells = '';
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(y, m - 1, 1 - offset + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const inMonth = d.getMonth() === m - 1;
    const items = (byDate[ds] || []).slice(0, 3);
    cells += `<div class="cal-cell ${inMonth ? '' : 'other'}">
      <span class="cal-daynum ${ds === today ? 'today' : ''}">${d.getDate()}</span>
      ${inMonth ? items.map(calMiniCard).join('') : ''}
      ${inMonth && (byDate[ds] || []).length > 3 ? `<span class="subtle" style="font-size:10.5px">+${byDate[ds].length - 3} mas</span>` : ''}
    </div>`;
  }

  const counts = S.calendar.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
  const legend = [
    ['pending', 'var(--warn)'], ['generated', 'var(--info)'],
    ['needs_review', 'var(--accent)'], ['approved', 'var(--good)'],
  ].filter(([s]) => counts[s]).map(([s, c]) => `<span class="lg" style="--dot:${c}">${counts[s]} ${(CAL_STATUS_LABEL[s] || s).toLowerCase()}</span>`).join('');

  const upcoming = S.calendar.filter((i) => i.publish_date >= today).slice(0, 5);
  const sidePosts = upcoming.map((item) => {
    const post = item.generated_post_id ? S.calPosts?.get(item.generated_post_id) : null;
    const thumb = post?.image_url ? `<img class="thumb" src="${esc(post.image_url)}" alt="" />` : `<div class="thumb-empty">${ICON.image}</div>`;
    const dateLabel = new Date(`${item.publish_date}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="side-post" onclick="calItemModal('${item.id}')">
      ${thumb}
      <div style="flex:1;min-width:0">
        <div class="sp-date">${esc(dateLabel)}</div>
        <div class="sp-title">${esc(item.topic)}</div>
      </div>
      ${statusBadge(item.status)}
    </div>`;
  }).join('');

  return `<div class="cal-shell">
    <div class="cal-main">
      <div class="cal-toolbar">
        <div class="cal-nav">
          <button class="icon-btn" onclick="navCalMonth(-1)" title="Mes anterior">‹</button>
          <button class="icon-btn" onclick="navCalMonth(1)" title="Mes siguiente">›</button>
          <button class="btn btn-sm" onclick="calGoToday()">Hoy</button>
        </div>
        <div class="cal-month-label">${esc(monthLabel)}</div>
        <div class="segmented">
          <button class="seg-opt" onclick="setCalView('agenda')">Ideas</button>
          <button class="seg-opt active" onclick="setCalView('month')">Calendario</button>
        </div>
      </div>
      <div class="cal-grid">
        ${['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend">${legend || '<span class="subtle">Sin items este mes</span>'}</div>
    </div>
    <aside class="cal-side">
      <h2>Proximos posts</h2>
      <div class="side-sub">Lo que viene en tu calendario</div>
      ${sidePosts || empty('Nada programado')}
      <button class="btn" style="width:100%;margin-top:14px" onclick="setCalView('agenda')">Ver todas las ideas</button>
    </aside>
  </div>`;
}

function agendaItem(item) {
  const today = todayStr();
  const post = item.generated_post_id ? S.calPosts?.get(item.generated_post_id) : null;
  const thumb = post?.image_url
    ? `<img class="ag-thumb" src="${esc(post.image_url)}" alt="" />`
    : `<span class="ag-thumb ag-thumb-empty">${item.content_type === 'ugc_video' ? '🗣️' : item.content_type === 'product_video' ? '🎬' : item.content_type === 'story' ? '📱' : item.content_type === 'carousel' ? '🎠' : ICON.image}</span>`;
  return `<div class="agenda-item ${item.publish_date === today ? 'is-today' : ''}">
    ${thumb}
    <div class="ag-main" onclick="calItemModal('${item.id}')">
      <div class="ag-date">${esc(fmtDate(item.publish_date))}${item.publish_date === today ? ' · hoy' : ''} ${ctypeChip(item.content_type)}</div>
      <div class="ag-topic">${esc(item.topic)}</div>
      ${item.angle ? `<div class="ag-angle">${esc(item.angle)}</div>` : ''}
    </div>
    <div class="ag-actions">
      ${statusBadge(item.status)}
      ${item.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openGenerateModal('${item.id}')">Generar</button>` : ''}
      ${item.generated_post_id ? `<button class="btn btn-sm" onclick="event.stopPropagation();showPost('${item.generated_post_id}')">Ver post</button>` : ''}
    </div>
  </div>`;
}

function renderCalAgenda() {
  const list = S.calendar.length
    ? S.calendar.map(agendaItem).join('')
    : empty('Todavia no hay ideas. Toca "+ Generar ideas" y la IA arma tu plan.');
  return `
    <div class="toolbar" style="margin-bottom:14px">
      <div class="segmented">
        <button class="seg-opt active" onclick="setCalView('agenda')">Ideas</button>
        <button class="seg-opt" onclick="setCalView('month')">Calendario</button>
      </div>
    </div>
    <div class="agenda-list">${list}</div>`;
}

function renderCalendar() {
  const pending = S.calendar.filter((item) => item.status === 'pending').length;
  const sub = pending
    ? `${pending} idea${pending === 1 ? '' : 's'} lista${pending === 1 ? '' : 's'} para generar. Tocá "Generar" y la IA crea el post.`
    : 'Tus ideas de contenido. Generá ideas nuevas cuando quieras.';
  byId('content').innerHTML = `
    ${pageHead('Agenda de contenido', sub, `
      <button class="btn" onclick="loadCalendar()">Actualizar</button>
      <button class="btn btn-primary" onclick="generateIdeas()">+ Generar ideas</button>
    `)}
    ${S.calView === 'month' ? renderCalMonth() : renderCalAgenda()}`;
}

window.calItemModal = function calItemModal(id) {
  const item = S.calendar.find((i) => i.id === id);
  if (!item) return;
  const post = item.generated_post_id ? S.calPosts?.get(item.generated_post_id) : null;
  modal(`<h3>${esc(fmtDate(item.publish_date))} · ${esc(item.category?.name || 'Sin categoria')}</h3>
    ${post?.image_url ? `<img class="modal-image" src="${esc(post.image_url)}" alt="" style="max-width:260px" />` : ''}
    <div class="form-grid">
      <div class="form-group full"><label>Tema</label><input value="${esc(item.topic)}" onchange="updateCal('${item.id}','topic',this.value)" /></div>
      <div class="form-group full"><label>Angulo</label><input value="${esc(item.angle || '')}" onchange="updateCal('${item.id}','angle',this.value)" /></div>
      <div class="form-group full"><label>Estado</label>
        <select onchange="updateCal('${item.id}','status',this.value)">
          ${CAL_STATUSES.map((s) => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:16px">
      ${item.status === 'pending' ? `<button class="btn btn-primary" onclick="closeModal();openGenerateModal('${item.id}')">Generar contenido</button>` : ''}
      ${item.generated_post_id ? `<button class="btn" onclick="closeModal();showPost('${item.generated_post_id}')">Ver post</button>` : ''}
      <button class="btn btn-plain" onclick="closeModal();loadCalendar()">Cerrar</button>
    </div>`);
};

const calTimers = {};
window.updateCal = function updateCal(id, field, value) {
  clearTimeout(calTimers[id + field]);
  calTimers[id + field] = setTimeout(async () => {
    try {
      await api(`/api/calendar/${id}`, { method: 'PATCH', body: { [field]: value } });
      toast('Calendario actualizado');
    } catch (error) {
      toast(error.message, 'error');
    }
  }, 500);
};

window.generateIdeas = async function generateIdeas() {
  const input = window.prompt('Cuantas ideas nuevas querés generar? (1-30)', '7');
  if (input === null) return;
  const count = Math.max(1, Math.min(parseInt(input, 10) || 7, 30));
  toast('Generando ideas con IA...');
  try {
    const data = await api('/api/ideas/generate', { method: 'POST', body: { count } });
    toast(`${data.inserted} ideas agregadas al calendario`);
    await loadCalendar();
  } catch (error) {
    toast(error.message, 'error');
  }
};

// Modal para elegir calidad de imagen y (si la idea es video) el motor, al
// generar desde la agenda. Los defaults salen de la marca.
window.openGenerateModal = function openGenerateModal(id) {
  const item = (S.calendar || []).find((i) => i.id === id)
    || (S.overview?.today_item?.id === id ? S.overview.today_item : null)
    || {};
  const brand = S.brands.find((b) => b.id === S.brandId) || {};
  const ve = brand.video_engine || 'omni';
  const isVideo = item.content_type === 'product_video' || item.content_type === 'ugc_video';
  modal(`<h3>Generar contenido</h3>
    <p class="subtle" style="margin:0 0 14px">${esc(item.topic || '')}${isVideo ? ` · ${item.content_type === 'ugc_video' ? '🗣️ Video UGC' : '🎬 Video producto'}` : ''}</p>
    ${isVideo ? `<div class="form-grid">
      <div class="form-group full"><label>Motor de video</label>
        <select id="gen-ve">${videoEngineOptions(ve)}</select>
      </div>
    </div>` : ''}
    <div class="toolbar" style="justify-content:flex-start;margin-top:16px">
      <button class="btn btn-primary" onclick="confirmGenerate('${id}')">Generar</button>
      <button class="btn btn-plain" onclick="closeModal()">Cancelar</button>
    </div>`);
};

window.confirmGenerate = function confirmGenerate(id) {
  const video_engine = byId('gen-ve')?.value;
  closeModal();
  generateCalendar(id, { video_engine });
};

window.generateCalendar = async function generateCalendar(id, opts = {}) {
  try {
    const body = { calendar_id: id };
    if (opts.video_engine) body.video_engine = opts.video_engine;
    await api('/api/generate-and-render', { method: 'POST', body });
    toast('Copy generado. La imagen se crea en segundo plano (~1 min).');
    await loadTab();
    pollTabForRender();
  } catch (error) {
    toast(error.message, 'error');
  }
};

async function loadBrand() {
  // Always refresh brands so connection state (Instagram) reflects the server.
  try {
    const data = await api('/api/brands');
    S.brands = data.brands || [];
  } catch { if (!S.brands.length) await loadBootstrap(); }
  renderBrand();
}

function renderBrand() {
  const brand = S.brands.find((item) => item.id === S.brandId) || S.brands[0];
  if (!brand) {
    byId('content').innerHTML = `${pageHead('Marca')}${empty('No hay marca configurada')}`;
    return;
  }

  const manual = brand.brand_manual || {};
  byId('content').innerHTML = `
    ${pageHead('Marca', `La identidad que guia todo el contenido de ${esc(brand.name)}`, `<button class="btn" onclick="loadBrand()">Actualizar</button>`)}
    ${brandHero(brand, manual)}
    ${renderInstagramCard(brand)}
    <form onsubmit="saveBrand(event)">
      <input type="hidden" name="id" value="${esc(brand.id)}" />

      <section class="settings-card">
        <div class="settings-card-head"><div><h2>Identidad</h2><p>Quien es la marca y que ofrece.</p></div></div>
        <div class="settings-card-body form-grid">
          <div class="form-group"><label>Nombre</label><input name="name" value="${esc(brand.name)}" /></div>
          <div class="form-group full"><label>Descripcion</label><textarea name="description" rows="4">${esc(brand.description || '')}</textarea></div>
          <div class="form-group full">
            <label>Sitio web</label>
            <div class="web-row">
              <input name="website_url" placeholder="minegocio.com.ar" value="${esc(brand.website_url || '')}" />
              <button type="button" class="btn" id="btn-web" onclick="analizarWeb()">Analizar</button>
            </div>
            <p class="hint" id="web-estado">${webStatus(brand)}</p>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head"><div><h2>Voz y audiencia</h2><p>Como habla la marca y a quien le habla. Define el tono de todos los copies.</p></div></div>
        <div class="settings-card-body form-grid">
          <div class="form-group full"><label>Voz</label><textarea name="voice" rows="4">${esc(manual.voice || '')}</textarea></div>
          <div class="form-group full"><label>Audiencia</label><textarea name="audience" rows="3">${esc(manual.audience || '')}</textarea></div>
          <div class="form-group full"><label>Frases a evitar</label><textarea name="avoid_phrases" rows="4">${esc((manual.avoid_phrases || []).join('\n'))}</textarea></div>
          <div class="form-group full"><label>Reglas de contenido</label><textarea name="content_rules" class="tall">${esc((manual.content_rules || []).join('\n'))}</textarea></div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head"><div><h2>Estilo visual</h2><p>Paleta, tipografia y reglas que siguen todas las imagenes generadas.</p></div></div>
        <div class="settings-card-body form-grid">
          <div class="form-group full"><label>Estilo visual</label><textarea name="visual_style" rows="3">${esc(manual.visual_style || '')}</textarea></div>
          <div class="form-group full"><label>Colores</label><div class="color-grid">${renderColors(manual.colors || {})}</div></div>
          <div class="form-group"><label>Font heading</label><input name="font_heading" value="${esc(manual.typography?.heading_font || manual.typography?.primary || '')}" /></div>
          <div class="form-group"><label>Font body</label><input name="font_body" value="${esc(manual.typography?.body_font || manual.typography?.primary || '')}" /></div>
          <div class="form-group full"><label>Reglas de diseno</label><textarea name="design_rules" class="tall">${esc((manual.design_rules || []).join('\n'))}</textarea></div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head"><div><h2>Generacion de imagenes</h2><p>Control fino sobre lo que la IA pone (o no) en cada creativo.</p></div></div>
        <div class="settings-card-body form-grid">
          <div class="form-group">
            <label>Motor de video</label>
            <select name="video_engine">${videoEngineOptions(brand.video_engine)}</select>
            <div class="subtle" style="margin-top:6px">Calidad por defecto para los videos de la agenda y el autopilot.</div>
          </div>
          <div class="form-group full">
            <label>Logo de la marca</label>
            <div class="logo-upload">
              <img id="brand-logo-preview" src="${esc(brand.logo_url || '')}" alt="" style="${brand.logo_url ? '' : 'display:none'}" />
              <div style="flex:1">
                <input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadBrandLogo(this)" />
                <div class="subtle" id="logo-upload-status" style="margin-top:6px">${brand.logo_url ? 'La IA integra este logo en la escena: potes, vasos, vestimenta, carteles.' : 'Subi tu logo (ideal PNG con fondo transparente) y la IA lo integra en la escena: potes, vasos, vestimenta, carteles.'}</div>
                ${brand.logo_url ? `<button type="button" class="btn btn-sm" style="margin-top:8px" onclick="removeBrandLogo()">Quitar logo</button>` : ''}
              </div>
            </div>
            <input type="hidden" name="logo_url" id="brand-logo-url" value="${esc(brand.logo_url || '')}" />
          </div>
          <div class="form-group full">
            <div class="toggle-row">
              <div><div class="t-label">Wordmark en las imagenes</div><div class="t-desc">Si no hay logo subido, incluir el nombre de la marca escrito discreto en una esquina.</div></div>
              <input type="checkbox" class="toggle" name="show_logo" ${manual.show_logo ? 'checked' : ''} />
            </div>
          </div>
          <div class="form-group full">
            <label>Instrucciones de imagen (IA)</label>
            <textarea name="image_instructions" rows="4" placeholder="Indicaciones libres que se suman a cada imagen. Ej: 'Usar siempre un mockup de celular. Titular bien grande. Sin emojis.'">${esc(manual.image_instructions || '')}</textarea>
            <div class="subtle" style="margin-top:6px">Se agrega al final del prompt de cada imagen generada con IA, con prioridad alta.</div>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head"><div><h2>Aprobaciones por WhatsApp</h2><p>Recibi cada creativo nuevo por WhatsApp con botones para aprobar o rechazar.</p></div></div>
        <div class="settings-card-body form-grid">
          <div class="form-group full">
            <label>Numero de WhatsApp (con codigo de pais)</label>
            <input name="whatsapp_number" value="${esc(brand.whatsapp_number || '')}" placeholder="Ej: 5493411234567" />
            <div class="subtle" style="margin-top:6px">Cuando un post termina de generarse, te llega la imagen + copy a este numero. Toca "Aprobar" o "Rechazar" desde el chat. Deja vacio para desactivar.</div>
          </div>
        </div>
      </section>

      <div class="save-bar">
        <span class="subtle">Los cambios aplican a todo el contenido nuevo de ${esc(brand.name)}.</span>
        <button class="btn btn-primary">Guardar cambios</button>
      </div>
    </form>`;
}

function brandHero(brand, manual) {
  const initial = (brand.name || '?').trim().charAt(0).toUpperCase();
  const avatar = brand.logo_url
    ? `<div class="bh-avatar bh-logo"><img src="${esc(brand.logo_url)}" alt="" /></div>`
    : `<div class="bh-avatar">${esc(initial)}</div>`;
  const colors = Object.values(manual.colors || {}).slice(0, 6);
  const chips = [
    brand.ig_username ? `<span class="chan-chip on">${ICON.instagram} @${esc(brand.ig_username)}</span>` : `<button class="chan-chip chan-chip-cta" onclick="connectInstagram()">${ICON.instagram} Conectar Instagram</button>`,
    brand.whatsapp_number ? `<span class="chan-chip on">WhatsApp +${esc(brand.whatsapp_number)}</span>` : `<button class="chan-chip chan-chip-cta" onclick="document.querySelector('[name=whatsapp_number]')?.scrollIntoView({block:'center',behavior:'smooth'}) || null; document.querySelector('[name=whatsapp_number]')?.focus()">💬 Configurar WhatsApp</button>`,
  ].join('');
  return `<section class="brand-hero">
    ${avatar}
    <div class="bh-main">
      <div class="bh-name">${esc(brand.name)}</div>
      <div class="bh-desc">${esc((brand.description || manual.voice || 'Sin descripcion').slice(0, 140))}</div>
      <div class="bh-chips">${chips}</div>
    </div>
    <div class="bh-side">
      ${colors.length ? `<div class="bh-palette">${colors.map((c) => `<span style="background:${esc(c)}"></span>`).join('')}</div>` : ''}
      <span class="status ${brand.onboarding_status === 'ready' ? 'status-approved' : 'status-pending'}">${brand.onboarding_status === 'ready' ? 'Activa' : esc(brand.onboarding_status || 'Activa')}</span>
    </div>
  </section>`;
}

function renderInstagramCard(brand) {
  const connected = Boolean(brand.ig_username || brand.ig_connected_at);
  if (connected) {
    const expires = brand.ig_token_expires_at ? new Date(brand.ig_token_expires_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    return `
      <section class="settings-card">
        <div class="settings-card-head">
          <div><h2>Instagram</h2><p>La cuenta donde se publican los creativos automaticamente.</p></div>
          <span class="status status-approved">Conectada</span>
        </div>
        <div class="settings-card-body form-grid">
          <div class="form-group full">
            <div class="ig-connected">
              <div class="platform-chip">${ICON.instagram}</div>
              <div><div class="t-label">@${esc(brand.ig_username || 'cuenta')}</div><div class="t-desc">${expires ? `Conexion valida hasta ${expires} (se renueva sola).` : 'Cuenta conectada.'}</div></div>
            </div>
          </div>
          <div class="form-group full">
            <div class="toggle-row">
              <div><div class="t-label">Publicacion automatica</div><div class="t-desc">Publicar los posts aprobados en la fecha programada, sin intervencion.</div></div>
              <input type="checkbox" class="toggle" ${brand.auto_publish === false ? '' : 'checked'} onchange="toggleAutoPublish(this.checked)" />
            </div>
          </div>
          <div class="form-group full">
            <button type="button" class="btn" onclick="disconnectInstagram()">Desconectar cuenta</button>
          </div>
        </div>
      </section>`;
  }
  return `
    <section class="settings-card">
      <div class="settings-card-head">
        <div><h2>Instagram</h2><p>Conecta una cuenta profesional (Business o Creator) para publicar automaticamente.</p></div>
        <span class="status status-pending">Sin conectar</span>
      </div>
      <div class="settings-card-body">
        <p class="subtle" style="margin:0 0 14px">Al conectar, los posts aprobados se publican solos en la fecha de su calendario. Podes desactivar la publicacion automatica cuando quieras.</p>
        <div class="toolbar" style="justify-content:flex-start;gap:10px">
          <button type="button" class="btn btn-primary" onclick="connectInstagram()">${ICON.instagram} Conectar Instagram</button>
          <button type="button" class="btn" onclick="connectInstagramToken()">Conectar con token</button>
        </div>
      </div>
    </section>`;
}

// Resumen de lo que la IA saco de la web, para que el usuario vea que sirvio
// de algo y cuando se leyo por ultima vez.
function webStatus(brand) {
  const web = brand?.analysis?.website;
  if (!web?.que_vende) {
    return brand?.website_url
      ? 'Guardada pero sin analizar todavia. Toca "Analizar" para que la IA la lea.'
      : 'Si cargas tu web, la IA la lee y usa tus servicios, precios y diferenciales reales en las ideas.';
  }
  const fecha = new Date(web.analizada_el).toLocaleDateString('es-AR');
  const temas = (web.temas_sugeridos || []).length;
  return `Analizada el ${fecha}: ${(web.paginas || []).length} pagina(s) leidas, ${temas} temas detectados. Si cambiaste la web, volve a analizarla.`;
}

window.analizarWeb = async function analizarWeb() {
  const input = document.querySelector('[name="website_url"]');
  const boton = byId('btn-web');
  const estado = byId('web-estado');
  const url = (input?.value || '').trim();
  if (!url) return toast('Escribi la direccion de tu web', 'error');

  boton.disabled = true;
  boton.textContent = 'Leyendo...';
  if (estado) estado.textContent = 'Leyendo la web y analizandola. Puede tardar hasta un minuto.';

  try {
    const res = await api(`/api/brands/${S.brandId}/website`, { method: 'POST', body: { url } });
    const brand = S.brands.find((b) => b.id === S.brandId);
    if (brand) { brand.website_url = res.brand.website_url; brand.analysis = res.brand.analysis; }
    toast('Web analizada: las proximas ideas ya la usan', 'success');
    await loadBrand();
  } catch (error) {
    if (estado) estado.textContent = error.message || 'No se pudo analizar la web.';
    toast(error.message || 'No se pudo analizar la web', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Analizar';
  }
};

window.connectInstagramToken = function connectInstagramToken() {
  modal(`<h3>Conectar con token de acceso</h3>
    <p class="subtle" style="margin:0 0 12px">Para probar con tu propia cuenta sin configurar el login completo:</p>
    <ol class="subtle" style="margin:0 0 14px 18px;line-height:1.7">
      <li>En el panel de Meta, seccion <b>"Genera identificadores de acceso"</b>, toca <b>"Generar identificador"</b> en tu cuenta.</li>
      <li>Copia el token que aparece y pegalo aca abajo.</li>
    </ol>
    <div class="form-group full">
      <label>Token de acceso</label>
      <textarea id="ig-token" rows="4" placeholder="IGAA...​ (token largo generado en Meta)"></textarea>
    </div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:12px">
      <button class="btn btn-primary" onclick="submitTokenConnect()">Conectar</button>
      <button class="btn btn-plain" onclick="closeModal()">Cancelar</button>
    </div>`);
};

window.submitTokenConnect = async function submitTokenConnect() {
  const token = (byId('ig-token')?.value || '').trim();
  if (!token) { toast('Pega el token de acceso', 'error'); return; }
  toast('Validando token...');
  try {
    const res = await api('/api/instagram/connect-token', { method: 'POST', body: { token } });
    closeModal();
    toast(`Instagram conectado${res.username ? ` (@${res.username})` : ''}`, 'success');
    await loadBrand();
  } catch (error) {
    toast(error.message || 'No se pudo conectar', 'error');
  }
};

window.saveWhatsappNumber = async function saveWhatsappNumber(event) {
  event.preventDefault();
  const raw = new FormData(event.target).get('wa');
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length < 10) return toast('Escribi el numero completo, con codigo de pais (54...)', 'error');
  try {
    await api(`/api/brands/${S.brandId}`, { method: 'PUT', body: { whatsapp_number: digits } });
    const brand = S.brands.find((b) => b.id === S.brandId);
    if (brand) brand.whatsapp_number = digits;
    toast('Listo: los proximos creativos te llegan por WhatsApp', 'success');
    loadOverview();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.connectInstagram = async function connectInstagram() {
  try {
    const { url } = await api('/api/instagram/connect-url');
    window.location.href = url;
  } catch (error) {
    toast(error.message || 'No se pudo iniciar la conexion', 'error');
  }
};

window.disconnectInstagram = async function disconnectInstagram() {
  if (!confirm('Desconectar la cuenta de Instagram? Se dejaran de publicar posts automaticamente.')) return;
  try {
    await api('/api/instagram/disconnect', { method: 'POST' });
    toast('Instagram desconectado', 'success');
    await loadBrand();
  } catch (error) {
    toast(error.message || 'No se pudo desconectar', 'error');
  }
};

window.toggleAutoPublish = async function toggleAutoPublish(value) {
  try {
    await api('/api/instagram/settings', { method: 'PATCH', body: { auto_publish: value } });
    const brand = S.brands.find((item) => item.id === S.brandId);
    if (brand) brand.auto_publish = value;
    toast(value ? 'Publicacion automatica activada' : 'Publicacion automatica desactivada', 'success');
  } catch (error) {
    toast(error.message || 'No se pudo actualizar', 'error');
    await loadBrand();
  }
};

function renderColors(colors) {
  const entries = Object.entries(colors);
  if (!entries.length) {
    return '<div class="subtle">Sin colores configurados</div>';
  }
  return entries.map(([key, value]) => `<div class="color-row">
    <input type="color" value="${esc(value)}" onchange="this.nextElementSibling.value=this.value" />
    <input data-color-key="${esc(key)}" value="${esc(value)}" onchange="this.previousElementSibling.value=this.value" />
    <span class="subtle" style="grid-column:1 / -1">${esc(key)}</span>
  </div>`).join('');
}

window.uploadBrandLogo = async function uploadBrandLogo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const status = byId('logo-upload-status');
  status.textContent = 'Subiendo logo...';
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api('/api/uploads/reference', { method: 'POST', body: { data_url: dataUrl } });
    byId('brand-logo-url').value = res.image_url;
    const preview = byId('brand-logo-preview');
    preview.src = res.image_url;
    preview.style.display = '';
    status.textContent = 'Logo subido. Toca "Guardar cambios" para aplicarlo.';
  } catch (error) {
    status.textContent = error.message || 'No se pudo subir el logo';
  }
};

window.removeBrandLogo = function removeBrandLogo() {
  byId('brand-logo-url').value = '';
  const preview = byId('brand-logo-preview');
  preview.src = '';
  preview.style.display = 'none';
  byId('logo-upload-status').textContent = 'Logo quitado. Toca "Guardar cambios" para confirmar.';
};

window.saveBrand = async function saveBrand(event) {
  event.preventDefault();
  const fd = new FormData(event.target);
  const id = fd.get('id');
  const colors = {};
  document.querySelectorAll('[data-color-key]').forEach((input) => {
    colors[input.dataset.colorKey] = input.value;
  });
  // Merge over the existing manual so analysis-derived fields the form
  // doesn't expose (e.g. render_style) survive a save.
  const existingManual = (S.brands.find((b) => b.id === id) || {}).brand_manual || {};
  const manual = {
    ...existingManual,
    voice: fd.get('voice') || '',
    audience: fd.get('audience') || '',
    visual_style: fd.get('visual_style') || '',
    colors,
    typography: {
      heading_font: fd.get('font_heading') || '',
      body_font: fd.get('font_body') || '',
    },
    avoid_phrases: lines(fd.get('avoid_phrases')),
    content_rules: lines(fd.get('content_rules')),
    design_rules: lines(fd.get('design_rules')),
    image_instructions: fd.get('image_instructions') || '',
    show_logo: fd.get('show_logo') === 'on',
  };

  try {
    await api(`/api/brands/${id}`, {
      method: 'PUT',
      body: {
        name: fd.get('name'),
        description: fd.get('description'),
        website_url: fd.get('website_url') || '',
        whatsapp_number: fd.get('whatsapp_number') || '',
        logo_url: fd.get('logo_url') || '',
        video_engine: fd.get('video_engine') || 'omni',
        brand_manual: manual,
      },
    });
    toast('Marca guardada');
    S.brands = [];
    await loadBrand();
  } catch (error) {
    toast(error.message, 'error');
  }
};

function lines(value) {
  return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

// --- Productos / catalogo ----------------------------------------------------

async function loadProducts() {
  const data = await api('/api/products');
  S.products = data.products || [];
  renderProducts();
}

function productCard(p) {
  const img = p.image_url
    ? `<img class="prod-img" src="${esc(p.image_url)}" alt="" loading="lazy" />`
    : `<div class="prod-img prod-img-empty">${ICON.image}</div>`;
  return `<article class="prod-card ${p.active ? '' : 'inactive'}">
    ${img}
    <div class="prod-body">
      <div class="prod-top">
        <div class="title">${esc(p.name)}</div>
        ${p.price ? `<span class="prod-price">${esc(p.price)}</span>` : ''}
      </div>
      ${p.description ? `<div class="prod-desc">${esc(p.description)}</div>` : ''}
      <div class="prod-meta">
        <span class="tag">${p.source === 'menu' ? 'Desde carta' : 'Manual'}</span>
        ${p.active ? '' : '<span class="status status-skipped">Pausado</span>'}
      </div>
    </div>
    <div class="prod-actions">
      <button class="btn btn-sm" onclick="productModal('${p.id}')">Editar</button>
      <button class="btn btn-sm" onclick="toggleProduct('${p.id}', ${p.active ? 'false' : 'true'})">${p.active ? 'Pausar' : 'Activar'}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Eliminar</button>
    </div>
  </article>`;
}

function renderProducts() {
  const products = S.products || [];
  const active = products.filter((p) => p.active).length;
  byId('content').innerHTML = `
    ${pageHead('Productos y servicios', 'Tu catalogo real: las ideas y los posts promocionan estos items con sus precios exactos', `
      <button class="btn" onclick="importMenuModal()">Importar desde carta</button>
      <button class="btn btn-primary" onclick="productModal()">+ Agregar producto</button>
    `)}
    ${products.length ? `
      <div class="subtle" style="margin-bottom:14px">${active} activo${active === 1 ? '' : 's'} de ${products.length}. Los items pausados no se usan para generar contenido.</div>
      <div class="prod-grid">${products.map(productCard).join('')}</div>
    ` : `
      <section class="section hero-empty">
        <h2>Carga tu catalogo</h2>
        <p>Subi una foto de tu carta o lista de precios y la IA extrae los productos con sus precios. Las proximas ideas de contenido van a promocionar tus productos reales.</p>
        <div class="toolbar" style="justify-content:center">
          <button class="btn btn-primary" onclick="importMenuModal()">Importar desde carta</button>
          <button class="btn" onclick="productModal()">Agregar a mano</button>
        </div>
      </section>
    `}`;
}

window.productModal = function productModal(id = null) {
  const p = id ? (S.products || []).find((x) => x.id === id) : null;
  modal(`<h3>${p ? 'Editar producto' : 'Nuevo producto o servicio'}</h3>
    <form onsubmit="saveProduct(event, ${p ? `'${p.id}'` : 'null'})" class="form-grid">
      <div class="form-group full"><label>Nombre</label><input name="name" required value="${esc(p?.name || '')}" placeholder="Ej: Pizza napolitana / Corte + barba" /></div>
      <div class="form-group"><label>Precio</label><input name="price" value="${esc(p?.price || '')}" placeholder="Ej: $12.500 o desde $8.000" /></div>
      <div class="form-group full"><label>Descripcion</label><textarea name="description" rows="3" placeholder="Ingredientes, que incluye, detalle...">${esc(p?.description || '')}</textarea></div>
      <div class="form-group full">
        <label>Foto del producto (opcional)</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadProductImage(this)" />
        <div class="subtle" id="prod-upload-status" style="margin-top:6px"></div>
        <input type="hidden" name="image_url" id="prod-image-url" value="${esc(p?.image_url || '')}" />
        <img id="prod-image-preview" src="${esc(p?.image_url || '')}" alt="" style="max-width:160px;border-radius:10px;margin-top:8px;${p?.image_url ? '' : 'display:none'}" />
      </div>
      <div class="form-group full">
        <button class="btn btn-primary">Guardar</button>
        <button type="button" class="btn btn-plain" onclick="closeModal()">Cancelar</button>
      </div>
    </form>`);
};

window.uploadProductImage = async function uploadProductImage(input) {
  const file = input.files?.[0];
  if (!file) return;
  const status = byId('prod-upload-status');
  status.textContent = 'Subiendo imagen...';
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api('/api/uploads/reference', { method: 'POST', body: { data_url: dataUrl } });
    byId('prod-image-url').value = res.image_url;
    const preview = byId('prod-image-preview');
    preview.src = res.image_url;
    preview.style.display = '';
    status.textContent = 'Imagen subida.';
  } catch (error) {
    status.textContent = error.message || 'No se pudo subir la imagen';
  }
};

window.saveProduct = async function saveProduct(event, id) {
  event.preventDefault();
  const fd = new FormData(event.target);
  const body = {
    name: fd.get('name'),
    price: fd.get('price') || '',
    description: fd.get('description') || '',
    image_url: fd.get('image_url') || ''
  };
  try {
    if (id) await api(`/api/products/${id}`, { method: 'PATCH', body });
    else await api('/api/products', { method: 'POST', body });
    closeModal();
    toast('Producto guardado');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.toggleProduct = async function toggleProduct(id, active) {
  try {
    await api(`/api/products/${id}`, { method: 'PATCH', body: { active } });
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.deleteProduct = async function deleteProduct(id) {
  if (!confirm('Eliminar este producto del catalogo?')) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    toast('Producto eliminado');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.importMenuModal = function importMenuModal() {
  modal(`<h3>Importar desde tu carta</h3>
    <p class="subtle" style="margin:0 0 14px">Subi una foto clara de tu carta, menu o lista de precios. La IA lee los productos y sus precios exactos y los agrega al catalogo.</p>
    <div class="form-group full">
      <input type="file" accept="image/png,image/jpeg,image/webp" onchange="runMenuImport(this)" />
      <div class="subtle" id="menu-import-status" style="margin-top:10px"></div>
    </div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:8px">
      <button type="button" class="btn btn-plain" onclick="closeModal()">Cerrar</button>
    </div>`);
};

window.runMenuImport = async function runMenuImport(input) {
  const file = input.files?.[0];
  if (!file) return;
  const status = byId('menu-import-status');
  status.textContent = 'Analizando la carta con IA... (puede tardar ~20s)';
  input.disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api('/api/products/import-menu', { method: 'POST', body: { data_url: dataUrl } });
    if (!res.imported && !res.skipped) {
      status.textContent = res.message || 'No se detectaron productos en la imagen. Proba con una foto mas clara.';
      input.disabled = false;
      return;
    }
    closeModal();
    toast(`${res.imported} producto${res.imported === 1 ? '' : 's'} importado${res.imported === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} ya existian)` : ''}`, 'success');
    await loadProducts();
  } catch (error) {
    status.textContent = error.message || 'No se pudo importar la carta';
    input.disabled = false;
  }
};

async function loadCategories() {
  const data = await api('/api/categories');
  S.categories = data.categories || [];
  renderCategories();
}

function renderCategories() {
  const cards = S.categories.map((cat) => `<section class="settings-card">
    <div class="settings-card-head">
      <div><h2>${esc(cat.name)}</h2><p>${esc(cat.objective || 'Sin objetivo definido')}</p></div>
    </div>
    <div class="settings-card-body form-grid">
      ${catInput(cat, 'description', 'Descripcion', 'textarea')}
      ${catInput(cat, 'objective', 'Objetivo')}
      ${catInput(cat, 'prompt_guidance', 'Guia visual para las imagenes', 'textarea')}
      <div class="form-group full">
        <label>Ejemplos de hooks</label>
        <textarea rows="3" onchange="saveCatArray('${cat.id}','hook_examples',this)">${esc((cat.hook_examples || []).join('\n'))}</textarea>
      </div>
      <div class="form-group full">
        <label>Reglas a evitar</label>
        <textarea rows="3" onchange="saveCatArray('${cat.id}','avoid_rules',this)">${esc((cat.avoid_rules || []).join('\n'))}</textarea>
      </div>
    </div>
  </section>`).join('');

  byId('content').innerHTML = `
    ${pageHead('Categorias', 'Los pilares de contenido de tu marca. Los cambios se guardan solos.', `<button class="btn" onclick="loadCategories()">Actualizar</button>`)}
    ${cards || empty('Sin categorias')}`;
}

function catInput(cat, field, label, type = 'input') {
  const value = cat[field] || '';
  if (type === 'textarea') {
    return `<div class="form-group full"><label>${esc(label)}</label><textarea rows="3" onchange="saveCatField('${cat.id}','${field}',this.value)">${esc(value)}</textarea></div>`;
  }
  return `<div class="form-group"><label>${esc(label)}</label><input value="${esc(value)}" onchange="saveCatField('${cat.id}','${field}',this.value)" /></div>`;
}

const catTimers = {};
window.saveCatField = function saveCatField(id, field, value) {
  clearTimeout(catTimers[id + field]);
  catTimers[id + field] = setTimeout(async () => {
    try {
      await api(`/api/categories/${id}`, { method: 'PATCH', body: { [field]: value } });
      toast('Categoria actualizada');
    } catch (error) {
      toast(error.message, 'error');
    }
  }, 500);
};

window.saveCatArray = function saveCatArray(id, field, textarea) {
  window.saveCatField(id, field, lines(textarea.value));
};

async function loadDesign() {
  const [inspirations, brands, categories, customTemplates] = await Promise.all([
    api('/api/inspirations'),
    api('/api/brands'),
    api('/api/categories'),
    api('/api/custom-templates'),
  ]);
  S.inspirations = inspirations.inspirations || [];
  S.brands = brands.brands || [];
  S.categories = categories.categories || [];
  S.customTemplates = customTemplates.custom_templates || [];
  renderDesign();
}

function renderDesign() {
  const brand = S.brands.find((item) => item.id === S.brandId) || S.brands[0] || {};
  const manual = brand.brand_manual || {};
  const brandRefs = S.inspirations.filter((i) => !i.category_id);
  const categoryRefs = S.inspirations.filter((i) => i.category_id);

  byId('content').innerHTML = `
    ${pageHead('Diseno', 'El sistema visual que alimenta cada creativo generado', `<button class="btn btn-primary" onclick="addInspiration()">+ Nueva referencia</button>`)}
    <section class="settings-card">
      <div class="settings-card-head">
        <div><h2>Referencias de estilo para la IA</h2><p>Fotos que definen tu estetica. Se envian al modelo en cada imagen que genera para tu marca.</p></div>
        <span class="meta">${brandRefs.length}</span>
      </div>
      <div class="settings-card-body">
        <div class="grid three">${brandRefs.map(inspirationCard).join('') || empty('Sin referencias todavia. Sube 2-3 fotos que definan tu estilo.')}</div>
      </div>
    </section>
    <section class="settings-card">
      <div class="settings-card-head">
        <div><h2>Manual visual</h2><p>Resumen del estilo detectado. Se edita en la seccion Marca.</p></div>
        <span class="meta">${esc(brand.name || '')}</span>
      </div>
      <div class="settings-card-body">
        <div class="rules">${esc(manual.visual_style || 'Sin estilo visual')}</div>
        <div class="section-head" style="margin-top:16px"><h3>Reglas de diseno</h3></div>
        <div class="rules">${esc((manual.design_rules || []).join('\n') || 'Sin reglas')}</div>
        <div class="section-head" style="margin-top:16px"><h3>Paleta</h3></div>
        <div class="tag-row">${Object.entries(manual.colors || {}).map(([key, value]) => `<span class="tag"><span style="width:14px;height:14px;border-radius:4px;background:${esc(value)};display:inline-block;margin-right:6px"></span>${esc(key)} ${esc(value)}</span>`).join('') || '<span class="subtle">Sin colores</span>'}</div>
      </div>
    </section>
    <div class="grid two" style="margin-top:16px">
      <section class="settings-card" style="margin:0">
        <div class="settings-card-head"><div><h2>Inspiraciones por categoria</h2><p>Referencias que aplican solo a una categoria puntual.</p></div><span class="meta">${categoryRefs.length}</span></div>
        <div class="settings-card-body"><div class="grid three">${categoryRefs.map(inspirationCard).join('') || empty('Sin inspiraciones por categoria')}</div></div>
      </section>
      <section class="settings-card" style="margin:0">
        <div class="settings-card-head">
          <div><h2>Templates personalizados</h2><p>HTML/CSS propio como alternativa a la IA. Usa <code>{{hook}}</code>, <code>{{body}}</code>, <code>{{cta}}</code>.</p></div>
          <button class="btn btn-sm btn-primary" onclick="openTemplateEditor()">Nuevo</button>
        </div>
        <div class="settings-card-body"><div class="tpl-grid">${(S.customTemplates || []).map(customTemplateRow).join('') || empty('Sin templates personalizados')}</div></div>
      </section>
    </div>`;
}

function customTemplateRow(tpl) {
  return `<article class="tpl-card">
    <div class="tpl-preview">${ICON.image}</div>
    <div class="tpl-body">
      <div class="title">${esc(tpl.name)}</div>
      <span class="tag">custom_${esc(tpl.slug)}</span>
    </div>
    <div class="toolbar" style="justify-content:flex-start;padding:0 14px 14px">
      <button class="btn btn-sm" onclick="openTemplateEditor('${tpl.id}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="deleteCustomTemplate('${tpl.id}')">Eliminar</button>
    </div>
  </article>`;
}

function inspirationCard(insp) {
  return `<article class="inspiration" onclick="editInspiration('${insp.id}')">
    <img src="${esc(insp.image_url)}" alt="${esc(insp.title)}" loading="lazy" />
    <div class="title">${esc(insp.title)}</div>
    <div class="subtle">${esc(insp.category?.name || '')}</div>
    ${insp.why_it_works ? `<div class="post-copy">${esc(insp.why_it_works)}</div>` : ''}
    <div class="toolbar" style="justify-content:flex-start;margin-top:10px">
      <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();delInspiration('${insp.id}')">Eliminar</button>
    </div>
  </article>`;
}

window.addInspiration = function addInspiration() {
  inspirationModal();
};

window.editInspiration = function editInspiration(id) {
  const insp = S.inspirations.find((item) => item.id === id);
  if (insp) inspirationModal(insp);
};

function inspirationModal(insp = null) {
  const editing = Boolean(insp);
  modal(`<h3>${editing ? 'Editar inspiracion' : 'Nueva inspiracion'}</h3>
    <form onsubmit="${editing ? `updateInspiration(event,'${insp.id}')` : 'saveInspiration(event)'}" class="form-grid">
      <div class="form-group full"><label>Titulo</label><input name="title" required value="${esc(insp?.title || '')}" /></div>
      <div class="form-group full">
        <label>Subir imagen (recomendado)</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadReferenceFile(this)" />
        <div class="subtle" id="upload-status" style="margin-top:6px">Subi un archivo PNG/JPG/WEBP, o pega una URL directa de imagen abajo.</div>
      </div>
      <div class="form-group full"><label>URL de imagen</label><input name="image_url" id="insp-image-url" required value="${esc(insp?.image_url || '')}" /></div>
      <div class="form-group full"><img id="insp-image-preview" src="${esc(insp?.image_url || '')}" alt="" style="max-width:100%;border-radius:8px;${insp?.image_url ? '' : 'display:none'}" /></div>
      <div class="form-group full"><label>Categoria</label><select name="category_id"><option value="">Sin categoria (referencia global de marca)</option>${S.categories.map((cat) => `<option value="${cat.id}" ${cat.id === insp?.category_id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}</select></div>
      <div class="form-group full"><label>Notas</label><textarea name="notes" rows="3">${esc(insp?.notes || '')}</textarea></div>
      <div class="form-group full"><label>Por que funciona</label><textarea name="why_it_works" rows="2">${esc(insp?.why_it_works || '')}</textarea></div>
      <div class="form-group full"><button class="btn btn-primary">Guardar</button> <button type="button" class="btn btn-plain" onclick="closeModal()">Cancelar</button></div>
    </form>`);
}

window.uploadReferenceFile = async function uploadReferenceFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const statusEl = byId('upload-status');
  statusEl.textContent = 'Subiendo imagen...';
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api('/api/uploads/reference', { method: 'POST', body: { data_url: dataUrl } });
    byId('insp-image-url').value = res.image_url;
    const preview = byId('insp-image-preview');
    preview.src = res.image_url;
    preview.style.display = '';
    statusEl.textContent = 'Imagen subida correctamente.';
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    toast(error.message, 'error');
  }
};

function cleanForm(form) {
  const body = {};
  new FormData(form).forEach((value, key) => {
    if (String(value).trim()) body[key] = value;
  });
  return body;
}

window.saveInspiration = async function saveInspiration(event) {
  event.preventDefault();
  try {
    await api('/api/inspirations', { method: 'POST', body: cleanForm(event.target) });
    toast('Inspiracion guardada');
    closeModal();
    await loadDesign();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.updateInspiration = async function updateInspiration(event, id) {
  event.preventDefault();
  try {
    await api(`/api/inspirations/${id}`, { method: 'PATCH', body: cleanForm(event.target) });
    toast('Inspiracion actualizada');
    closeModal();
    await loadDesign();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.delInspiration = async function delInspiration(id) {
  if (!confirm('Eliminar inspiracion?')) return;
  try {
    await api(`/api/inspirations/${id}`, { method: 'DELETE' });
    toast('Inspiracion eliminada');
    await loadDesign();
  } catch (error) {
    toast(error.message, 'error');
  }
};

const CUSTOM_TEMPLATE_BOILERPLATE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 1080px;
        height: 1350px;
        margin: 0;
        overflow: hidden;
        background: #080808;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      .post {
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 80px;
        color: #fff8ef;
      }
      .hook { font-size: 88px; font-weight: 900; line-height: 1; margin: 0; }
      .body { font-size: 36px; color: #d8d0c5; margin-top: 24px; }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 20px 34px;
        border-radius: 999px;
        border: 2px solid #ff6a1a;
        background: rgba(255, 106, 26, 0.12);
        color: #fff;
        font-weight: 700;
        width: fit-content;
      }
    </style>
  </head>
  <body>
    <main class="post">
      <div>
        <h1 class="hook">{{hook}}</h1>
        <p class="body">{{body}}</p>
      </div>
      <div class="cta">{{cta}}</div>
    </main>
  </body>
</html>`;

const TEMPLATE_PREVIEW_SAMPLE = {
  hook: 'Ejemplo de hook llamativo para tu post',
  body: 'Este es un cuerpo de ejemplo para previsualizar como se ve el diseno con texto real.',
  cta: 'Call to action de ejemplo'
};

function fillTemplatePreview(html) {
  return html
    .replaceAll('{{hook}}', TEMPLATE_PREVIEW_SAMPLE.hook)
    .replaceAll('{{body}}', TEMPLATE_PREVIEW_SAMPLE.body)
    .replaceAll('{{cta}}', TEMPLATE_PREVIEW_SAMPLE.cta);
}

window.openTemplateEditor = function openTemplateEditor(id) {
  const tpl = id ? S.customTemplates.find((item) => item.id === id) : null;
  const html = tpl?.html || CUSTOM_TEMPLATE_BOILERPLATE;

  modal(`<h3>${tpl ? 'Editar template' : 'Nuevo template'}</h3>
    <form onsubmit="${tpl ? `saveTemplateEditor(event,'${tpl.id}')` : 'saveTemplateEditor(event)'}" class="form-grid">
      <div class="form-group full"><label>Nombre</label><input name="name" required value="${esc(tpl?.name || '')}" /></div>
      <div class="form-group full">
        <label>HTML/CSS (usa {{hook}}, {{body}}, {{cta}})</label>
        <textarea name="html" id="template-editor-html" rows="16" style="font-family:monospace;font-size:13px" oninput="updateTemplatePreview(this.value)">${esc(html)}</textarea>
      </div>
      <div class="form-group full">
        <label>Vista previa</label>
        <iframe id="template-editor-preview" style="width:100%;height:420px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:#000"></iframe>
      </div>
      <div class="form-group full"><button class="btn btn-primary">Guardar</button> <button type="button" class="btn btn-plain" onclick="closeModal()">Cancelar</button></div>
    </form>`);

  updateTemplatePreview(html);
};

window.updateTemplatePreview = function updateTemplatePreview(html) {
  const frame = byId('template-editor-preview');
  if (frame) frame.srcdoc = fillTemplatePreview(html);
};

window.saveTemplateEditor = async function saveTemplateEditor(event, id) {
  event.preventDefault();
  const body = cleanForm(event.target);
  try {
    if (id) {
      await api(`/api/custom-templates/${id}`, { method: 'PUT', body });
      toast('Template actualizado');
    } else {
      await api('/api/custom-templates', { method: 'POST', body });
      toast('Template creado');
    }
    closeModal();
    await loadDesign();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.deleteCustomTemplate = async function deleteCustomTemplate(id) {
  if (!confirm('Eliminar este template?')) return;
  try {
    await api(`/api/custom-templates/${id}`, { method: 'DELETE' });
    toast('Template eliminado');
    await loadDesign();
  } catch (error) {
    toast(error.message, 'error');
  }
};

// --- Analytics ---------------------------------------------------------------

async function loadAnalytics() {
  const [posts, categories, plan] = await Promise.all([
    api('/api/posts?limit=200'),
    api('/api/categories'),
    api('/api/plan').catch(() => null),
  ]);
  S.posts = posts.posts || [];
  S.categories = categories.categories || [];
  S.plan = plan;
  if (!S.anRange) S.anRange = 30;
  renderAnalytics();
}

window.setAnRange = function setAnRange(days) { S.anRange = days; renderAnalytics(); };

// --- Resultados reales -------------------------------------------------------
// Los numeros que trae Instagram de lo ya publicado. Es la unica medida honesta
// de si el contenido sirvio: sin esto, "aprobaste 40 posts" no dice nada.
window.refreshResults = async function refreshResults() {
  toast('Trayendo numeros de Instagram...');
  try {
    const res = await api('/api/results/refresh', { method: 'POST' });
    if (res.skipped) return toast(res.reason || 'Instagram no conectado', 'error');
    toast(res.updated ? `${res.updated} publicaciones actualizadas` : 'Todavia no hay publicaciones con datos', 'success');
    await loadAnalytics();
  } catch (error) {
    toast(error.message, 'error');
  }
};

function engagement(post) {
  return (post.ig_like_count || 0) + (post.ig_comments_count || 0);
}

// Promedio por grupo (formato, categoria...) descartando grupos de una sola
// publicacion: con n=1 el "mejor formato" es ruido, no una senal.
function avgBy(rows, key, min = 2) {
  const groups = new Map();
  rows.forEach((p) => {
    const k = key(p);
    if (!k) return;
    const g = groups.get(k) || { n: 0, sum: 0 };
    g.n += 1; g.sum += engagement(p);
    groups.set(k, g);
  });
  return [...groups.entries()]
    .filter(([, g]) => g.n >= min)
    .map(([k, g]) => ({ key: k, n: g.n, avg: g.sum / g.n }))
    .sort((a, b) => b.avg - a.avg);
}

const CTYPE_NAME = { story: 'Historias', carousel: 'Carruseles', ugc_video: 'Videos UGC', product_video: 'Videos de producto' };
function ctypeName(type) { return CTYPE_NAME[type] || 'Posts simples'; }

// --- Plan y consumo ----------------------------------------------------------
// Cada imagen y cada segundo de video cuestan plata. Esta tarjeta responde dos
// preguntas: cuanto me queda del plan, y cuanto le estoy costando al sistema.
function planSection() {
  const p = S.plan;
  if (!p) return '';

  const meter = (label, used, cap) => {
    const ratio = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
    const tone = ratio >= 100 ? 'over' : (ratio >= 80 ? 'warn' : '');
    return `<div class="plan-meter ${tone}">
      <div class="plan-meter-top"><span>${esc(label)}</span><b>${used} / ${cap}</b></div>
      <div class="plan-track"><i style="width:${Math.max(ratio, used ? 3 : 0)}%"></i></div>
    </div>`;
  };

  const full = p.left.posts === 0 || p.left.videos === 0;
  const near = !full && (p.left.posts <= 3 || p.left.videos === 0);
  let notice = full
    ? `<div class="plan-notice over">Llegaste al tope del plan ${esc(p.plan.name)} este mes. La generacion queda pausada hasta el 1.</div>`
    : (near ? `<div class="plan-notice warn">Te quedan ${p.left.posts} posts este mes.</div>` : '');
  if (p.trial_expired) {
    notice = `<div class="plan-notice over">Tu semana de prueba terminó. Lo que creaste queda tuyo — <a href="#" onclick="goToPlans();return false">elegí un plan</a> para seguir generando.</div>`;
  } else if (p.plan.id === 'trial' && p.trial_ends_at) {
    const dias = Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000));
    notice = `<div class="plan-notice warn">Semana de prueba: te quedan ${dias} día${dias === 1 ? '' : 's'}.</div>` + notice;
  }

  return `<section class="settings-card" style="margin:0 0 16px">
    <div class="settings-card-head">
      <div><h2>Plan y consumo</h2><p>Mes en curso, se reinicia el 1.</p></div>
      <span class="plan-chip">${esc(p.plan.name)}${p.plan.price_usd ? ` · US$${p.plan.price_usd}/mes` : ''}</span>
    </div>
    <div class="settings-card-body">
      ${notice}
      <div class="plan-meters">
        ${meter('Posts generados', p.used.posts, p.limits.posts)}
        ${meter('Videos generados', p.used.videos, p.limits.videos)}
      </div>
      <div class="plan-cost">
        <div><b>${p.used.images}</b><span>imagenes generadas</span></div>
        <div><b>${p.used.video_seconds}s</b><span>de video generado</span></div>
      </div>
    </div>
  </section>`;
}

function resultsSection() {
  const published = S.posts.filter((p) => p.status === 'posted');
  const withStats = published.filter((p) => p.ig_stats_at);

  const head = `<div class="settings-card-head">
    <div><h2>Resultados en Instagram</h2><p>Numeros reales de lo que ya publicaste.</p></div>
    <button class="btn btn-sm" onclick="refreshResults()">Actualizar resultados</button>
  </div>`;

  if (!withStats.length) {
    const msg = published.length
      ? 'Toca "Actualizar resultados" para traer los likes y comentarios de tus publicaciones.'
      : 'Cuando publiques tu primer post vas a ver aca como le fue.';
    return `<section class="settings-card" style="margin:0 0 16px">${head}<div class="settings-card-body">${empty(msg)}</div></section>`;
  }

  const likes = withStats.reduce((acc, p) => acc + (p.ig_like_count || 0), 0);
  const comments = withStats.reduce((acc, p) => acc + (p.ig_comments_count || 0), 0);
  const avg = Math.round((likes + comments) / withStats.length * 10) / 10;
  const byType = avgBy(withStats, (p) => ctypeName(p.content_type));
  const catName = new Map(S.categories.map((c) => [c.id, c.name]));
  const byCat = avgBy(withStats, (p) => catName.get(p.category_id));

  const top = [...withStats].sort((a, b) => engagement(b) - engagement(a)).slice(0, 3);
  const rank = top.map((p, i) => `<a class="res-row" ${p.ig_permalink ? `href="${esc(p.ig_permalink)}" target="_blank" rel="noopener"` : ''}>
    <span class="res-pos">${i + 1}</span>
    ${p.image_url ? `<img class="res-thumb" src="${esc(p.image_url)}" alt="" loading="lazy" />` : '<span class="res-thumb"></span>'}
    <span class="res-text">
      <b>${esc((p.caption_instagram || p.hook || 'Post').slice(0, 70))}</b>
      <small>${esc(ctypeName(p.content_type))} · ${esc(fmtDate(String(p.created_at || '').slice(0, 10)))}</small>
    </span>
    <span class="res-nums">${p.ig_like_count || 0} ❤ · ${p.ig_comments_count || 0} 💬</span>
  </a>`).join('');

  const lessons = [];
  if (byType.length > 1) {
    const best = byType[0];
    const worst = byType[byType.length - 1];
    lessons.push(`${best.key} es lo que mejor te funciona: ${Math.round(best.avg * 10) / 10} interacciones promedio contra ${Math.round(worst.avg * 10) / 10} de ${worst.key.toLowerCase()}.`);
  }
  if (byCat.length > 1) lessons.push(`El tema "${byCat[0].key}" rinde ${Math.round(byCat[0].avg * 10) / 10} interacciones promedio, arriba del resto.`);
  if (top[0] && engagement(top[0]) > avg * 2) lessons.push('Tu mejor publicacion rinde mas del doble del promedio: vale la pena repetir ese angulo.');
  if (withStats.length >= 4) lessons.push('El motor ya usa estos numeros: las proximas ideas se apoyan en los angulos que mejor te rindieron.');
  else lessons.push(`Con ${4 - withStats.length} publicacion${withStats.length === 3 ? '' : 'es'} medida${withStats.length === 3 ? '' : 's'} mas, el motor empieza a generar ideas en base a tus resultados.`);
  if (published.length > withStats.length) lessons.push(`${published.length - withStats.length} publicaciones viejas quedaron fuera de los ultimos medios de Instagram y no traen numeros.`);

  return `<section class="settings-card" style="margin:0 0 16px">
    ${head}
    <div class="settings-card-body">
      <div class="res-kpis">
        <div><b>${withStats.length}</b><span>publicaciones medidas</span></div>
        <div><b>${likes}</b><span>likes</span></div>
        <div><b>${comments}</b><span>comentarios</span></div>
        <div><b>${avg}</b><span>interacciones por post</span></div>
      </div>
      <h3 class="res-sub">Lo que mejor funciono</h3>
      <div class="res-rank">${rank}</div>
      ${lessons.length ? `<ul class="insight-list" style="margin-top:14px">${lessons.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </div>
  </section>`;
}

function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }

function renderAnalytics() {
  const since = new Date(Date.now() - S.anRange * 24 * 3600 * 1000).toISOString();
  const posts = S.posts.filter((p) => p.created_at >= since);
  const catName = new Map(S.categories.map((c) => [c.id, c.name]));

  const total = posts.length;
  const approvedish = posts.filter((p) => p.status === 'approved' || p.status === 'posted');
  const rejected = posts.filter((p) => p.status === 'rejected');
  const reviewed = approvedish.length + rejected.length;
  const approvalRate = pct(approvedish.length, reviewed);
  const rejectRate = pct(rejected.length, reviewed);

  // Best category / template among approved+posted posts.
  const tally = (rows, key) => {
    const acc = {};
    rows.forEach((p) => { const k = key(p); if (k) acc[k] = (acc[k] || 0) + 1; });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  };
  const byCat = tally(approvedish, (p) => catName.get(p.category_id));
  const byTpl = tally(approvedish, (p) => p.template_id);
  const bestCat = byCat[0]?.[0] || null;
  const bestTpl = byTpl[0]?.[0] || null;

  const kpis = `<div class="grid metrics">
    ${metricCard({ icon: ICON.image, label: 'Posts generados', value: String(total), note: `ultimos ${S.anRange} dias` })}
    ${metricCard({ icon: ICON.check, tone: 'tone-good', label: 'Tasa de aprobacion', value: reviewed ? `${approvalRate}%` : '—', note: reviewed ? `${approvedish.length} de ${reviewed} revisados` : 'Sin posts revisados aun' })}
    ${metricCard({ icon: ICON.edit, tone: 'tone-bad', label: 'Tasa de rechazo', value: reviewed ? `${rejectRate}%` : '—', note: reviewed ? `${rejected.length} rechazados` : 'Sin posts revisados aun' })}
    ${metricCard({ icon: ICON.star, tone: 'tone-info', label: 'Mejor categoria', value: bestCat || '—', note: bestCat ? `${byCat[0][1]} aprobados` : 'Aproba posts para ver esto' })}
  </div>`;

  // Status distribution bars.
  const statuses = ['generated', 'needs_review', 'approved', 'posted', 'rejected'];
  const counts = statuses.map((s) => posts.filter((p) => p.status === s).length);
  const max = Math.max(...counts, 1);
  const bars = statuses.map((s, i) => `<div class="an-bar-row">
    <span class="an-bar-label">${POST_FILTER_LABELS[s] || s}</span>
    <div class="an-bar-track"><div class="an-bar-fill st-${s}" style="width:${Math.max(pct(counts[i], max), counts[i] ? 4 : 0)}%"></div></div>
    <span class="an-bar-count">${counts[i]}</span>
  </div>`).join('');

  // Insights derived from real data only.
  const insights = [];
  if (bestCat) insights.push(`Los posts de "${bestCat}" son los que mas aprobas — el motor va a seguir priorizando ese angulo.`);
  if (bestTpl) insights.push(`El template "${bestTpl}" es el que mejor funciona (${byTpl[0][1]} aprobados).`);
  if (reviewed >= 5 && approvalRate >= 70) insights.push(`Tu tasa de aprobacion es alta (${approvalRate}%): el estilo detectado esta alineado con tu marca.`);
  if (reviewed >= 5 && rejectRate >= 40) insights.push(`Estas rechazando ${rejectRate}% de los posts. Ajusta las instrucciones de imagen o las referencias en Diseno para afinar el estilo.`);
  const pendingReview = posts.filter((p) => p.status === 'needs_review').length;
  if (pendingReview > 0) insights.push(`Tenes ${pendingReview} post${pendingReview > 1 ? 's' : ''} esperando revision.`);

  const recommendations = [];
  if (!reviewed) recommendations.push('Aproba o rechaza tus primeros posts para que el sistema aprenda que funciona.');
  if (byCat.length > 1) recommendations.push(`Proba generar mas contenido de "${byCat[0][0]}" esta semana.`);
  const failedRenders = posts.filter((p) => p.render_error).length;
  if (failedRenders > 0) recommendations.push(`${failedRenders} render${failedRenders > 1 ? 'es' : ''} fallaron — regeneralos desde Posts.`);
  if (!recommendations.length) recommendations.push('Todo en orden. Segui aprobando contenido para mejorar las senales.');

  const list = (items) => `<ul class="insight-list">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

  byId('content').innerHTML = `
    ${pageHead('Analytics', 'Rendimiento y aprendizaje de tu contenido', `
      <div class="segmented">
        ${[7, 30, 90].map((d) => `<button class="seg-opt ${S.anRange === d ? 'active' : ''}" onclick="setAnRange(${d})">${d}d</button>`).join('')}
      </div>
    `)}
    ${planSection()}
    ${resultsSection()}
    ${kpis}
    <div class="grid two" style="margin-top:16px">
      <section class="settings-card" style="margin:0">
        <div class="settings-card-head"><div><h2>Posts por estado</h2><p>Distribucion del contenido generado en el periodo.</p></div></div>
        <div class="settings-card-body">${total ? bars : empty('Sin posts en este periodo')}</div>
      </section>
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="settings-card" style="margin:0">
          <div class="settings-card-head"><div><h2>Que funciono</h2><p>Senales reales de tus aprobaciones.</p></div></div>
          <div class="settings-card-body">${insights.length ? list(insights) : empty('Aproba posts para generar insights')}</div>
        </section>
        <section class="settings-card" style="margin:0">
          <div class="settings-card-head"><div><h2>Recomendaciones</h2><p>Proximos pasos sugeridos.</p></div></div>
          <div class="settings-card-body">${list(recommendations)}</div>
        </section>
      </div>
    </div>`;
}

async function loadSystem() {
  const automation = await api('/api/automation').catch(() => ({ automation: null }));
  S.automation = automation.automation;
  renderSystem({ ok: true });
}

function fmtDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  } catch {
    return value;
  }
}

function healthItem(label, value, tone) {
  return `<div class="health-item">
    <strong>${esc(label)}</strong>
    <span class="${tone}">${esc(value)}</span>
  </div>`;
}

function automationPanel() {
  const a = S.automation;
  if (!a) {
    return `<section class="section">
      <div class="section-head"><h2>Automatizacion</h2><span class="bad">no disponible</span></div>
      <div class="empty">No se pudo leer el estado del scheduler</div>
    </section>`;
  }

  const last = a.last_result;
  let lastLine = 'Nunca ejecutado';
  if (last) {
    if (last.error) lastLine = `Error: ${last.error}`;
    else {
      const ideas = last.queue?.inserted ?? 0;
      const post = last.post?.id ? 'post generado' : (last.post?.skipped ? 'sin post hoy' : 'sin post');
      lastLine = `${ideas} ideas · ${post}`;
    }
  }

  return `<section class="section">
    <div class="section-head">
      <h2>Automatizacion diaria</h2>
      <span class="${a.enabled ? 'ok' : 'bad'}">${a.enabled ? 'activa' : 'desactivada'}</span>
    </div>
    <div class="health-grid">
      ${healthItem('Horario', `${a.time} ${a.time_zone}`, a.enabled ? 'ok' : 'bad')}
      ${healthItem('Objetivo cola', `${a.queue_target} ideas`, 'ok')}
      ${healthItem('Auto render', a.auto_render ? 'Si' : 'No', a.auto_render ? 'ok' : 'bad')}
      ${healthItem('Proxima corrida', fmtDateTime(a.next_run_at), 'ok')}
      ${healthItem('Ultima corrida', fmtDateTime(a.last_run_at), 'ok')}
      ${healthItem('Ultimo resultado', lastLine, 'ok')}
    </div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:12px">
      <button class="btn btn-primary" onclick="runAutomationNow()" ${a.running ? 'disabled' : ''}>
        ${a.running ? 'Ejecutando...' : 'Ejecutar ahora'}
      </button>
    </div>
  </section>`;
}

window.runAutomationNow = async function runAutomationNow() {
  toast('Ejecutando automatizacion...');
  try {
    await api('/api/automation/run', { method: 'POST' });
    toast('Automatizacion ejecutada');
    await loadSystem();
  } catch (error) {
    toast(error.message, 'error');
  }
};

const SETTINGS_TABS = [
  ['integraciones', 'Integraciones'],
  ['publicacion', 'Publicacion'],
  ['cuenta', 'Cuenta'],
];

window.setSettingsTab = function setSettingsTab(tab) { S.settingsTab = tab; renderSystem(S.lastHealth || { ok: true }); };

function integrationRow({ icon, name, desc, connected, detail, action }) {
  return `<div class="integration-row">
    <div class="ig-connected" style="flex:1;min-width:0">
      <div class="platform-chip">${icon}</div>
      <div style="min-width:0">
        <div class="t-label">${esc(name)}</div>
        <div class="t-desc">${esc(detail || desc)}</div>
      </div>
    </div>
    ${connected === null
      ? '<span class="status status-skipped">Proximamente</span>'
      : (connected ? '<span class="status status-approved">Conectada</span>' : '<span class="status status-pending">Sin conectar</span>')}
    ${action || ''}
  </div>`;
}

function settingsIntegraciones(brand) {
  const goBrand = `<button class="btn btn-sm" onclick="document.querySelector('[data-tab=brand]').click()">Configurar</button>`;
  const chat = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.5-4.6A8.5 8.5 0 1 1 21 12Z"/></svg>';
  const generic = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';
  return `<section class="settings-card">
    <div class="settings-card-head"><div><h2>Canales conectados</h2><p>Donde se publica y por donde apruebas el contenido de ${esc(brand?.name || 'tu marca')}.</p></div></div>
    <div class="settings-card-body">
      ${integrationRow({ icon: ICON.instagram, name: 'Instagram', desc: 'Publicacion automatica de creativos', connected: Boolean(brand?.ig_username || brand?.ig_connected_at), detail: brand?.ig_username ? `@${brand.ig_username} · publica los posts aprobados` : 'Publicacion automatica de creativos', action: goBrand })}
      ${integrationRow({ icon: chat, name: 'WhatsApp', desc: 'Aprobacion de posts desde el chat', connected: Boolean(brand?.whatsapp_number), detail: brand?.whatsapp_number ? `+${brand.whatsapp_number} recibe cada creativo` : 'Aprobacion de posts desde el chat', action: goBrand })}
      ${integrationRow({ icon: generic, name: 'Facebook', desc: 'Publicacion en paginas', connected: null })}
      ${integrationRow({ icon: generic, name: 'Slack', desc: 'Notificaciones al equipo', connected: null })}
      ${integrationRow({ icon: generic, name: 'Telegram', desc: 'Aprobaciones por bot', connected: null })}
    </div>
  </section>`;
}

function settingsPublicacion(brand) {
  return `<section class="settings-card">
    <div class="settings-card-head"><div><h2>Flujo de publicacion</h2><p>Como pasa un creativo de generado a publicado.</p></div></div>
    <div class="settings-card-body form-grid">
      <div class="form-group full">
        <div class="toggle-row">
          <div><div class="t-label">Publicacion automatica</div><div class="t-desc">Los posts aprobados se publican solos en la fecha de su calendario.</div></div>
          <input type="checkbox" class="toggle" ${brand?.auto_publish === false ? '' : 'checked'} ${brand?.ig_username ? '' : 'disabled'} onchange="toggleAutoPublish(this.checked)" />
        </div>
      </div>
      <div class="form-group full">
        <div class="toggle-row">
          <div><div class="t-label">Aprobacion por WhatsApp</div><div class="t-desc">${brand?.whatsapp_number ? `Cada creativo nuevo llega a +${esc(brand.whatsapp_number)} con botones Aprobar / Rechazar.` : 'Configura un numero en Marca para aprobar desde el chat.'}</div></div>
          <span class="status ${brand?.whatsapp_number ? 'status-approved' : 'status-skipped'}">${brand?.whatsapp_number ? 'Activa' : 'Inactiva'}</span>
        </div>
      </div>
      <div class="form-group full">
        <div class="toggle-row">
          <div><div class="t-label">Revision manual</div><div class="t-desc">Todo post generado queda en "En revision" hasta que lo apruebes aca o por WhatsApp.</div></div>
          <span class="status status-approved">Siempre</span>
        </div>
      </div>
    </div>
  </section>
  ${automationPanel()}`;
}

function settingsCuenta(brand) {
  return `<section class="settings-card">
    <div class="settings-card-head"><div><h2>Tu cuenta</h2><p>Sesion y marcas asociadas.</p></div></div>
    <div class="settings-card-body form-grid">
      <div class="form-group"><label>Email</label><input value="${esc(S.userEmail || '')}" readonly /></div>
      <div class="form-group"><label>Marca activa</label><input value="${esc(brand?.name || '-')}" readonly /></div>
      <div class="form-group full"><label>Marcas en tu cuenta</label>
        <div class="tag-row">${S.brands.map((b) => `<span class="tag">${esc(b.name)}</span>`).join('') || '<span class="subtle">Sin marcas</span>'}</div>
      </div>
      <div class="form-group full" style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn" onclick="startTour(true)">Ver tutorial</button>
        <button type="button" class="btn" onclick="openOnboarding()">+ Crear otra marca</button>
        <button type="button" class="btn btn-danger" onclick="logout()">Cerrar sesion</button>
      </div>
    </div>
    <div class="settings-card-body" id="billing-box">
      <div class="subtle">Cargando tu plan...</div>
    </div>
    <div class="settings-card-body danger-zone">
      <div>
        <b>Borrar mi cuenta</b>
        <p>Se borran tus marcas, tu contenido y tus datos. No se puede deshacer.</p>
      </div>
      <button type="button" class="btn btn-danger" onclick="confirmDeleteAccount()">Borrar cuenta</button>
    </div>
  </section>`;
}

// --- Plan y suscripcion ---
async function loadBilling() {
  const box = byId('billing-box');
  if (!box) return;
  try {
    const data = await api('/api/billing');
    box.innerHTML = billingBox(data);
  } catch (error) {
    box.innerHTML = `<div class="subtle">No se pudo cargar tu plan: ${esc(error.message)}</div>`;
  }
}

function billingBox(data) {
  const sub = data.subscription;
  const activa = sub?.status === 'authorized';

  if (!data.configured) {
    return `<div>
      <b>Tu plan</b>
      <p class="subtle" style="margin:4px 0 0">Estas usando Postia sin cargo mientras terminamos de habilitar el cobro. Te avisamos antes de que empiece a facturarse.</p>
    </div>`;
  }

  if (activa) {
    return `<div class="billing-row">
      <div>
        <b>Plan ${esc(PLAN_NAME(sub.plan))} · activo</b>
        <p class="subtle" style="margin:4px 0 0">Se renueva todos los meses. Podes cancelar cuando quieras y seguis hasta el final del periodo pago.</p>
      </div>
      <button type="button" class="btn" onclick="cancelPlan()">Cancelar suscripcion</button>
    </div>`;
  }

  return `<div>
    <b>Elegi tu plan</b>
    <p class="subtle" style="margin:4px 0 10px">${sub ? 'Tu pago quedo pendiente en Mercado Pago.' : 'Estas en el plan de prueba.'}</p>
    <div class="plan-picker">
      ${data.plans.map((plan) => `<button type="button" class="plan-opt" onclick="startCheckout('${plan.id}')">
        <b>${esc(plan.name)}</b>
        <span>US$${plan.priceUsd} / mes</span>
        <small>${esc(plan.blurb)}</small>
      </button>`).join('')}
    </div>
  </div>`;
}

function PLAN_NAME(id) {
  return { trial: 'Prueba', starter: 'Emprendedor', business: 'Negocio', agency: 'Agencia' }[id] || id;
}

window.startCheckout = async function startCheckout(plan) {
  toast('Preparando el pago...');
  try {
    const res = await api('/api/billing/checkout', { method: 'POST', body: { plan } });
    if (!res.checkout_url) throw new Error('Mercado Pago no devolvio el link de pago');
    window.location.href = res.checkout_url;
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.cancelPlan = async function cancelPlan() {
  if (!window.confirm('¿Cancelar la suscripcion? Tu marca vuelve al plan de prueba.')) return;
  try {
    await api('/api/billing/cancel', { method: 'POST' });
    toast('Suscripcion cancelada', 'success');
    loadBilling();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.confirmDeleteAccount = function confirmDeleteAccount() {
  modal(`<h3>Borrar tu cuenta</h3>
    <p class="subtle" style="margin:0 0 14px">
      Se borran para siempre tus ${S.brands.length} marca${S.brands.length === 1 ? '' : 's'}, todo el contenido generado
      y la conexion con Instagram. Esto no se puede deshacer.
    </p>
    <div class="form-group"><label>Escribi BORRAR para confirmar</label>
      <input id="del-confirm" autocomplete="off" placeholder="BORRAR" /></div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:16px">
      <button class="btn btn-danger" onclick="doDeleteAccount()">Borrar mi cuenta</button>
      <button class="btn btn-plain" onclick="closeModal()">Cancelar</button>
    </div>`);
};

window.doDeleteAccount = async function doDeleteAccount() {
  const confirm = byId('del-confirm')?.value;
  try {
    await api('/api/account', { method: 'DELETE', body: { confirm } });
    closeModal();
    storeSession(null);
    localStorage.removeItem(BRAND_KEY);
    byId('content').innerHTML = empty('Tu cuenta fue borrada. Gracias por probar Postia.');
  } catch (error) {
    toast(error.message, 'error');
  }
};

function renderSystem(health) {
  S.lastHealth = health;
  if (!SETTINGS_TABS.some(([id]) => id === S.settingsTab)) S.settingsTab = 'integraciones';
  const brand = S.brands.find((b) => b.id === S.brandId) || S.brands[0] || null;

  const tabs = `<div class="segmented" style="margin-bottom:18px">
    ${SETTINGS_TABS.map(([id, label]) => `<button class="seg-opt ${S.settingsTab === id ? 'active' : ''}" onclick="setSettingsTab('${id}')">${label}</button>`).join('')}
  </div>`;

  const body = {
    integraciones: () => settingsIntegraciones(brand),
    publicacion: () => settingsPublicacion(brand),
    cuenta: () => settingsCuenta(brand),
  }[S.settingsTab]();

  byId('content').innerHTML = `
    ${pageHead('Ajustes', 'Integraciones, publicacion y configuracion de tu cuenta', `<button class="btn" onclick="loadSystem()">Actualizar</button>`)}
    ${tabs}
    ${body}`;

  // El plan se pide aparte para no demorar el resto de Ajustes.
  if (S.settingsTab === 'cuenta') loadBilling();
}

// --- Auth & multi-brand boot -----------------------------------------------

const AUTH_TITLES = {
  login: ['Hola de nuevo', 'Entrá para ver tus marcas y tu contenido.'],
  signup: ['Creá tu cuenta', 'Tu primera semana de contenido es gratis. Sin tarjeta.'],
  forgot: ['Recuperá tu cuenta', 'Te mandamos un link para poner una contraseña nueva.'],
  recuperar: ['Nueva contraseña', 'Elegí una contraseña y volvés a entrar.']
};

function authBody(mode) {
  const [title, sub] = AUTH_TITLES[mode] || AUTH_TITLES.login;
  const head = `<h2>${title}</h2><span class="subtle">${sub}</span>`;

  if (mode === 'forgot') {
    return `${head}
      <form onsubmit="submitForgot(event)">
        <div class="form-group"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="tu@email.com" /></div>
        <button class="btn btn-primary">Mandame el link</button>
      </form>
      <div class="auth-switch" onclick="renderLoginMode('login')">← Volver a iniciar sesión</div>`;
  }

  if (mode === 'recuperar') {
    return `${head}
      <form onsubmit="submitReset(event)">
        <div class="form-group"><label>Contraseña nueva</label><input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres" /></div>
        <button class="btn btn-primary">Guardar y entrar</button>
      </form>
      <div class="auth-switch" onclick="renderLoginMode('login')">← Volver a iniciar sesión</div>`;
  }

  return `${head}
    <form onsubmit="submitAuth(event,'${mode}')">
      <div class="form-group"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="tu@email.com" /></div>
      <div class="form-group"><label>Contraseña</label><input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="Mínimo 8 caracteres" /></div>
      <button class="btn btn-primary">${mode === 'login' ? 'Entrar' : 'Empezar gratis'}</button>
    </form>
    ${mode === 'login'
      ? `<div class="auth-forgot" onclick="renderLoginMode('forgot')">¿Olvidaste tu contraseña?</div>`
      : `<div class="auth-legal">Al crear tu cuenta aceptás los <a href="https://postia.ar/terminos" target="_blank" rel="noopener">términos</a> y la <a href="https://postia.ar/privacidad" target="_blank" rel="noopener">política de privacidad</a>.</div>`}
    <div class="auth-switch" onclick="renderLoginMode('${mode === 'login' ? 'signup' : 'login'}')">
      ${mode === 'login' ? '¿No tenés cuenta? <b>Creá una gratis</b>' : '¿Ya tenés cuenta? <b>Iniciá sesión</b>'}
    </div>`;
}

function renderLogin(mode = 'login') {
  document.querySelector('.sidebar')?.classList.add('hidden-auth');
  document.querySelector('.topbar-new')?.classList.add('hidden-auth');
  byId('content').innerHTML = `
    <div class="auth-shell">
      <div class="auth-hero">
        <a class="auth-brand" href="https://postia.ar"><span class="mark">P</span>Postia</a>

        <div>
          <h1>Dejá de pensar qué postear.</h1>
          <p class="hero-sub">Postia crea los posts, carruseles, historias y videos de tu Instagram. Vos aprobás desde WhatsApp y se publican solos.</p>
        </div>

        <div class="hero-points">
          <div class="hero-point">Ideas pensadas para tu rubro, agendadas solas todos los días.</div>
          <div class="hero-point">Imágenes y videos listos, con tu identidad y tus precios reales.</div>
          <div class="hero-point">Nada se publica sin tu OK: aprobás con un toque, desde el chat.</div>
        </div>

        <div class="hero-foot">¿Todavía no la conocés? <a href="https://postia.ar">Mirá cómo funciona</a></div>
      </div>

      <div class="auth-panel">
        <div class="auth-card">
          <a class="auth-brand-sm" href="https://postia.ar"><span class="mark">P</span>Postia</a>
          ${authBody(mode)}
        </div>
      </div>
    </div>`;
}

window.renderLoginMode = renderLogin;

window.submitAuth = async function submitAuth(event, mode) {
  event.preventDefault();
  const fd = new FormData(event.target);
  try {
    const res = await fetch(`/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
    });
    const data = await res.json();
    if (!res.ok || !data.session) throw new Error(data.error || 'Error de autenticacion');
    storeSession(data.session);
    toast('Bienvenido');
    await bootApp();
  } catch (error) {
    toast(error.message, 'error');
  }
};

window.submitForgot = async function submitForgot(event) {
  event.preventDefault();
  const email = new FormData(event.target).get('email');
  try {
    const res = await fetch('/auth/forgot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mail');
    toast(data.message || 'Revisá tu casilla', 'success');
    renderLogin('login');
  } catch (error) {
    toast(error.message, 'error');
  }
};

// El token de recuperacion viene en el fragmento de la URL que arma Supabase.
// Se guarda en memoria y NO se deja en la barra de direcciones.
let recoveryToken = null;

window.submitReset = async function submitReset(event) {
  event.preventDefault();
  const password = new FormData(event.target).get('password');
  try {
    const res = await fetch('/auth/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: recoveryToken, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña');
    recoveryToken = null;
    toast('Contraseña actualizada. Entrá con la nueva.', 'success');
    renderLogin('login');
  } catch (error) {
    toast(error.message, 'error');
  }
};

// Detecta la vuelta del mail de recuperacion antes de arrancar la app.
function handleRecoveryRedirect() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const params = new URLSearchParams(hash);
  if (params.get('type') !== 'recovery' || !params.get('access_token')) return false;

  recoveryToken = params.get('access_token');
  history.replaceState(null, '', location.pathname);
  renderLogin('recuperar');
  return true;
}

window.logout = function logout() {
  storeSession(null);
  localStorage.removeItem(BRAND_KEY);
  window.location.reload();
};

// --- Aviso de fin de prueba ---------------------------------------------------
// Un banner arriba de todo cuando la semana gratis vencio o esta por vencer.
// Es EL momento de conversion: el aviso lleva directo a elegir plan.
window.goToPlans = function goToPlans() {
  S.settingsTab = 'cuenta';
  if (S.tab === 'system') { renderSystem(S.lastHealth || { ok: true }); }
  else { location.hash = '#system'; }
};

async function checkTrialBanner() {
  try {
    const p = await api('/api/plan');
    if (p.plan?.id !== 'trial' || !p.trial_ends_at) return;

    const msLeft = new Date(p.trial_ends_at).getTime() - Date.now();
    const expired = p.trial_expired || msLeft <= 0;
    const daysLeft = Math.ceil(msLeft / 86400000);
    if (!expired && daysLeft > 2) return;

    const text = expired
      ? 'Tu semana de prueba terminó. Lo que creaste queda tuyo — elegí un plan para seguir generando.'
      : `Tu semana de prueba termina ${daysLeft <= 1 ? 'mañana' : `en ${daysLeft} días`}. Elegí un plan y no pares de publicar.`;

    document.getElementById('trial-banner')?.remove();
    const bar = document.createElement('div');
    bar.id = 'trial-banner';
    bar.className = expired ? 'trial-banner expired' : 'trial-banner';
    bar.innerHTML = `<span>${text}</span><button class="btn btn-sm btn-primary" onclick="goToPlans()">Ver planes</button>`;
    document.body.prepend(bar);
  } catch { /* sin plan no hay banner */ }
}

// El link al panel solo aparece si el backend dice que esta cuenta es
// operadora. Se consulta una vez por sesion.
async function checkAdmin() {
  if (S.isAdmin !== undefined) return;
  S.isAdmin = false;
  try {
    const res = await api('/api/admin/whoami');
    S.isAdmin = Boolean(res.admin);
  } catch { /* si falla, simplemente no se muestra el link */ }
  if (S.isAdmin) ensureBrandBar();
}

function ensureBrandBar() {
  document.querySelector('.sidebar')?.classList.remove('hidden-auth');
  document.querySelector('.topbar-new')?.classList.remove('hidden-auth');
  const foot = byId('side-foot');
  if (!foot) return;
  const initial = (S.userEmail || '?').slice(0, 1).toUpperCase();
  foot.innerHTML = `
    <div class="brand-switch">
      ${S.brands.length ? `<select onchange="switchBrand(this.value)" title="Cambiar de marca">
        ${S.brands.map((brand) => `<option value="${brand.id}" ${brand.id === S.brandId ? 'selected' : ''}>${esc(brand.name)}</option>`).join('')}
      </select>` : ''}
      <div class="user-row">
        <div class="user-avatar">${esc(initial)}</div>
        <div class="user-meta"><strong>${esc(S.userEmail || 'Cuenta')}</strong><span>Admin</span></div>
      </div>
      <div class="foot-row">
        <button class="btn btn-sm" onclick="openOnboarding()">+ Marca</button>
        <button class="btn btn-sm btn-plain" onclick="logout()">Salir</button>
      </div>
      ${S.isAdmin ? '<a class="btn btn-sm btn-plain foot-admin" href="/admin">Panel de operacion</a>' : ''}
    </div>`;
}

window.switchBrand = async function switchBrand(brandId) {
  S.brandId = brandId;
  localStorage.setItem(BRAND_KEY, brandId);
  S.templates = []; S.categories = []; S.inspirations = []; S.customTemplates = [];
  try {
    await loadBootstrap();
    await loadTab();
    ensureBrandBar();
  } catch (error) {
    toast(error.message, 'error');
  }
};

// --- Onboarding wizard ------------------------------------------------------

// --- Onboarding focus options + social proof (shown per choice) ------------

const ONB_FOCUS = [
  { id: 'ventas', emoji: '🛒', title: 'Que me compren', desc: 'Mostrar lo que vendo y mover pedidos, turnos o reservas' },
  { id: 'redes', emoji: '💬', title: 'Que me conozcan', desc: 'Estar presente todos los dias y construir comunidad' },
  { id: 'ambos', emoji: '⚖️', title: 'Un poco de cada uno', desc: 'Contenido de valor que ademas empuja a comprar' },
];

const ONB_AVOID = [
  'Sin precios', 'Sin emojis', 'Sin texto sobre la foto', 'Sin descuentos',
  'Sin gente en las fotos', 'Sin jerga tecnica', 'Nada de la competencia',
];

const ONB_TONE = [
  { id: 'cercano', title: 'Cercano', desc: 'Como le hablas a un cliente de siempre' },
  { id: 'premium', title: 'Premium', desc: 'Cuidado y elegante, sin estridencias' },
  { id: 'divertido', title: 'Divertido', desc: 'Suelto, con humor y guiños' },
  { id: 'experto', title: 'Experto', desc: 'Didactico, explicando el porque' },
];

const ONB_STEPS = ['instagram', 'focus', 'negocio', 'preferences', 'resumen'];

// Lo que el motor hace de verdad, en orden. Se usa para la pantalla de espera:
// cada paso corresponde a un trabajo real del backend (onboarding.js).
const ONB_WORK_IG = [
  { ico: '👀', label: 'Leyendo tu perfil', detail: 'Nombre, bio, foto y ultimas publicaciones' },
  { ico: '🖼️', label: 'Mirando tus fotos', detail: 'Encuadres, luz, colores y como se ve tu producto' },
  { ico: '🎨', label: 'Detectando tu identidad', detail: 'Tu paleta, tu tipografia y tu manera de mostrarte' },
  { ico: '📝', label: 'Escribiendo tu manual de marca', detail: 'Tu voz, tus reglas de diseño y que evitar' },
  { ico: '🗂️', label: 'Armando tus categorias', detail: 'Los pilares sobre los que va a girar tu contenido' },
  { ico: '💡', label: 'Pensando tus primeras ideas', detail: 'Una semana completa, ya agendada' },
];

const ONB_WORK_MANUAL = [
  { ico: '🧭', label: 'Entendiendo tu negocio', detail: 'Tu rubro, que vendes y a quien le hablas' },
  { ico: '🎨', label: 'Definiendo tu identidad', detail: 'Una paleta y un estilo visual para tu marca' },
  { ico: '📝', label: 'Escribiendo tu manual de marca', detail: 'Tu voz, tus reglas de diseño y que evitar' },
  { ico: '🗂️', label: 'Armando tus categorias', detail: 'Los pilares sobre los que va a girar tu contenido' },
  { ico: '💡', label: 'Pensando tus primeras ideas', detail: 'Una semana completa, ya agendada' },
];

// Datos utiles para la espera. Todos verificables sobre el propio producto.
const ONB_TIPS = [
  'Ninguna pieza se publica sin que la apruebes vos.',
  'Podes aprobar o rechazar desde WhatsApp, sin entrar al panel.',
  'Cada dia lleva un post de feed y una historia que lo acompaña.',
  'Si cargas tu catalogo, las promos usan tus precios exactos.',
  'Los carruseles se escriben placa por placa, con gancho y cierre.',
  'Subi tu logo y la IA lo integra en los envases, la ropa o los carteles.',
];

window.openOnboarding = function openOnboarding() {
  S.onb = { step: 0, data: { mode: 'instagram', instagram_url: '', brand_name: '', brand_desc: '', focus: '', tone: 'cercano', estrella: '', publico: '', objetivo: '', avoid: [] } };
  renderOnbStep();
};

window.onbSetMode = function onbSetMode(mode) { S.onb.data.mode = mode; renderOnbStep(); };

function renderOnbStep() {
  const { step, data } = S.onb;
  const total = ONB_STEPS.length;
  const pct = Math.round(((step + 1) / total) * 100);
  const kind = ONB_STEPS[step];
  const canBack = step > 0;

  let body = '';
  let footer = '';

  if (kind === 'instagram') {
    const modeTabs = `<div class="segmented" style="margin:0 0 18px">
      <button class="seg-opt ${data.mode === 'instagram' ? 'active' : ''}" onclick="onbSetMode('instagram')">Tengo Instagram</button>
      <button class="seg-opt ${data.mode === 'manual' ? 'active' : ''}" onclick="onbSetMode('manual')">Empezar sin Instagram</button>
    </div>`;

    if (data.mode === 'manual') {
      body = `<div class="wizard-emoji">✍️</div>
        <h3>Contanos de tu marca</h3>
        <span class="lead">Con esto la IA arma tu identidad, tu estilo visual y tus primeras ideas. Despues podes conectar Instagram cuando quieras.</span>
        ${modeTabs}
        <div class="form-group full"><label>Nombre de la marca</label>
          <input value="${esc(data.brand_name)}" placeholder="Ej: Helados Nube" oninput="S.onb.data.brand_name=this.value" /></div>
        <div class="form-group full" style="margin-top:10px"><label>Que hace y que vende?</label>
          <textarea rows="4" placeholder="Ej: Heladeria artesanal en Rosario. Vendemos helado por kilo y postres helados. Clientes de barrio, familias. Onda calida y cercana." oninput="S.onb.data.brand_desc=this.value">${esc(data.brand_desc)}</textarea>
          <div class="subtle" style="margin-top:6px">Cuanto mas detalle (rubro, productos, clientes, tono), mejor sale todo.</div></div>`;
    } else {
      body = `<div class="wizard-emoji">👋</div>
        <h3>Empecemos por tu Instagram</h3>
        <span class="lead">Analizamos tu cuenta y aprendemos tu estilo, tus colores, tu logo y tu tono. Solo cuentas publicas.</span>
        ${modeTabs}
        <input id="onb-ig" value="${esc(data.instagram_url)}" placeholder="https://www.instagram.com/tumarca o @tumarca" oninput="S.onb.data.instagram_url=this.value" onkeydown="if(event.key==='Enter')onbNext()" />`;
    }
    footer = `<button class="btn btn-primary" onclick="onbNext()">Continuar</button>`;
  } else if (kind === 'focus') {
    body = `<h3>Cual es tu foco para los proximos 30 dias?</h3>
      <span class="lead">Ajustamos las ideas y el tono a tu objetivo.</span>
      <div class="opt-list">
        ${ONB_FOCUS.map((o) => `<button class="opt-card ${data.focus === o.id ? 'selected' : ''}" onclick="onbSelectFocus('${o.id}')">
          <div class="opt-emoji">${o.emoji}</div>
          <div class="opt-body"><strong>${esc(o.title)}</strong><span>${esc(o.desc)}</span></div>
          <div class="opt-radio"></div>
        </button>`).join('')}
      </div>`;
    footer = `<button class="btn btn-primary" onclick="onbNext()" ${data.focus ? '' : 'disabled'}>Continuar</button>`;
  } else if (kind === 'negocio') {
    body = `<h3>¿Qué querés que la gente elija?</h3>
      <span class="lead">Lo que nos cuentes acá aparece en las ideas: tus productos estrella y a quién le hablás.</span>
      <div class="form-group full"><label>Lo que más vendés (o lo que querés vender más)</label>
        <input value="${esc(data.estrella)}" placeholder="Ej: helado por kilo, tortas para cumpleaños, turnos de limpieza facial" oninput="S.onb.data.estrella=this.value" /></div>
      <div class="form-group full" style="margin-top:12px"><label>¿Quién es tu cliente?</label>
        <input value="${esc(data.publico)}" placeholder="Ej: familias del barrio, oficinistas de 25 a 40, novias en su año de casamiento" oninput="S.onb.data.publico=this.value" /></div>
      <div class="onb-note">Si lo dejás vacío lo deducimos de tu cuenta, pero con esto le pegamos mucho mejor.</div>`;
    footer = `<button class="btn btn-primary" onclick="onbNext()">Continuar</button>`;
  } else if (kind === 'preferences') {
    body = `<h3>¿Cómo querés que suene?</h3>
      <span class="lead">Elegí el tono y marcá lo que preferís evitar. Todo esto queda en tu manual de marca.</span>
      <div class="tone-grid">
        ${ONB_TONE.map((t) => `<button class="tone-opt ${data.tone === t.id ? 'selected' : ''}" onclick="onbSelectTone('${t.id}')">
          <strong>${esc(t.title)}</strong><span>${esc(t.desc)}</span>
        </button>`).join('')}
      </div>
      <label class="onb-sublabel">Evitar en mi contenido</label>
      <div class="chip-list">
        ${ONB_AVOID.map((c) => `<button class="chip-opt ${data.avoid.includes(c) ? 'selected' : ''}" onclick="onbToggleAvoid('${esc(c)}')">${esc(c)}</button>`).join('')}
      </div>
      <div class="form-group full" style="margin-top:14px"><label>¿Algo más que debamos saber? <span class="subtle">(opcional)</span></label>
        <textarea rows="2" placeholder="Ej: cerramos los lunes, hacemos envíos solo en la ciudad, no mostramos precios de los combos" oninput="S.onb.data.objetivo=this.value">${esc(data.objetivo)}</textarea></div>`;
    footer = `<button class="btn btn-primary" onclick="onbNext()">Continuar</button>`;
  } else if (kind === 'resumen') {
    const focusTitle = (ONB_FOCUS.find((f) => f.id === data.focus) || {}).title || '';
    const toneTitle = (ONB_TONE.find((t) => t.id === data.tone) || {}).title || 'Cercano';
    const marca = data.mode === 'manual' ? data.brand_name : `@${data.instagram_url.replace(/^.*instagram\.com\//, '').replace(/[@/]/g, '')}`;
    body = `<div class="wizard-emoji">🚀</div>
      <h3>Listo, esto es lo que vamos a hacer</h3>
      <span class="lead">Con esto armamos tu marca completa. Después revisás todo y cambiás lo que quieras.</span>
      <div class="recap">
        <div class="recap-row"><span class="rk">Marca</span><span class="rv">${esc(marca || 'Tu marca')}</span></div>
        ${focusTitle ? `<div class="recap-row"><span class="rk">Objetivo</span><span class="rv">${esc(focusTitle)}</span></div>` : ''}
        <div class="recap-row"><span class="rk">Tono</span><span class="rv">${esc(toneTitle)}</span></div>
        ${data.estrella ? `<div class="recap-row"><span class="rk">Foco</span><span class="rv">${esc(data.estrella)}</span></div>` : ''}
        ${data.avoid.length ? `<div class="recap-row"><span class="rk">Evitamos</span><span class="rv">${esc(data.avoid.join(' · '))}</span></div>` : ''}
      </div>
      <div class="deliver">
        <div class="deliver-title">Vas a recibir</div>
        <div class="deliver-item"><span>🎨</span> Tu manual de marca: paleta, estilo y voz</div>
        <div class="deliver-item"><span>🗂️</span> Tus categorías de contenido</div>
        <div class="deliver-item"><span>💡</span> 7 ideas agendadas, listas para generar</div>
      </div>
      <div class="onb-note">Tarda 1 a 3 minutos. Nada se publica sin tu aprobación.</div>`;
    footer = `<button class="btn btn-primary" onclick="onbStart()">Crear mi marca</button>`;
  }

  modal(`<div class="wizard">
    <div class="wizard-progress"><div class="wizard-bar" style="width:${pct}%"></div></div>
    ${body}
    <div class="wizard-actions">
      ${canBack ? `<button class="btn btn-plain" onclick="onbBack()">Atras</button>` : `<button class="btn btn-plain" onclick="closeModal()">Cancelar</button>`}
      ${footer}
    </div>
  </div>`);
}

window.onbSelectFocus = function onbSelectFocus(id) { S.onb.data.focus = id; renderOnbStep(); };
window.onbSelectTone = function onbSelectTone(id) { S.onb.data.tone = id; renderOnbStep(); };
window.onbToggleAvoid = function onbToggleAvoid(c) {
  const a = S.onb.data.avoid;
  const i = a.indexOf(c);
  if (i >= 0) a.splice(i, 1); else a.push(c);
  renderOnbStep();
};
window.onbBack = function onbBack() { if (S.onb.step > 0) { S.onb.step--; renderOnbStep(); } };
window.onbNext = function onbNext() {
  const kind = ONB_STEPS[S.onb.step];
  const d = S.onb.data;
  if (kind === 'instagram') {
    if (d.mode === 'manual') {
      if (!d.brand_name.trim()) { toast('Pone el nombre de tu marca', 'error'); return; }
      if (!d.brand_desc.trim()) { toast('Contanos que hace tu marca', 'error'); return; }
    } else if (!d.instagram_url.trim()) {
      toast('Pega el link de tu Instagram (o proba "Empezar sin Instagram")', 'error'); return;
    }
  }
  if (kind === 'focus' && !d.focus) { toast('Elegi un foco', 'error'); return; }
  if (S.onb.step < ONB_STEPS.length - 1) { S.onb.step++; renderOnbStep(); }
};

const DOW_ES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

async function showContentPlan(brand) {
  let categories = S.categories || [];
  let calendar = [];
  try {
    const c = await api('/api/calendar');
    calendar = (c.calendar || []).filter((i) => i.status === 'pending').slice(0, 7);
  } catch { /* noop */ }

  const manual = brand.brand_manual || {};
  const tone = (manual.voice || '').split(/[.\n]/)[0].slice(0, 60) || 'Alineado a tu marca';
  const rubro = brand.analysis?.rubro || '';

  const week = calendar.length
    ? `<div class="plan-week">
        <div class="plan-week-head">📅 Tu primera semana</div>
        ${calendar.map((item) => {
          const dow = DOW_ES[new Date(`${item.publish_date}T00:00:00`).getDay()];
          return `<div class="plan-day">
            <div class="pd-day">${dow}</div>
            <div class="pd-idea">${esc(item.topic)}</div>
            <span class="status status-pending">idea</span>
          </div>`;
        }).join('')}
      </div>`
    : '';

  modal(`<div class="wizard">
    <div class="wizard-emoji">✅</div>
    <h3>Listo, tu plan de contenido esta armado</h3>
    <span class="lead">Analizamos ${esc(brand.name)} y creamos tu estrategia. Ya podes revisarla y generar contenido.</span>
    <div class="plan-summary">
      <div class="kv"><strong>Marca</strong><span>${esc(brand.name)}${rubro ? ` · ${esc(rubro)}` : ''}</span></div>
      <div class="kv"><strong>Frecuencia</strong><span>7 posts / semana</span></div>
      <div class="kv"><strong>Categorias</strong><span>${categories.length} temas</span></div>
      <div class="kv"><strong>Tono</strong><span>${esc(tone)}</span></div>
    </div>
    ${categories.length ? `<div class="chip-list" style="margin-bottom:16px">${categories.map((c) => `<span class="chip-opt selected" style="cursor:default">${esc(c.name)}</span>`).join('')}</div>` : ''}
    ${week}
    <div class="wizard-actions">
      <button class="btn btn-plain" onclick="closeModal();setTab('brand')">Ver la marca</button>
      <button class="btn btn-primary" onclick="closeModal();setTab('overview');setTimeout(maybeStartTour,500)">Ir a mi dashboard</button>
    </div>
  </div>`);
  toast(`Marca "${brand.name}" lista`);
}

window.onbStart = async function onbStart() {
  const d = S.onb.data;
  const manual = d.mode === 'manual';
  const focusLabel = (ONB_FOCUS.find((f) => f.id === d.focus) || {}).title || '';
  try {
    const data = await api('/api/onboarding', {
      method: 'POST',
      body: {
        instagram_url: manual ? '' : d.instagram_url,
        brand_name: manual ? d.brand_name.trim() : '',
        answers: {
          ...(manual ? { descripcion: d.brand_desc.trim() } : {}),
          objetivo: [focusLabel, d.objetivo].filter(Boolean).join('. '),
          evitar: d.avoid.join(', '),
          tono: (ONB_TONE.find((t) => t.id === d.tone) || {}).title || '',
          productos_estrella: d.estrella.trim(),
          publico: d.publico.trim(),
        },
      },
    });
    renderOnbWorking({ manual, name: data.brand.name, handle: data.brand.instagram_handle });
    pollOnboarding(data.brand.id);
  } catch (error) {
    toast(error.message, 'error');
  }
};

// --- Pantalla de trabajo -----------------------------------------------------
// El backend no reporta avance parcial, asi que los pasos corren sobre una
// linea de tiempo. Son los trabajos reales y en el orden real; el ultimo se
// queda "en curso" hasta que el poll confirma que termino, para no mentir.
let onbWorkTimers = [];

function clearOnbWork() {
  onbWorkTimers.forEach((t) => clearTimeout(t) || clearInterval(t));
  onbWorkTimers = [];
}

function renderOnbWorking({ manual, name, handle }) {
  clearOnbWork();
  const steps = manual ? ONB_WORK_MANUAL : ONB_WORK_IG;
  const titulo = manual ? esc(name || 'tu marca') : `@${esc(handle || '')}`;

  modal(`<div class="wizard onb-working">
    <div class="ow-orbit" aria-hidden="true">
      <span class="ow-core">${manual ? '🎨' : '🔎'}</span>
      <span class="ow-ring r1"></span><span class="ow-ring r2"></span><span class="ow-ring r3"></span>
    </div>
    <h3 class="ow-title">Analizando ${titulo}</h3>
    <span class="lead">Estamos armando tu marca completa. Podés quedarte mirando o volver en un ratito: no se pierde nada.</span>

    <div class="ow-steps" id="ow-steps">
      ${steps.map((s, i) => `<div class="ow-step" data-i="${i}">
        <span class="ow-ico"><span class="ow-emoji">${s.ico}</span><span class="ow-spin"></span><svg class="ow-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>
        <span class="ow-body"><b>${esc(s.label)}</b><span>${esc(s.detail)}</span></span>
      </div>`).join('')}
    </div>

    <div class="ow-bar"><i id="ow-fill"></i></div>
    <div class="ow-tip" id="ow-tip"><span>${esc(ONB_TIPS[0])}</span></div>
  </div>`);

  const nodes = [...document.querySelectorAll('.ow-step')];
  const fill = byId('ow-fill');
  // Ritmo realista: el analisis de imagenes y la escritura del manual son los
  // tramos largos, asi que reciben mas tiempo.
  const pesos = manual ? [1, 1.4, 2, 1.2, 1.8] : [0.8, 1.6, 1.6, 2, 1.2, 1.8];
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const duracion = manual ? 70000 : 105000;

  let acumulado = 0;
  nodes.forEach((node, i) => {
    const inicio = acumulado;
    acumulado += (pesos[i] / totalPeso) * duracion;
    // el porcentaje se congela ahora: si se lee dentro del setTimeout, para
    // entonces 'acumulado' ya vale el total y la barra salta al final.
    const pct = Math.min(96, Math.round((acumulado / duracion) * 96));
    onbWorkTimers.push(setTimeout(() => {
      nodes.forEach((n, j) => { if (j < i) { n.classList.remove('active'); n.classList.add('done'); } });
      node.classList.add('active');
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // el ultimo paso no se marca solo: espera al backend
      if (fill) fill.style.width = `${pct}%`;
    }, inicio));
  });

  let tip = 0;
  const tipEl = byId('ow-tip');
  onbWorkTimers.push(setInterval(() => {
    tip = (tip + 1) % ONB_TIPS.length;
    if (!tipEl) return;
    tipEl.classList.add('out');
    setTimeout(() => {
      tipEl.innerHTML = `<span>${esc(ONB_TIPS[tip])}</span>`;
      tipEl.classList.remove('out');
    }, 300);
  }, 5200));
}

// Cierra la animacion: completa todos los pasos antes de mostrar el plan.
function finishOnbWork() {
  clearOnbWork();
  document.querySelectorAll('.ow-step').forEach((n) => { n.classList.remove('active'); n.classList.add('done'); });
  const fill = byId('ow-fill');
  if (fill) fill.style.width = '100%';
  return new Promise((r) => setTimeout(r, 620));
}

async function pollOnboarding(brandId) {
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      const data = await api('/api/brands');
      S.brands = data.brands || [];
      const brand = S.brands.find((item) => item.id === brandId);
      if (!brand) return;
      if (brand.onboarding_status === 'ready') {
        clearInterval(timer);
        await finishOnbWork();
        await switchBrand(brandId);
        await showContentPlan(brand);
      } else if (brand.onboarding_status === 'error') {
        clearInterval(timer);
        clearOnbWork();
        const el = byId('onboarding-progress');
        if (el) el.textContent = `Error: ${brand.onboarding_error || 'fallo el analisis'}. Cerra y proba de nuevo.`;
        toast(brand.onboarding_error || 'Fallo el onboarding', 'error');
      } else if (Date.now() - started > 5 * 60 * 1000) {
        clearInterval(timer);
        toast('El analisis sigue en curso; recarga en unos minutos', 'error');
      }
    } catch { /* siguiente tick */ }
  }, 5000);
}

function renderNoBrand() {
  byId('content').innerHTML = `
    <section class="section hero-empty">
      <span class="logo-mark"></span>
      <h2>Crea tu primera marca</h2>
      <p>Pega el link de tu Instagram o describi tu negocio, y la IA arma todo sola: tu estilo visual, las categorias de contenido y la primera semana de ideas.</p>
      <button class="btn btn-primary" onclick="openOnboarding()">Crear mi marca</button>
    </section>`;
}

// --- Tour guiado para usuarios nuevos ----------------------------------------

const TOUR_KEY = 'contenidor_tour_seen_v1';
let tourIdx = 0;

const TOUR_STEPS = [
  { target: null, title: 'Bienvenido a Postia 👋', body: 'Tu estudio de contenido con IA. En un minuto te muestro como funciona para que empieces a publicar sin esfuerzo.' },
  { targets: ['#side-foot .brand-switch', '#side-foot'], title: 'Tus marcas', body: 'Cada negocio es una marca con su propio estilo, catalogo e ideas. Podes tener varias y cambiar entre ellas desde aca.' },
  { targets: ['.topbar-actions .btn-primary'], title: 'Genera contenido', body: 'Con este boton creas un creativo nuevo al instante: la IA arma la imagen y los textos, listos para revisar.' },
  { targets: ['[data-tab="calendar"]'], title: 'Tu calendario', body: 'La IA propone ideas y las agenda sola. Aca ves y ajustas el plan de las proximas semanas.' },
  { targets: ['[data-tab="posts"]'], title: 'Revisa y aproba', body: 'Cada creativo aparece en Posts como una publicacion de Instagram. Lo aprobas o lo rechazas de un toque.' },
  { targets: ['[data-tab="brand"]', '.tab-more'], title: 'Tu marca', body: 'En Marca defines tu identidad, subis tu logo y tus referencias para que cada pieza salga con tu estilo.' },
  { targets: ['[data-tab="products"]', '.tab-more'], title: 'Tu catalogo', body: 'Carga tus productos y precios (o una foto de tu carta) y las ideas van a promocionar lo que realmente vendes.' },
  { targets: ['#ig-connect-cta', '[data-tab="brand"]'], title: 'Conecta tu Instagram 🔗', body: 'El paso que hace la magia: con tu cuenta conectada, lo que aprobes se publica solo. Un toque aca y listo.' },
  { targets: ['#wa-setup-cta', '[data-tab="brand"]'], title: 'Aproba desde WhatsApp 💬', body: 'Deja tu numero y cada creativo nuevo te llega al chat con botones Aprobar / Rechazar. El Instagram de tu negocio se maneja sin abrir nada.' },
  { target: null, title: 'Listo, ya sabes lo esencial 🎉', body: 'Podes volver a ver este tutorial cuando quieras desde Ajustes › Cuenta. Ahora si: a crear contenido.' },
];

function tourTargetEl(step) {
  const sels = step.target ? [step.target] : (step.targets || []);
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

function renderTour() {
  const step = TOUR_STEPS[tourIdx];
  let root = byId('tour-root');
  if (!root) { root = document.createElement('div'); root.id = 'tour-root'; document.body.appendChild(root); }
  const el = tourTargetEl(step);
  const isLast = tourIdx === TOUR_STEPS.length - 1;
  const isFirst = tourIdx === 0;

  root.innerHTML = `
    <div class="tour-backdrop${el ? '' : ' dim'}"></div>
    ${el ? '<div class="tour-spot" id="tour-spot"></div>' : ''}
    <div class="tour-pop ${el ? '' : 'center'}" id="tour-pop">
      <div class="tour-step">Paso ${tourIdx + 1} de ${TOUR_STEPS.length}</div>
      <h3>${esc(step.title)}</h3>
      <p>${esc(step.body)}</p>
      <div class="tour-actions">
        ${isLast ? '<span></span>' : '<button class="btn btn-sm btn-plain" onclick="tourSkip()">Saltar</button>'}
        <div class="tour-nav">
          ${!isFirst ? '<button class="btn btn-sm" onclick="tourPrev()">Atras</button>' : ''}
          <button class="btn btn-sm btn-primary" onclick="tourNext()">${isLast ? 'Empezar' : 'Siguiente'}</button>
        </div>
      </div>
    </div>`;

  positionTour(el);
  requestAnimationFrame(() => positionTour(el));
}

function positionTour(el) {
  const spot = byId('tour-spot');
  const pop = byId('tour-pop');
  if (!pop) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (el && spot) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    const top = Math.max(r.top - pad, 6);
    const left = Math.max(r.left - pad, 6);
    spot.style.top = `${top}px`;
    spot.style.left = `${left}px`;
    spot.style.width = `${Math.min(r.width + pad * 2, vw - left - 6)}px`;
    spot.style.height = `${r.height + pad * 2}px`;

    const pr = pop.getBoundingClientRect();
    let pTop = r.bottom + 14;
    if (pTop + pr.height > vh - 10) pTop = r.top - pr.height - 14; // no room below -> above
    pTop = Math.max(10, Math.min(pTop, vh - pr.height - 10));
    let pLeft = r.left + r.width / 2 - pr.width / 2;
    pLeft = Math.max(12, Math.min(pLeft, vw - pr.width - 12));
    pop.style.top = `${pTop}px`;
    pop.style.left = `${pLeft}px`;
  }
}

window.addEventListener('resize', () => { if (byId('tour-root')) positionTour(tourTargetEl(TOUR_STEPS[tourIdx])); });

window.tourNext = function tourNext() {
  if (tourIdx >= TOUR_STEPS.length - 1) {
    endTour();
    // Si el tutorial termino y todavia no hay Instagram, el banner queda a la
    // vista: es la accion que sigue.
    (document.getElementById('ig-connect-cta') || document.getElementById('wa-setup-cta'))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else { tourIdx++; renderTour(); }
};
window.tourPrev = function tourPrev() { if (tourIdx > 0) { tourIdx--; renderTour(); } };
window.tourSkip = function tourSkip() { endTour(); };

function endTour() {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* noop */ }
  byId('tour-root')?.remove();
}

window.startTour = function startTour(force = false) {
  if (!force) { try { if (localStorage.getItem(TOUR_KEY)) return; } catch { /* noop */ } }
  tourIdx = 0;
  renderTour();
};

function maybeStartTour() {
  try { if (localStorage.getItem(TOUR_KEY)) return; } catch { /* noop */ }
  if (S.brands && S.brands.length) startTour();
}

async function bootApp() {
  const [data] = await Promise.all([
    api('/api/brands'),
    api('/api/me').then((res) => { S.userEmail = res.user.email; }).catch(() => {}),
  ]);
  S.brands = data.brands || [];

  if (!S.brands.length) {
    renderNoBrand();
    ensureBrandBar();
    return;
  }

  const stored = localStorage.getItem(BRAND_KEY);
  S.brandId = S.brands.some((brand) => brand.id === stored) ? stored : S.brands[0].id;
  localStorage.setItem(BRAND_KEY, S.brandId);
  ensureBrandBar();
  checkAdmin();
  checkTrialBanner();
  handleInstagramRedirect();
  await loadBootstrap();
  // Land on the section named in the URL hash (deep link / refresh in place).
  activateTab(currentHashTab(), { load: false });
  await loadTab();
  // First-time users get the guided tour once the layout has settled.
  setTimeout(maybeStartTour, 700);
}

// After the Instagram OAuth callback, the browser lands back on /dashboard with
// an ?ig= status param. Surface it and jump to the Marca tab.
function handleInstagramRedirect() {
  const params = new URLSearchParams(window.location.search);
  const ig = params.get('ig');
  if (!ig) return;
  if (ig === 'connected') {
    const handle = params.get('handle');
    toast(`Instagram conectado${handle ? ` (@${handle})` : ''}`, 'success');
    // replaceState does not fire hashchange; bootApp reads the hash right after.
    history.replaceState(null, '', `${window.location.pathname}#brand`);
    return;
  }
  if (ig === 'error') {
    toast(`No se pudo conectar Instagram: ${params.get('msg') || 'error desconocido'}`, 'error');
  }
  history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
}

(async function init() {
  try {
    // La vuelta del mail de recuperacion se atiende antes que nada: el link
    // trae su propio token y no depende de haber iniciado sesion.
    if (handleRecoveryRedirect()) return;

    if (!getStoredSession()) {
      renderLogin();
      return;
    }
    await bootApp();
  } catch (error) {
    if (error.status === 401) { renderLogin(); return; }
    byId('content').innerHTML = empty(error.message);
    toast(error.message, 'error');
  }
})();
