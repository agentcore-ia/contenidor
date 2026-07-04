const S = {
  tab: 'overview',
  templates: [],
  posts: [],
  calendar: [],
  categories: [],
  brands: [],
  inspirations: [],
  overview: null,
  system: null,
  automation: null,
  postFilter: 'all',
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

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return data;
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

async function loadOverview() {
  const [overview, system, health] = await Promise.all([
    api('/api/overview'),
    api('/api/system'),
    fetch('/health').then((res) => res.json()).catch(() => ({ ok: false })),
  ]);
  S.overview = overview.overview;
  S.system = system.system;
  renderOverview(health);
}

function renderOverview(health) {
  const o = S.overview;
  const postStatus = o.posts_by_status || {};
  const calStatus = o.calendar_by_status || {};
  const today = o.today_item;

  const todayBlock = today
    ? `<div class="section">
        <div class="section-head">
          <h2>Contenido de hoy</h2>
          ${statusBadge(today.status)}
        </div>
        <div class="title">${esc(today.topic)}</div>
        <div class="subtle">${esc(today.angle || '')}</div>
        <div class="toolbar" style="justify-content:flex-start;margin-top:12px">
          ${today.status === 'pending' ? `<button class="btn btn-primary" onclick="generateCalendar('${today.id}')">Generar y renderizar</button>` : ''}
          <button class="btn" onclick="setTab('calendar')">Ver calendario</button>
        </div>
      </div>`
    : `<div class="section">${empty(`No hay contenido cargado para ${o.today}`)}</div>`;

  const queue = o.next_items.length
    ? o.next_items.map((item) => `<div class="queue-item">
        <div class="date-chip">${fmtDate(item.publish_date)}</div>
        <div>
          <div class="title">${esc(item.topic)}</div>
          <div class="subtle">${esc(item.category?.name || '')}</div>
        </div>
        <div>${statusBadge(item.status)}</div>
      </div>`).join('')
    : empty('No hay proximos items');

  const recent = o.recent_posts.length
    ? o.recent_posts.map((post) => `<div class="recent-post">
        <div class="section-head" style="margin-bottom:6px">
          ${statusBadge(post.status)}
          <span class="subtle">${esc(post.template_id || '')}</span>
        </div>
        <div class="title">${esc(post.hook || 'Post sin hook')}</div>
        <div class="toolbar" style="justify-content:flex-start;margin-top:10px">
          <button class="btn btn-sm" onclick="showPost('${post.id}')">Abrir</button>
          ${post.image_url ? `<a class="btn btn-sm btn-plain" href="${esc(post.image_url)}" target="_blank" rel="noreferrer">Imagen</a>` : ''}
        </div>
      </div>`).join('')
    : empty('Todavia no hay posts generados');

  byId('content').innerHTML = `
    ${pageHead('Overview', `Hoy: ${o.today}`, `<button class="btn" onclick="loadOverview()">Actualizar</button>`)}
    <div class="grid metrics">
      ${metric('Posts', o.counts.posts, `${postStatus.needs_review || 0} en revision`)}
      ${metric('Calendario', o.counts.calendar, `${calStatus.pending || 0} pendientes`)}
      ${metric('Categorias', o.counts.categories)}
      ${metric('Templates', o.counts.templates)}
      ${metric('Inspiraciones', o.counts.inspirations)}
      ${metric('Engine', health.ok ? 'OK' : 'Falla', S.system.model)}
    </div>
    <div class="grid two" style="margin-top:14px">
      ${todayBlock}
      <div class="section">
        <div class="section-head">
          <h2>Sistema</h2>
          <span class="${health.ok ? 'ok' : 'bad'}">${health.ok ? 'online' : 'offline'}</span>
        </div>
        <div class="health-grid">
          ${healthItem('OpenAI', S.system.env.OPENAI_API_KEY ? 'Configurado' : 'Falta key', S.system.env.OPENAI_API_KEY ? 'ok' : 'bad')}
          ${healthItem('Supabase', S.system.env.SUPABASE_URL && S.system.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configurado' : 'Incompleto', S.system.env.SUPABASE_URL && S.system.env.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'bad')}
          ${healthItem('Timezone', S.system.content_time_zone, 'ok')}
          ${healthItem('Uptime', `${S.system.uptime_seconds}s`, 'ok')}
        </div>
      </div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="section">
        <div class="section-head"><h2>Proximos contenidos</h2><span class="meta">7 items</span></div>
        <div class="list">${queue}</div>
      </div>
      <div class="section">
        <div class="section-head"><h2>Posts recientes</h2><button class="btn btn-sm" onclick="setTab('posts')">Ver todos</button></div>
        <div class="list">${recent}</div>
      </div>
    </div>`;
}

function healthItem(label, value, tone) {
  return `<div class="health-item">
    <strong>${esc(label)}</strong>
    <span class="${tone}">${esc(value)}</span>
  </div>`;
}

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
  const posts = S.postFilter === 'all' ? S.posts : S.posts.filter((post) => post.status === S.postFilter);
  const body = posts.length ? `<div class="posts-grid">${posts.map(postCard).join('')}</div>` : empty('No hay posts para este filtro');

  byId('content').innerHTML = `
    ${pageHead('Posts', `${posts.length} visibles de ${S.posts.length}`, `
      <select class="select" style="width:180px" onchange="S.postFilter=this.value;renderPosts()">${options}</select>
      <button class="btn" onclick="loadPosts()">Actualizar</button>
    `)}
    ${body}`;
}

