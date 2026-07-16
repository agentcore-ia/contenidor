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
        <h3>${esc(todayPost.hook || '')}</h3>
        <div class="body-text">${esc(todayPost.body || '')}</div>
        ${todayPost.cta ? `<div class="cta-line">${esc(todayPost.cta)}</div>` : ''}
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

  byId('content').innerHTML = `
    <div class="dash-head">
      <div><h1>Hola${S.userEmail ? `, ${esc(S.userEmail.split('@')[0])}` : ''}</h1><p>Resumen de ${brand ? esc(brand.name) : 'tu marca'} · ${o.today}</p></div>
    </div>
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

const VIDEO_ENGINE_OPTS = [
  ['veo_lite', 'Veo 3 Lite · el más barato (~$0,50 x 10s)'],
  ['omni', 'Omni · barato, avatares (~$1 x 10s)'],
  ['veo_fast', 'Veo 3 Fast (~$0,80 x 8s)'],
  ['veo', 'Veo 3 Cine · caro (~$3,20 x 8s)'],
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
    <div class="igp-iconbar" aria-hidden="true">
      <span>${IG_ICONS.heart}${IG_ICONS.comment}${IG_ICONS.share}</span>
      ${IG_ICONS.bookmark}
    </div>
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
        ${readOnlyField('Hook', post.hook, 2)}
        ${readOnlyField('Body', post.body, 3)}
        ${readOnlyField('CTA', post.cta, 2)}
        ${readOnlyField('Instagram', post.caption_instagram, 4)}
        ${readOnlyField('X', post.caption_x, 3)}
        ${readOnlyField('LinkedIn', post.caption_linkedin, 4)}
        ${readOnlyField('Visual direction', post.visual_direction, 3)}
        ${readOnlyField('Background idea', post.background_idea, 3)}
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
  const engineLabel = engine === 'veo' ? 'Veo 3' : 'Omni';
  toast(kind === 'ugc' ? `Escribiendo guion y generando UGC con ${engineLabel}...` : `Generando video de producto con ${engineLabel}...`);
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
  const iq = brand.image_quality || 'high';
  const ve = brand.video_engine || 'omni';
  const isVideo = item.content_type === 'product_video' || item.content_type === 'ugc_video';
  modal(`<h3>Generar contenido</h3>
    <p class="subtle" style="margin:0 0 14px">${esc(item.topic || '')}${isVideo ? ` · ${item.content_type === 'ugc_video' ? '🗣️ Video UGC' : '🎬 Video producto'}` : ''}</p>
    <div class="form-grid">
      <div class="form-group full"><label>Calidad de imagen</label>
        <select id="gen-iq">
          <option value="high" ${iq === 'high' ? 'selected' : ''}>Alta (mejor, mas cara)</option>
          <option value="medium" ${iq === 'medium' ? 'selected' : ''}>Media (equilibrada)</option>
          <option value="low" ${iq === 'low' ? 'selected' : ''}>Baja (mas barata)</option>
        </select>
      </div>
      ${isVideo ? `<div class="form-group full"><label>Motor de video</label>
        <select id="gen-ve">${videoEngineOptions(ve)}</select>
      </div>` : ''}
    </div>
    <div class="toolbar" style="justify-content:flex-start;margin-top:16px">
      <button class="btn btn-primary" onclick="confirmGenerate('${id}')">Generar</button>
      <button class="btn btn-plain" onclick="closeModal()">Cancelar</button>
    </div>`);
};

window.confirmGenerate = function confirmGenerate(id) {
  const image_quality = byId('gen-iq')?.value;
  const video_engine = byId('gen-ve')?.value;
  closeModal();
  generateCalendar(id, { image_quality, video_engine });
};

window.generateCalendar = async function generateCalendar(id, opts = {}) {
  try {
    const body = { calendar_id: id };
    if (opts.image_quality) body.image_quality = opts.image_quality;
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
            <label>Calidad de imagen</label>
            <select name="image_quality">
              <option value="high" ${(brand.image_quality || 'high') === 'high' ? 'selected' : ''}>Alta (mejor, mas cara)</option>
              <option value="medium" ${brand.image_quality === 'medium' ? 'selected' : ''}>Media (equilibrada)</option>
              <option value="low" ${brand.image_quality === 'low' ? 'selected' : ''}>Baja (mas barata)</option>
            </select>
            <div class="subtle" style="margin-top:6px">GPT Image 2. Media/baja abaratan bastante el costo por imagen.</div>
          </div>
          <div class="form-group">
            <label>Motor de video</label>
            <select name="video_engine">${videoEngineOptions(brand.video_engine)}</select>
            <div class="subtle" style="margin-top:6px">Default para la agenda y el autopilot. Veo 3 Lite es el mas barato (~$0,50 x clip); Veo Cine el mas caro (~$3 x clip).</div>
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
    brand.ig_username ? `<span class="chan-chip on">${ICON.instagram} @${esc(brand.ig_username)}</span>` : '<span class="chan-chip">Instagram sin conectar</span>',
    brand.whatsapp_number ? `<span class="chan-chip on">WhatsApp +${esc(brand.whatsapp_number)}</span>` : '<span class="chan-chip">WhatsApp sin configurar</span>',
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
        whatsapp_number: fd.get('whatsapp_number') || '',
        logo_url: fd.get('logo_url') || '',
        image_quality: fd.get('image_quality') || 'high',
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
  const [posts, categories] = await Promise.all([
    api('/api/posts?limit=200'),
    api('/api/categories'),
  ]);
  S.posts = posts.posts || [];
  S.categories = categories.categories || [];
  if (!S.anRange) S.anRange = 30;
  renderAnalytics();
}

window.setAnRange = function setAnRange(days) { S.anRange = days; renderAnalytics(); };

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
  const [system, health, automation] = await Promise.all([
    api('/api/system'),
    fetch('/health').then((res) => res.json()).catch(() => ({ ok: false })),
    api('/api/automation').catch(() => ({ automation: null })),
  ]);
  S.system = system.system;
  S.automation = automation.automation;
  renderSystem(health);
}

function fmtDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('es-AR', { timeZone: S.system?.content_time_zone });
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
  ['sistema', 'Sistema'],
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
  </section>`;
}

