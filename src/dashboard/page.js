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

function templateSelect(selected, onchange) {
  return `<select class="select" onchange="${onchange}">
    <option value="">Template</option>
    ${S.templates.map((template) => `<option value="${esc(template)}" ${template === selected ? 'selected' : ''}>${esc(template)}</option>`).join('')}
  </select>`;
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
    if (S.tab === 'brand') await loadBrand();
    if (S.tab === 'categories') await loadCategories();
    if (S.tab === 'design') await loadDesign();
    if (S.tab === 'system') await loadSystem();
  } catch (error) {
    byId('content').innerHTML = empty(error.message);
    toast(error.message, 'error');
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    S.tab = tab.dataset.tab;
    loadTab();
  });
});

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

  byId('content').innerHTML = `
    <div class="dash-head">
      <div><h1>Hola${S.userEmail ? `, ${esc(S.userEmail.split('@')[0])}` : ''}</h1><p>Resumen de ${brand ? esc(brand.name) : 'tu marca'} · ${o.today}</p></div>
    </div>
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

function renderPosts() {
  const options = ['all', ...POST_STATUSES].map((status) => `<option value="${status}" ${S.postFilter === status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>`).join('');
  const query = (S.searchQuery || '').toLowerCase();
  let posts = S.postFilter === 'all' ? S.posts : S.posts.filter((post) => post.status === S.postFilter);
  if (query) {
    posts = posts.filter((post) => [post.hook, post.body, post.caption_instagram].filter(Boolean).some((text) => text.toLowerCase().includes(query)));
  }
  const body = posts.length ? `<div class="posts-grid">${posts.map(postCard).join('')}</div>` : empty(query ? `Sin resultados para "${S.searchQuery}"` : 'No hay posts para este filtro');

  byId('content').innerHTML = `
    ${pageHead('Posts', query ? `${posts.length} resultados para "${S.searchQuery}"` : `${posts.length} visibles de ${S.posts.length}`, `
      <select class="select" style="width:180px" onchange="S.postFilter=this.value;renderPosts()">${options}</select>
      ${query ? `<button class="btn" onclick="S.searchQuery='';renderPosts()">Limpiar busqueda</button>` : ''}
      <button class="btn" onclick="loadPosts()">Actualizar</button>
    `)}
    ${body}`;
}

function postCard(post) {
  const image = post.image_url
    ? `<img class="post-image" src="${esc(post.image_url)}" alt="" onclick="showPost('${post.id}')" />`
    : `<div class="post-image post-empty-image">${post.render_error ? 'Error de render' : 'Generando...'}</div>`;

  return `<article class="card post-card">
    ${image}
    <div class="post-body">
      <div class="section-head" style="margin-bottom:8px">
        ${statusBadge(post.status)}
        <span class="subtle">${esc(post.template_id || '')}</span>
      </div>
      <div class="title">${esc(post.hook || '')}</div>
      <div class="post-copy">${esc(post.body || '')}</div>
      <div class="post-copy">${esc(post.cta || '')}</div>
    </div>
    <div class="post-actions">
      <button class="btn btn-sm" onclick="showPost('${post.id}')">Abrir</button>
      <button class="btn btn-sm" onclick="regCopy('${post.id}')">Copy</button>
      <button class="btn btn-sm" onclick="regRender('${post.id}')">Render</button>
      <button class="btn btn-sm btn-good" onclick="approvePost('${post.id}')">Aprobar</button>
      <button class="btn btn-sm btn-danger" onclick="rejectPost('${post.id}')">Rechazar</button>
      <div style="width:170px">${templateSelect(post.template_id, `changeTemplate('${post.id}',this.value)`)}</div>
    </div>
  </article>`;
}

window.showPost = async function showPost(id) {
  try {
    const data = await api(`/api/posts/${id}`);
    const post = data.post;
    modal(`<h3>Post</h3>
      ${post.image_url ? `<img class="modal-image" src="${esc(post.image_url)}" alt="" />` : ''}
      ${post.render_error ? `<div class="empty" style="border-color:#7a2b2b;color:#ffb4b4">Error al generar imagen: ${esc(post.render_error)}</div>` : (!post.image_url ? `<div class="empty">Imagen aun no generada. Toca "Regenerar render" o espera a que termine.</div>` : '')}
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
        <button class="btn" onclick="regCopy('${post.id}');closeModal()">Regenerar copy</button>
        <button class="btn" onclick="regRender('${post.id}');closeModal()">Regenerar render</button>
        <button class="btn btn-plain" onclick="closeModal()">Cerrar</button>
      </div>`);
  } catch (error) {
    toast(error.message, 'error');
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
    toast('Copy regenerado');
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
    toast(res.rendering ? 'Generando imagen en segundo plano (~1 min)...' : 'Render regenerado');
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

window.changeTemplate = async function changeTemplate(id, templateId) {
  if (!templateId) return;
  try {
    const res = await api(`/api/posts/${id}/template`, { method: 'PATCH', body: { template_id: templateId } });
    toast(res.rendering ? 'Template cambiado. Regenerando imagen en segundo plano...' : 'Template actualizado');
    await loadTab();
    pollTabForRender();
  } catch (error) {
    toast(error.message, 'error');
  }
};

async function loadCalendar() {
  const data = await api('/api/calendar');
  S.calendar = data.calendar || [];
  renderCalendar();
}

function renderCalendar() {
  const rows = S.calendar.map((item) => `<tr>
    <td><strong>${fmtDate(item.publish_date)}</strong><div class="subtle">${esc(item.publish_date)}</div></td>
    <td><input value="${esc(item.topic)}" onchange="updateCal('${item.id}','topic',this.value)" /></td>
    <td><input value="${esc(item.angle || '')}" onchange="updateCal('${item.id}','angle',this.value)" /></td>
    <td><select onchange="updateCal('${item.id}','status',this.value)">
      ${CAL_STATUSES.map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status.replace(/_/g, ' ')}</option>`).join('')}
    </select></td>
    <td>${esc(item.category?.name || '-')}</td>
    <td class="actions">
      ${item.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="generateCalendar('${item.id}')">Generar</button>` : ''}
      ${item.generated_post_id ? `<button class="btn btn-sm" onclick="showPost('${item.generated_post_id}')">Post</button>` : ''}
    </td>
  </tr>`).join('');

  const pending = S.calendar.filter((item) => item.status === 'pending').length;

  byId('content').innerHTML = `
    ${pageHead('Calendario', `${S.calendar.length} items · ${pending} pendientes`, `
      <button class="btn btn-primary" onclick="generateIdeas()">Generar ideas (IA)</button>
      <button class="btn" onclick="loadCalendar()">Actualizar</button>
    `)}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Tema</th><th>Angulo</th><th>Estado</th><th>Categoria</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">${empty('No hay calendario')}</td></tr>`}</tbody>
      </table>
    </div>`;
}

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

window.generateCalendar = async function generateCalendar(id) {
  try {
    await api('/api/generate-and-render', { method: 'POST', body: { calendar_id: id } });
    toast('Copy generado. La imagen se crea en segundo plano (~1 min).');
    await loadTab();
    pollTabForRender();
  } catch (error) {
    toast(error.message, 'error');
  }
};

async function loadBrand() {
  if (!S.brands.length) await loadBootstrap();
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
    ${pageHead('Marca', brand.name, `<button class="btn" onclick="loadBrand()">Actualizar</button>`)}
    <section class="section">
      <form onsubmit="saveBrand(event)" class="form-grid">
        <input type="hidden" name="id" value="${esc(brand.id)}" />
        <div class="form-group">
          <label>Nombre</label>
          <input name="name" value="${esc(brand.name)}" />
        </div>
        <div class="form-group">
          <label>Template por defecto</label>
          <select name="default_template_id">
            <option value="">Sin cambio</option>
            ${S.templates.map((template) => `<option value="${esc(template)}" ${template === brand.default_template_id ? 'selected' : ''}>${esc(template)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>Descripcion</label>
          <textarea name="description" rows="4">${esc(brand.description || '')}</textarea>
        </div>
        <div class="form-group full">
          <label>Voz</label>
          <textarea name="voice" rows="4">${esc(manual.voice || '')}</textarea>
        </div>
        <div class="form-group full">
          <label>Audiencia</label>
          <textarea name="audience" rows="3">${esc(manual.audience || '')}</textarea>
        </div>
        <div class="form-group full">
          <label>Estilo visual</label>
          <textarea name="visual_style" rows="3">${esc(manual.visual_style || '')}</textarea>
        </div>
        <div class="form-group full">
          <label>Colores</label>
          <div class="color-grid">${renderColors(manual.colors || {})}</div>
        </div>
        <div class="form-group">
          <label>Font heading</label>
          <input name="font_heading" value="${esc(manual.typography?.heading_font || manual.typography?.primary || '')}" />
        </div>
        <div class="form-group">
          <label>Font body</label>
          <input name="font_body" value="${esc(manual.typography?.body_font || manual.typography?.primary || '')}" />
        </div>
        <div class="form-group full">
          <label>Frases a evitar</label>
          <textarea name="avoid_phrases" rows="4">${esc((manual.avoid_phrases || []).join('\n'))}</textarea>
        </div>
        <div class="form-group full">
          <label>Reglas de contenido</label>
          <textarea name="content_rules" class="tall">${esc((manual.content_rules || []).join('\n'))}</textarea>
        </div>
        <div class="form-group full">
          <label>Reglas de diseno</label>
          <textarea name="design_rules" class="tall">${esc((manual.design_rules || []).join('\n'))}</textarea>
        </div>
        <div class="form-group full" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:14px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" name="show_logo" ${manual.show_logo ? 'checked' : ''} style="width:auto" />
            Incluir el logo/wordmark de la marca en las imagenes
          </label>
        </div>
        <div class="form-group full">
          <label>Instrucciones de imagen (IA)</label>
          <textarea name="image_instructions" rows="4" placeholder="Indicaciones libres que se suman a cada imagen. Ej: 'No incluir ningun logo ni texto de marca. Usar siempre un mockup de celular. Titular bien grande. Sin emojis.'">${esc(manual.image_instructions || '')}</textarea>
          <div class="subtle" style="margin-top:6px">Se agrega al final del prompt de cada imagen generada con IA, con prioridad alta.</div>
        </div>
        <div class="form-group full">
          <button class="btn btn-primary">Guardar marca</button>
        </div>
      </form>
    </section>`;
}

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

window.saveBrand = async function saveBrand(event) {
  event.preventDefault();
  const fd = new FormData(event.target);
  const id = fd.get('id');
  const colors = {};
  document.querySelectorAll('[data-color-key]').forEach((input) => {
    colors[input.dataset.colorKey] = input.value;
  });
  const manual = {
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
        default_template_id: fd.get('default_template_id') || 'pain_point_01',
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

async function loadCategories() {
  const data = await api('/api/categories');
  S.categories = data.categories || [];
  renderCategories();
}

function renderCategories() {
  const cards = S.categories.map((cat) => `<article class="category-card">
    <div class="section-head">
      <h3>${esc(cat.name)}</h3>
      <span class="tag">${esc(cat.slug || '')}</span>
    </div>
    <div class="form-grid">
      ${catInput(cat, 'description', 'Descripcion', 'textarea')}
      ${catInput(cat, 'objective', 'Objetivo')}
      ${catInput(cat, 'prompt_guidance', 'Prompt guidance', 'textarea')}
      <div class="form-group">
        <label>Template</label>
        <select onchange="saveCatField('${cat.id}','default_template_id',this.value)">
          <option value="">Sin cambio</option>
          ${S.templates.map((template) => `<option value="${esc(template)}" ${template === cat.default_template_id ? 'selected' : ''}>${esc(template)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Ejemplos de hooks</label>
        <textarea rows="3" onchange="saveCatArray('${cat.id}','hook_examples',this)">${esc((cat.hook_examples || []).join('\n'))}</textarea>
      </div>
      <div class="form-group full">
        <label>Reglas a evitar</label>
        <textarea rows="3" onchange="saveCatArray('${cat.id}','avoid_rules',this)">${esc((cat.avoid_rules || []).join('\n'))}</textarea>
      </div>
    </div>
  </article>`).join('');

  byId('content').innerHTML = `
    ${pageHead('Categorias', `${S.categories.length} categorias`, `<button class="btn" onclick="loadCategories()">Actualizar</button>`)}
    <div class="grid">${cards || empty('Sin categorias')}</div>`;
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
    ${pageHead('Diseno', 'Reglas visuales, referencias de IA y templates', `<button class="btn btn-primary" onclick="addInspiration()">Nueva inspiracion</button>`)}
    <div class="grid two">
      <section class="section">
        <div class="section-head"><h2>Manual visual</h2><span class="meta">${esc(brand.name || '')}</span></div>
        <div class="rules">${esc(manual.visual_style || 'Sin estilo visual')}</div>
        <div class="section-head" style="margin-top:14px"><h3>Reglas de diseno</h3></div>
        <div class="rules">${esc((manual.design_rules || []).join('\n') || 'Sin reglas')}</div>
        <div class="section-head" style="margin-top:14px"><h3>Paleta</h3></div>
        <div class="tag-row">${Object.entries(manual.colors || {}).map(([key, value]) => `<span class="tag"><span style="width:14px;height:14px;border-radius:4px;background:${esc(value)};display:inline-block;margin-right:6px"></span>${esc(key)} ${esc(value)}</span>`).join('') || '<span class="subtle">Sin colores</span>'}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Referencias de marca para IA</h2><span class="meta">${brandRefs.length}</span></div>
        <p class="subtle" style="margin-top:0">Sin categoria asignada. Se envian como referencia de estilo a GPT Image 2 en todos los posts generados con IA.</p>
        <div class="grid three">${brandRefs.map(inspirationCard).join('') || empty('Sin referencias de marca. Agrega una inspiracion sin categoria.')}</div>
      </section>
    </div>
    <div class="grid two" style="margin-top:14px">
      <section class="section">
        <div class="section-head"><h2>Inspiraciones por categoria</h2><span class="meta">${categoryRefs.length}</span></div>
        <div class="grid three">${categoryRefs.map(inspirationCard).join('') || empty('Sin inspiraciones por categoria')}</div>
      </section>
      <section class="section">
        <div class="section-head">
          <h2>Templates personalizados</h2>
          <button class="btn btn-sm btn-primary" onclick="openTemplateEditor()">Nuevo template</button>
        </div>
        <p class="subtle" style="margin-top:0">HTML/CSS editable, disponible como template (modo sin IA) en Marca, Categorias y Posts. Usa <code>{{hook}}</code>, <code>{{body}}</code>, <code>{{cta}}</code>.</p>
        <div class="rules-list">${(S.customTemplates || []).map(customTemplateRow).join('') || empty('Sin templates personalizados')}</div>
      </section>
    </div>`;
}

function customTemplateRow(tpl) {
  return `<div class="queue-item">
    <div>
      <div class="title">${esc(tpl.name)}</div>
      <div class="subtle">custom_${esc(tpl.slug)}</div>
    </div>
    <div class="toolbar" style="justify-content:flex-end">
      <button class="btn btn-sm" onclick="openTemplateEditor('${tpl.id}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="deleteCustomTemplate('${tpl.id}')">Eliminar</button>
    </div>
  </div>`;
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

function renderSystem(health) {
  const sys = S.system;
  byId('content').innerHTML = `
    ${pageHead('Sistema', sys.service, `<button class="btn" onclick="loadSystem()">Actualizar</button>`)}
    <div class="grid two">
      <section class="section">
        <div class="section-head"><h2>Runtime</h2><span class="${health.ok ? 'ok' : 'bad'}">${health.ok ? 'online' : 'offline'}</span></div>
        <div class="health-grid">
          ${healthItem('Node', sys.node, 'ok')}
          ${healthItem('Uptime', `${sys.uptime_seconds}s`, 'ok')}
          ${healthItem('Modelo', sys.model, 'ok')}
          ${healthItem('Timezone', sys.content_time_zone, 'ok')}
          ${healthItem('Fecha engine', sys.today, 'ok')}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Configuracion</h2></div>
        <div class="health-grid">
          ${healthItem('SUPABASE_URL', sys.env.SUPABASE_URL ? 'OK' : 'Falta', sys.env.SUPABASE_URL ? 'ok' : 'bad')}
          ${healthItem('SERVICE_ROLE_KEY', sys.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'Falta', sys.env.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'bad')}
          ${healthItem('OPENAI_API_KEY', sys.env.OPENAI_API_KEY ? 'OK' : 'Falta', sys.env.OPENAI_API_KEY ? 'ok' : 'bad')}
        </div>
      </section>
    </div>
    <div class="grid two" style="margin-top:14px">
      ${automationPanel()}
      <section class="section">
        <div class="section-head"><h2>Templates</h2><span class="meta">${sys.templates.length}</span></div>
        <div class="tag-row">${sys.templates.map((template) => `<span class="tag">${esc(template)}</span>`).join('')}</div>
      </section>
    </div>
    <div class="grid two" style="margin-top:14px">
      <section class="section">
        <div class="section-head"><h2>Endpoints</h2></div>
        <div class="rules">GET /today
POST /api/generate-and-render
POST /api/ideas/generate
GET /api/automation
POST /api/automation/run
GET /api/overview
GET /dashboard</div>
      </section>
    </div>`;
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

window.openOnboarding = function openOnboarding() {
  modal(`<h3>Nueva marca desde Instagram</h3>
    <p class="subtle">Pega el link de la cuenta de Instagram. El sistema analiza sus fotos, detecta el rubro y el estilo visual, y arma el manual de marca, las categorias y las primeras ideas.</p>
    <form onsubmit="startOnboardingFlow(event)" class="form-grid">
      <div class="form-group full"><label>Link o usuario de Instagram</label><input name="instagram_url" required placeholder="https://www.instagram.com/tumarca o @tumarca" /></div>
      <div class="form-group full"><label>Que queres lograr con el contenido? (opcional)</label><textarea name="objetivo" rows="2" placeholder="Ej: atraer mas clientes locales, vender por WhatsApp, posicionar la marca"></textarea></div>
      <div class="form-group full"><label>Algo que NO quieras en tus posts? (opcional)</label><textarea name="evitar" rows="2" placeholder="Ej: nada de precios, no usar emojis, no hablar de la competencia"></textarea></div>
      <div class="form-group full"><button class="btn btn-primary">Analizar y crear marca</button> <button type="button" class="btn btn-plain" onclick="closeModal()">Cancelar</button></div>
    </form>`);
};

window.startOnboardingFlow = async function startOnboardingFlow(event) {
  event.preventDefault();
  const fd = new FormData(event.target);
  try {
    const data = await api('/api/onboarding', {
      method: 'POST',
      body: {
        instagram_url: fd.get('instagram_url'),
        answers: { objetivo: fd.get('objetivo') || '', evitar: fd.get('evitar') || '' },
      },
    });
    modal(`<h3>Analizando @${esc(data.brand.instagram_handle)}...</h3>
      <div class="empty" id="onboarding-progress">Leyendo el perfil de Instagram, analizando las imagenes y armando el manual de marca. Esto tarda 1-3 minutos.</div>`);
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
        closeModal();
        toast(`Marca "${brand.name}" lista: manual, categorias e ideas creadas`);
        await switchBrand(brandId);
        setTab('brand');
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
      <p>Pega el link de tu Instagram y la IA arma todo sola: tu estilo visual, las categorias de contenido y la primera semana de ideas.</p>
      <button class="btn btn-primary" onclick="openOnboarding()">Nueva marca desde Instagram</button>
    </section>`;
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
  await loadBootstrap();
  await loadTab();
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