function postCard(post) {
  const image = post.image_url
    ? `<img class="post-image" src="${esc(post.image_url)}" alt="" onclick="showPost('${post.id}')" />`
    : `<div class="post-image post-empty-image">Sin render</div>`;

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

window.regRender = async function regRender(id) {
  try {
    await api(`/api/posts/${id}/regenerate-render`, { method: 'POST' });
    toast('Render regenerado');
    await loadTab();
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
    await api(`/api/posts/${id}/template`, { method: 'PATCH', body: { template_id: templateId } });
    toast('Template actualizado');
    await loadTab();
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
    await api('/generate-and-render', { method: 'POST', body: { calendar_id: id } });
    toast('Post generado y renderizado');
    await loadTab();
  } catch (error) {
    toast(error.message, 'error');
  }
};

async function loadBrand() {
  if (!S.brands.length) await loadBootstrap();
  renderBrand();
}

function renderBrand() {
  const brand = S.brands[0];
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
  const [inspirations, brands, categories] = await Promise.all([
    api('/api/inspirations'),
    api('/api/brands'),
    api('/api/categories'),
  ]);
  S.inspirations = inspirations.inspirations || [];
  S.brands = brands.brands || [];
  S.categories = categories.categories || [];
  renderDesign();
}

function renderDesign() {
  const brand = S.brands[0] || {};
  const manual = brand.brand_manual || {};
  const inspirations = S.inspirations.map(inspirationCard).join('');

  byId('content').innerHTML = `
    ${pageHead('Diseno', 'Reglas visuales e inspiraciones', `<button class="btn btn-primary" onclick="addInspiration()">Nueva inspiracion</button>`)}
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
        <div class="section-head"><h2>Inspiraciones</h2><span class="meta">${S.inspirations.length}</span></div>
        <div class="grid three">${inspirations || empty('Sin inspiraciones')}</div>
      </section>
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
      <div class="form-group full"><label>URL de imagen</label><input name="image_url" required value="${esc(insp?.image_url || '')}" /></div>
      <div class="form-group full"><label>Categoria</label><select name="category_id"><option value="">Sin categoria</option>${S.categories.map((cat) => `<option value="${cat.id}" ${cat.id === insp?.category_id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}</select></div>
      <div class="form-group full"><label>Notas</label><textarea name="notes" rows="4">${esc(insp?.notes || '')}</textarea></div>
      <div class="form-group full"><label>Por que funciona</label><textarea name="why_it_works" rows="3">${esc(insp?.why_it_works || '')}</textarea></div>
      <div class="form-group full"><button class="btn btn-primary">Guardar</button> <button type="button" class="btn btn-plain" onclick="closeModal()">Cancelar</button></div>
    </form>`);
}

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
POST /generate-and-render
POST /api/ideas/generate
GET /api/automation
POST /api/automation/run
GET /api/overview
GET /dashboard</div>
      </section>
    </div>`;
}

(async function init() {
  try {
    await loadBootstrap();
    await loadTab();
  } catch (error) {
    byId('content').innerHTML = empty(error.message);
    toast(error.message, 'error');
  }
})();