function settingsSistema(health) {
  const sys = S.system;
  return `<div class="grid two">
      <section class="settings-card" style="margin:0">
        <div class="settings-card-head"><div><h2>Runtime</h2><p>Estado del motor de contenido.</p></div><span class="${health.ok ? 'ok' : 'bad'}">${health.ok ? 'online' : 'offline'}</span></div>
        <div class="settings-card-body">
          <div class="health-grid">
            ${healthItem('Node', sys.node, 'ok')}
            ${healthItem('Uptime', `${sys.uptime_seconds}s`, 'ok')}
            ${healthItem('Modelo', sys.model, 'ok')}
            ${healthItem('Timezone', sys.content_time_zone, 'ok')}
            ${healthItem('Fecha engine', sys.today, 'ok')}
          </div>
        </div>
      </section>
      <section class="settings-card" style="margin:0">
        <div class="settings-card-head"><div><h2>Configuracion</h2><p>Variables criticas del servidor.</p></div></div>
        <div class="settings-card-body">
          <div class="health-grid">
            ${healthItem('SUPABASE_URL', sys.env.SUPABASE_URL ? 'OK' : 'Falta', sys.env.SUPABASE_URL ? 'ok' : 'bad')}
            ${healthItem('SERVICE_ROLE_KEY', sys.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'Falta', sys.env.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'bad')}
            ${healthItem('OPENAI_API_KEY', sys.env.OPENAI_API_KEY ? 'OK' : 'Falta', sys.env.OPENAI_API_KEY ? 'ok' : 'bad')}
          </div>
        </div>
      </section>
    </div>
    <section class="settings-card" style="margin-top:16px">
      <div class="settings-card-head"><div><h2>Motor de imagenes</h2><p>Todas las imagenes se generan con IA (GPT Image 2) con la identidad visual de cada marca.</p></div></div>
      <div class="settings-card-body"><div class="tag-row"><span class="tag">ai_gpt_image_2</span><span class="tag">direccion de arte por pieza</span><span class="tag">referencias del feed</span><span class="tag">logo integrado</span></div></div>
    </section>`;
}

function renderSystem(health) {
  S.lastHealth = health;
  if (!S.settingsTab) S.settingsTab = 'integraciones';
  const brand = S.brands.find((b) => b.id === S.brandId) || S.brands[0] || null;

  const tabs = `<div class="segmented" style="margin-bottom:18px">
    ${SETTINGS_TABS.map(([id, label]) => `<button class="seg-opt ${S.settingsTab === id ? 'active' : ''}" onclick="setSettingsTab('${id}')">${label}</button>`).join('')}
  </div>`;

  const body = {
    integraciones: () => settingsIntegraciones(brand),
    publicacion: () => settingsPublicacion(brand),
    cuenta: () => settingsCuenta(brand),
    sistema: () => settingsSistema(health),
  }[S.settingsTab]();

  byId('content').innerHTML = `
    ${pageHead('Ajustes', 'Integraciones, publicacion y configuracion de tu cuenta', `<button class="btn" onclick="loadSystem()">Actualizar</button>`)}
    ${tabs}
    ${body}`;
}

// --- Auth & multi-brand boot -----------------------------------------------

function renderLogin(mode = 'login') {
  document.querySelector('.sidebar')?.classList.add('hidden-auth');
  document.querySelector('.topbar-new')?.classList.add('hidden-auth');
  byId('content').innerHTML = `
    <div class="auth-shell">
      <div class="auth-hero">
        <div class="side-logo">
          <span class="logo-mark"></span>
          <div class="logo-text"><strong>Contenidor</strong><span>Content Studio</span></div>
        </div>
        <div>
          <h1>Tu Instagram,<br />en <em>piloto automatico</em>.</h1>
          <div class="hero-points">
            <div class="hero-point">Pega el link de tu cuenta y la IA aprende tu rubro, tu estilo y tus colores.</div>
            <div class="hero-point">Ideas nuevas todos los dias, alineadas a tu marca.</div>
            <div class="hero-point">Creativos listos para publicar, con tu look exacto. Vos solo aprobas.</div>
          </div>
        </div>
        <div class="hero-foot">Contenidor Studio — motor de contenido con IA</div>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          <h2>${mode === 'login' ? 'Hola de nuevo' : 'Crea tu cuenta'}</h2>
          <span class="subtle">${mode === 'login' ? 'Entra para ver tus marcas y tu contenido.' : 'Empeza gratis: solo email y contrasena.'}</span>
          <form onsubmit="submitAuth(event,'${mode}')">
            <div class="form-group"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="tu@email.com" /></div>
            <div class="form-group"><label>Contrasena</label><input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="Minimo 8 caracteres" /></div>
            <button class="btn btn-primary">${mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
          </form>
          <div class="auth-switch" onclick="renderLoginMode('${mode === 'login' ? 'signup' : 'login'}')">
            ${mode === 'login' ? 'No tenes cuenta? <b>Registrate</b>' : 'Ya tenes cuenta? <b>Inicia sesion</b>'}
          </div>
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

window.logout = function logout() {
  storeSession(null);
  localStorage.removeItem(BRAND_KEY);
  window.location.reload();
};

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
  { id: 'ventas', emoji: '🔥', title: 'Vender mas', desc: 'Mas pedidos, reservas y clientes' },
  { id: 'redes', emoji: '📈', title: 'Crecer en redes', desc: 'Presencia constante y comunidad' },
  { id: 'ambos', emoji: '🚀', title: 'Las dos cosas', desc: 'Marca fuerte que ademas vende' },
];

const ONB_AVOID = ['Sin precios', 'Sin emojis', 'Sin texto sobre la foto', 'Tono formal', 'Nada de la competencia', 'Sin descuentos'];

const ONB_TESTIMONIALS = {
  ventas: { stars: 5, quote: 'Desde que automatice mis posts entran mas pedidos por Instagram. Dejamos de perder clientes que antes no llegabamos a responder.', name: 'Martin G.', role: 'Parrilla', avatar: 'M' },
  redes: { stars: 5, quote: 'Publico todos los dias sin pensarlo y siempre con el mismo estilo. Por fin mi cuenta se ve profesional.', name: 'Caro P.', role: 'Cafeteria de especialidad', avatar: 'C' },
  ambos: { stars: 5, quote: 'Pase de 8 horas por semana armando contenido a 20 minutos. Y encima vende. Se siente casi injusto.', name: 'Lucia R.', role: 'Restaurante', avatar: 'L' },
  closing: { stars: 5, quote: 'Los creativos salen tan buenos que me preguntan que agencia contrate. No contrate ninguna.', name: 'Diego S.', role: 'Pizzeria', avatar: 'D' },
};

const ONB_STEPS = ['instagram', 'focus', 'testimonial_a', 'preferences', 'testimonial_b'];

function ratingRow() {
  return `<div class="rating-row">
    <span class="rating-badge"><span class="rstar">★</span> Trustpilot <b>4.8</b></span>
    <span class="rating-badge"><span class="rstar">★</span> Google <b>4.7</b></span>
    <span class="rating-badge"><span class="rstar">★</span> Capterra <b>4.9</b></span>
  </div>`;
}

function testimonialCard(t) {
  return `<div class="testimonial-card">
    <div class="stars">${'★'.repeat(t.stars)}</div>
    <blockquote>“${esc(t.quote)}”</blockquote>
    <div class="testi-author">
      <div class="testi-avatar">${esc(t.avatar)}</div>
      <div><div class="name">${esc(t.name)}</div><div class="role">${esc(t.role)}</div></div>
    </div>
    ${ratingRow()}
  </div>`;
}

window.openOnboarding = function openOnboarding() {
  S.onb = { step: 0, data: { mode: 'instagram', instagram_url: '', brand_name: '', brand_desc: '', focus: '', objetivo: '', avoid: [] } };
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
  } else if (kind === 'testimonial_a') {
    body = testimonialCard(ONB_TESTIMONIALS[data.focus] || ONB_TESTIMONIALS.ambos);
    footer = `<button class="btn btn-primary" onclick="onbNext()">Siguiente</button>`;
  } else if (kind === 'preferences') {
    body = `<h3>Como queres que se sienta tu contenido?</h3>
      <span class="lead">Opcional. Marca lo que quieras evitar y sumamos un detalle si hace falta.</span>
      <div class="chip-list">
        ${ONB_AVOID.map((c) => `<button class="chip-opt ${data.avoid.includes(c) ? 'selected' : ''}" onclick="onbToggleAvoid('${esc(c)}')">${esc(c)}</button>`).join('')}
      </div>
      <div class="form-group full" style="margin-top:8px"><label>Algo mas que quieras lograr o aclarar?</label>
        <textarea rows="2" placeholder="Ej: atraer clientes del barrio, vender por WhatsApp, mostrar el detras de escena" oninput="S.onb.data.objetivo=this.value">${esc(data.objetivo)}</textarea></div>`;
    footer = `<button class="btn btn-primary" onclick="onbNext()">Continuar</button>`;
  } else if (kind === 'testimonial_b') {
    body = testimonialCard(ONB_TESTIMONIALS.closing);
    footer = `<button class="btn btn-primary" onclick="onbStart()">Analizar y crear mi marca</button>`;
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
        },
      },
    });
    modal(`<div class="wizard">
      <div class="wizard-emoji">${manual ? '🎨' : '🔎'}</div>
      <h3>${manual ? `Creando ${esc(data.brand.name)}...` : `Analizando @${esc(data.brand.instagram_handle)}...`}</h3>
      <span class="lead" id="onboarding-progress">${manual
        ? 'Armamos tu manual de marca, tu estilo visual, tus categorias y tus primeras ideas a partir de lo que nos contaste. Tarda 1-2 minutos.'
        : 'Leemos tu perfil, analizamos tus fotos y armamos tu manual de marca, tus categorias y tus primeras ideas. Tarda 1-3 minutos.'}</span>
      <div class="wizard-progress"><div class="wizard-bar" style="width:100%;animation:pulse 1.4s ease-in-out infinite"></div></div>
    </div>`);
    pollOnboarding(data.brand.id);
  } catch (error) {
    toast(error.message, 'error');
  }
};

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
        await switchBrand(brandId);
        await showContentPlan(brand);
      } else if (brand.onboarding_status === 'error') {
        clearInterval(timer);
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
  { target: null, title: 'Bienvenido a Contenidor 👋', body: 'Tu estudio de contenido con IA. En un minuto te muestro como funciona para que empieces a publicar sin esfuerzo.' },
  { targets: ['#side-foot .brand-switch', '#side-foot'], title: 'Tus marcas', body: 'Cada negocio es una marca con su propio estilo, catalogo e ideas. Podes tener varias y cambiar entre ellas desde aca.' },
  { targets: ['.topbar-actions .btn-primary'], title: 'Genera contenido', body: 'Con este boton creas un creativo nuevo al instante: la IA arma la imagen y los textos, listos para revisar.' },
  { targets: ['[data-tab="calendar"]'], title: 'Tu calendario', body: 'La IA propone ideas y las agenda sola. Aca ves y ajustas el plan de las proximas semanas.' },
  { targets: ['[data-tab="posts"]'], title: 'Revisa y aproba', body: 'Cada creativo aparece en Posts como una publicacion de Instagram. Lo aprobas o lo rechazas de un toque.' },
  { targets: ['[data-tab="brand"]', '.tab-more'], title: 'Tu marca e integraciones', body: 'En Marca defines tu identidad, subis tu logo y conectas Instagram y WhatsApp para publicar y aprobar desde el chat.' },
  { targets: ['[data-tab="products"]', '.tab-more'], title: 'Tu catalogo', body: 'Carga tus productos y precios (o una foto de tu carta) y las ideas van a promocionar lo que realmente vendes.' },
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

window.tourNext = function tourNext() { if (tourIdx >= TOUR_STEPS.length - 1) endTour(); else { tourIdx++; renderTour(); } };
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
