const S = {
  tab: 'posts',
  templates: [],
  posts: [],
  calendar: [],
  categories: [],
  brands: [],
  inspirations: [],
};

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data;
}

function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg" onclick="closeModal()"></div><div class="modal">${html}</div>`;
  root.classList.add('open');
}
window.closeModal = () => document.getElementById('modal-root').classList.remove('open');

function statusBadge(s) { return `<span class="badge badge-${s}">${s.replace(/_/g,' ')}</span>`; }

function dateFmt(d) { return new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'short' }); }

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    S.tab = t.dataset.tab;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const p = document.getElementById(`panel-${S.tab}`);
    if (p) p.classList.add('active');
    loadTab();
  });
});

async function loadTab() {
  try {
    switch (S.tab) {
      case 'posts': await loadPosts(); break;
      case 'calendar': await loadCalendar(); break;
      case 'brand': await loadBrand(); break;
      case 'categories': await loadCategories(); break;
      case 'design': await loadDesign(); break;
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAll() {
  try {
    const [t, cat, br] = await Promise.all([
      api('/api/templates'),
      api('/api/categories'),
      api('/api/brands'),
    ]);
    S.templates = t.templates;
    S.categories = cat.categories;
    S.brands = br.brands;
  } catch (e) { toast(e.message, 'error'); }
}

// ===================== POSTS =====================

async function loadPosts() {
  const d = await api('/api/posts');
  S.posts = d.posts;
  renderPosts();
}

function renderPosts() {
  const c = document.getElementById('content');
  if (!S.posts.length) { c.innerHTML = '<div class="empty">No hay posts generados</div>'; return; }
  c.innerHTML = `<div class="panel active"><div class="panel-header"><h2>Posts (${S.posts.length})</h2></div><div class="posts-grid">${S.posts.map(p => postCard(p)).join('')}</div></div>`;
}

function postCard(p) {
  const img = p.image_url ? `<img class="post-card-image" src="${esc(p.image_url)}" onclick="showPost('${p.id}')" alt="" />` : '<div class="post-card-image loading"></div>';
  return `<div class="card post-card">${img}
    <div class="post-card-body">
      <div class="meta">${statusBadge(p.status)} · ${esc(p.model||'')} · ${esc(p.template_id||'')}</div>
      <div class="hook">${esc(p.hook||'')}</div>
      <div class="body-text">${esc(p.body||'')}</div>
      <div class="cta">${esc(p.cta||'')}</div>
      <div class="caption">📸 ${esc(p.caption_instagram||'').slice(0,120)}</div>
    </div>
    <div class="post-card-actions">
      <button class="btn btn-ghost btn-sm" onclick="regCopy('${p.id}')">✏ Copy</button>
      <button class="btn btn-ghost btn-sm" onclick="regRender('${p.id}')">🎨 Render</button>
      <button class="btn btn-green btn-sm" onclick="approvePost('${p.id}')">✓ Aprobar</button>
      <button class="btn btn-red btn-sm" onclick="rejectPost('${p.id}')">✗ Rechazar</button>
      <select onchange="changeTemplate('${p.id}',this.value)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;font-size:.75rem;padding:.15rem .35rem">
        <option value="">Template</option>
        ${S.templates.map(t => `<option value="${t}" ${t===p.template_id?'selected':''}>${t}</option>`).join('')}
      </select>
    </div></div>`;
}

window.regCopy = async id => {
  try {
    const d = await api(`/api/posts/${id}/regenerate-copy`, { method: 'POST' });
    toast('Copy regenerado');
    await loadPosts();
  } catch (e) { toast(e.message, 'error'); }
};
window.regRender = async id => {
  try {
    const d = await api(`/api/posts/${id}/regenerate-render`, { method: 'POST' });
    toast('Render regenerado');
    await loadPosts();
  } catch (e) { toast(e.message, 'error'); }
};
window.approvePost = async id => {
  try {
    await api(`/api/posts/${id}/approve`, { method: 'POST' });
    toast('Post aprobado');
    await loadPosts();
  } catch (e) { toast(e.message, 'error'); }
};
window.rejectPost = async id => {
  try {
    await api(`/api/posts/${id}/reject`, { method: 'POST' });
    toast('Post rechazado');
    await loadPosts();
  } catch (e) { toast(e.message, 'error'); }
};
window.changeTemplate = async (id, tid) => {
  if (!tid) return;
  try {
    await api(`/api/posts/${id}/template`, { method: 'PATCH', body: { template_id: tid } });
    toast('Template cambiado y re-renderizado');
    await loadPosts();
  } catch (e) { toast(e.message, 'error'); }
};
window.showPost = async id => {
  try {
    const d = await api(`/api/posts/${id}`);
    const p = d.post;
    modal(`<h3>Detalle del Post</h3>
      ${p.image_url ? `<img class="post-detail-img" src="${esc(p.image_url)}" alt="" />` : ''}
      <div class="post-detail-captions">
        <label>Hook</label><textarea readonly rows="2">${esc(p.hook||'')}</textarea>
        <label>Body</label><textarea readonly rows="3">${esc(p.body||'')}</textarea>
        <label>CTA</label><textarea readonly rows="1">${esc(p.cta||'')}</textarea>
        <label>📸 Instagram</label><textarea readonly rows="2">${esc(p.caption_instagram||'')}</textarea>
        <label>𝕏 Twitter</label><textarea readonly rows="2">${esc(p.caption_x||'')}</textarea>
        <label>🔗 LinkedIn</label><textarea readonly rows="2">${esc(p.caption_linkedin||'')}</textarea>
        <label>Visual direction</label><textarea readonly rows="2">${esc(p.visual_direction||'')}</textarea>
        <label>Background idea</label><textarea readonly rows="2">${esc(p.background_idea||'')}</textarea>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1rem">
        <button class="btn btn-green btn-sm" onclick="approvePost('${p.id}');closeModal()">✓ Aprobar</button>
        <button class="btn btn-red btn-sm" onclick="rejectPost('${p.id}');closeModal()">✗ Rechazar</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cerrar</button>
      </div>`);
  } catch (e) { toast(e.message, 'error'); }
};

// ===================== CALENDAR =====================

async function loadCalendar() {
  const d = await api('/api/calendar');
  S.calendar = d.calendar;
  renderCalendar();
}

function renderCalendar() {
  const c = document.getElementById('content');
  if (!S.calendar.length) { c.innerHTML = '<div class="empty">No hay items en el calendario</div>'; return; }
  c.innerHTML = `<div class="panel active"><div class="panel-header"><h2>Calendario (${S.calendar.length})</h2></div>
    <table class="cal-table">
      <thead><tr><th>Fecha</th><th>Tema</th><th>Ángulo</th><th>Estado</th><th>Categoría</th></tr></thead>
      <tbody>${S.calendar.map(item => calRow(item)).join('')}</tbody>
    </table></div>`;
}

function calRow(item) {
  const statuses = ['pending','generated','needs_review','approved','posted','rejected','skipped'];
  return `<tr>
    <td>${dateFmt(item.publish_date)}</td>
    <td><input value="${esc(item.topic)}" onchange="updateCal('${item.id}','topic',this.value)" /></td>
    <td><input value="${esc(item.angle||'')}" onchange="updateCal('${item.id}','angle',this.value)" /></td>
    <td><select onchange="updateCal('${item.id}','status',this.value)">
      ${statuses.map(s => `<option value="${s}" ${s===item.status?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
    </select></td>
    <td>${item.category ? esc(item.category.name) : '—'}</td>
  </tr>`;
}

let calTimers = {};
window.updateCal = (id, field, val) => {
  clearTimeout(calTimers[id + field]);
  calTimers[id + field] = setTimeout(async () => {
    try {
      await api(`/api/calendar/${id}`, { method: 'PATCH', body: { [field]: val } });
      toast('Calendario actualizado');
    } catch (e) { toast(e.message, 'error'); }
  }, 600);
};

// ===================== BRAND =====================

async function loadBrand() {
  if (!S.brands.length) await loadAll();
  const brand = S.brands[0];
  if (!brand) { document.getElementById('content').innerHTML = '<div class="empty">No hay marcas configuradas</div>'; return; }
  renderBrandForm(brand);
}

function renderBrandForm(brand) {
  const m = brand.brand_manual || {};
  const c = document.getElementById('content');
  c.innerHTML = `<div class="panel active"><div class="panel-header"><h2>Manual de Marca · ${esc(brand.name)}</h2></div>
    <form class="brand-form" onsubmit="saveBrand(event)">
      <input type="hidden" name="id" value="${brand.id}" />
      <div class="form-group"><label>Nombre</label><input name="name" value="${esc(brand.name)}" /></div>
      <div class="form-group"><label>Descripción</label><textarea name="description" class="tall">${esc(brand.description||'')}</textarea></div>
      <div class="form-group"><label>Template por defecto</label>
        <select name="default_template_id">
          <option value="">—</option>
          ${S.templates.map(t => `<option value="${t}" ${t===brand.default_template_id?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="section-label">🎯 Voz & Tono</div>
      <div class="form-group"><label>Voz (párrafo descriptivo)</label><textarea name="voice" class="tall">${esc(m.voice||'')}</textarea></div>
      <div class="form-group"><label>Audiencia</label><textarea name="audience" rows="3">${esc(m.audience||'')}</textarea></div>
      <div class="form-group"><label>Estilo visual</label><textarea name="visual_style" rows="3">${esc(m.visual_style||'')}</textarea></div>
      <div class="section-label">🎨 Paleta de colores</div>
      <div id="colors-area">${renderColors(m.colors)}</div>
      <div class="section-label">🔤 Tipografía</div>
      <div id="typo-area">${renderTypo(m.typography)}</div>
      <div class="section-label">🚫 Frases a evitar</div>
      <div class="tag-input" id="avoid-phrases" onclick="this.querySelector('input').focus()">
        ${(m.avoid_phrases||[]).map(p => `<span class="tag">${esc(p)}<span class="tag-del" onclick="this.parentElement.remove()">×</span></span>`).join('')}
        <input placeholder="Añadir frase…" onkeydown="if(event.key==='Enter'){event.preventDefault();addTag('avoid-phrases',this);}" />
      </div>
      <div class="section-label">📋 Reglas de contenido</div>
      <div class="form-group"><label>(una por línea)</label><textarea name="content_rules" class="tall">${(m.content_rules||[]).join('\n')}</textarea></div>
      <div class="section-label">🎬 Reglas de diseño</div>
      <div class="form-group"><label>(una por línea)</label><textarea name="design_rules" class="tall">${(m.design_rules||[]).join('\n')}</textarea></div>
      <div style="margin-top:1.5rem"><button class="btn btn-accent">Guardar marca</button></div>
    </form></div>`;
}

function renderColors(colors) {
  if (!colors || !Object.keys(colors).length) return '<div class="empty" style="padding:.5rem">Sin colores configurados</div>';
  return Object.entries(colors).map(([k,v]) => `<div class="color-row">
    <input type="color" value="${v}" onchange="this.nextElementSibling.value=this.value" />
    <input type="text" value="${esc(v)}" onchange="this.previousElementSibling.value=this.value" data-color-key="${esc(k)}" placeholder="${esc(k)}" />
    <span style="color:var(--text2);font-size:.8rem;align-self:center">${esc(k)}</span>
  </div>`).join('');
}

function renderTypo(typo) {
  if (!typo) return '<div class="form-group"><label>Font family (títulos)</label><input name="font_heading" value="" /></div><div class="form-group"><label>Font family (cuerpo)</label><input name="font_body" value="" /></div>';
  return `<div class="form-group"><label>Font family (títulos)</label><input name="font_heading" value="${esc(typo.heading_font||typo.font_heading||'')}" /></div>
    <div class="form-group"><label>Font family (cuerpo)</label><input name="font_body" value="${esc(typo.body_font||typo.font_body||'')}" /></div>`;
}

window.addTag = (areaId, input) => {
  const v = input.value.trim();
  if (!v) return;
  const area = document.getElementById(areaId);
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.innerHTML = `${esc(v)}<span class="tag-del" onclick="this.parentElement.remove()">×</span>`;
  area.insertBefore(tag, input);
  input.value = '';
};
window.saveBrand = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  const brandManual = {
    voice: fd.get('voice') || '',
    audience: fd.get('audience') || '',
    visual_style: fd.get('visual_style') || '',
    avoid_phrases: Array.from(document.querySelectorAll('#avoid-phrases .tag')).map(t => t.textContent.replace('×','').trim()).filter(Boolean),
    content_rules: (fd.get('content_rules')||'').split('\n').map(s => s.trim()).filter(Boolean),
    design_rules: (fd.get('design_rules')||'').split('\n').map(s => s.trim()).filter(Boolean),
  };
  const colors = {};
  document.querySelectorAll('[data-color-key]').forEach(inp => { colors[inp.dataset.colorKey] = inp.value; });
  if (Object.keys(colors).length) brandManual.colors = colors;
  brandManual.typography = { heading_font: fd.get('font_heading') || '', body_font: fd.get('font_body') || '' };
  try {
    await api(`/api/brands/${id}`, { method: 'PUT', body: { name: fd.get('name'), description: fd.get('description'), default_template_id: fd.get('default_template_id') || '', brand_manual: brandManual } });
    toast('Marca guardada');
    S.brands = []; await loadBrand();
  } catch (e) { toast(e.message, 'error'); }
};

// ===================== CATEGORIES =====================

async function loadCategories() {
  const d = await api('/api/categories');
  S.categories = d.categories;
  renderCategories();
}

function renderCategories() {
  const c = document.getElementById('content');
  if (!S.categories.length) { c.innerHTML = '<div class="empty">Sin categorías</div>'; return; }
  c.innerHTML = `<div class="panel active"><div class="panel-header"><h2>Categorías de contenido</h2></div>
    ${S.categories.map(cat => catCard(cat)).join('')}</div>`;
}

function catCard(cat) {
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
      <strong>${esc(cat.name)}</strong>
      <span class="badge badge-${cat.status||'generated'}">${esc(cat.slug||'')}</span>
    </div>
    <div class="form-group"><label>Descripción</label><textarea onchange="saveCatField('${cat.id}','description',this.value)" rows="2">${esc(cat.description||'')}</textarea></div>
    <div class="form-group"><label>Objetivo</label><input value="${esc(cat.objective||'')}" onchange="saveCatField('${cat.id}','objective',this.value)" placeholder="¿Qué busca este contenido?" /></div>
    <div class="form-group"><label>Prompt guidance</label><textarea onchange="saveCatField('${cat.id}','prompt_guidance',this.value)" rows="2">${esc(cat.prompt_guidance||'')}</textarea></div>
    <div class="form-group"><label>Ejemplos de hooks (uno por línea)</label><textarea onchange="saveCatArray('${cat.id}','hook_examples',this)" rows="2">${(cat.hook_examples||[]).join('\n')}</textarea></div>
    <div class="form-group"><label>Reglas a evitar (una por línea)</label><textarea onchange="saveCatArray('${cat.id}','avoid_rules',this)" rows="2">${(cat.avoid_rules||[]).join('\n')}</textarea></div>
    <div class="form-group"><label>Template por defecto</label>
      <select onchange="saveCatField('${cat.id}','default_template_id',this.value)">
        <option value="">—</option>
        ${S.templates.map(t => `<option value="${t}" ${t===cat.default_template_id?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Orden</label><input type="number" value="${cat.sort_order||0}" onchange="saveCatField('${cat.id}','sort_order',parseInt(this.value))" style="width:80px" /></div>
  </div>`;
}

let catTimers = {};
window.saveCatField = (id, field, val) => {
  clearTimeout(catTimers[id+field]);
  catTimers[id+field] = setTimeout(async () => {
    try {
      await api(`/api/categories/${id}`, { method: 'PATCH', body: { [field]: val } });
      toast('Categoría actualizada');
    } catch (e) { toast(e.message, 'error'); }
  }, 600);
};
window.saveCatArray = (id, field, textarea) => {
  const arr = textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
  clearTimeout(catTimers[id+field]);
  catTimers[id+field] = setTimeout(async () => {
    try {
      await api(`/api/categories/${id}`, { method: 'PATCH', body: { [field]: arr } });
      toast('Categoría actualizada');
    } catch (e) { toast(e.message, 'error'); }
  }, 600);
};

// ===================== DESIGN =====================

async function loadDesign() {
  const [insp] = await Promise.all([api('/api/inspirations')]);
  S.inspirations = insp.inspirations;
  if (!S.brands.length) await loadAll();
  renderDesign(S.brands[0]);
}

function renderDesign(brand) {
  const m = (brand && brand.brand_manual) || {};
  const c = document.getElementById('content');
  c.innerHTML = `<div class="panel active"><div class="panel-header"><h2>Diseño e Inspiración</h2></div>
    <div class="preview-layout">
      <div>
        <div class="preview-rules"><h3>🎨 Reglas de diseño</h3><pre>${esc((m.design_rules||[]).join('\n')||'Sin reglas de diseño')}</pre></div>
        ${m.colors ? `<div class="preview-rules" style="margin-top:.75rem"><h3>Paleta</h3><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
          ${Object.entries(m.colors).map(([k,v]) => `<span style="display:flex;align-items:center;gap:.3rem;font-size:.78rem"><span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${v};border:1px solid var(--border)"></span> ${k} ${v}</span>`).join('')}
        </div></div>` : ''}
        ${m.typography ? `<div class="preview-rules" style="margin-top:.75rem"><h3>🔤 Tipografía</h3>
          <p style="font-size:.82rem">${esc(m.typography.heading_font||'')} / ${esc(m.typography.body_font||'')}</p>
        </div>` : ''}
        <div class="preview-rules" style="margin-top:.75rem"><h3>📋 Reglas de contenido</h3><pre>${esc((m.content_rules||[]).join('\n')||'Sin reglas')}</pre></div>
        <div class="preview-rules" style="margin-top:.75rem"><h3>🚫 Frases a evitar</h3><pre>${esc((m.avoid_phrases||[]).join('\n')||'Ninguna')}</pre></div>
      </div>
      <div>
        <div class="panel-header"><h3>Inspiraciones</h3><button class="btn btn-accent btn-sm" onclick="addInspiration()">+ Añadir</button></div>
        <div class="insp-grid">${S.inspirations.map(insp => inspCard(insp)).join('')||'<div class="empty">Sin inspiraciones</div>'}</div>
      </div>
    </div></div>`;
}

function inspCard(insp) {
  return `<div class="insp-card" onclick="editInspiration('${insp.id}')">
    <img src="${esc(insp.image_url)}" alt="${esc(insp.title)}" loading="lazy" />
    <div class="insp-card-body">
      <h4>${esc(insp.title)}</h4>
      ${insp.category ? `<p>${esc(insp.category.name)}</p>` : ''}
      ${insp.why_it_works ? `<p>${esc(insp.why_it_works).slice(0,80)}</p>` : ''}
    </div>
    <div class="insp-card-actions">
      <button class="btn btn-red btn-sm" onclick="event.stopPropagation();delInspiration('${insp.id}')">Eliminar</button>
    </div>
  </div>`;
}

window.addInspiration = () => {
  modal(`<h3>Nueva inspiración</h3>
    <form onsubmit="saveInspiration(event,this)">
      <div class="form-group"><label>Título *</label><input name="title" required /></div>
      <div class="form-group"><label>URL de imagen *</label><input name="image_url" required /></div>
      <div class="form-group"><label>Categoría</label>
        <select name="category_id"><option value="">—</option>${S.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Notas</label><textarea name="notes" rows="3"></textarea></div>
      <div class="form-group"><label>¿Por qué funciona?</label><textarea name="why_it_works" rows="2"></textarea></div>
      <button class="btn btn-accent">Guardar</button>
    </form>`);
};
window.saveInspiration = async (e, form) => {
  e.preventDefault();
  const fd = new FormData(form);
  try {
    await api('/api/inspirations', { method: 'POST', body: Object.fromEntries(fd) });
    toast('Inspiración guardada');
    closeModal(); await loadDesign();
  } catch (e) { toast(e.message, 'error'); }
};
window.editInspiration = async id => {
  const insp = S.inspirations.find(i => i.id === id);
  if (!insp) return;
  modal(`<h3>Editar inspiración</h3>
    <form onsubmit="updateInspiration(event,this,'${id}')">
      <div class="form-group"><label>Título</label><input name="title" value="${esc(insp.title)}" /></div>
      <div class="form-group"><label>URL de imagen</label><input name="image_url" value="${esc(insp.image_url||'')}" /></div>
      <div class="form-group"><label>Categoría</label>
        <select name="category_id"><option value="">—</option>${S.categories.map(c => `<option value="${c.id}" ${c.id===insp.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Notas</label><textarea name="notes" rows="3">${esc(insp.notes||'')}</textarea></div>
      <div class="form-group"><label>¿Por qué funciona?</label><textarea name="why_it_works" rows="2">${esc(insp.why_it_works||'')}</textarea></div>
      <button class="btn btn-accent">Guardar</button>
    </form>`);
};
window.updateInspiration = async (e, form, id) => {
  e.preventDefault();
  const fd = new FormData(form);
  const body = {};
  for (const [k,v] of fd) { if (v) body[k] = v; }
  try {
    await api(`/api/inspirations/${id}`, { method: 'PATCH', body });
    toast('Inspiración actualizada');
    closeModal(); await loadDesign();
  } catch (e) { toast(e.message, 'error'); }
};
window.delInspiration = async id => {
  if (!confirm('¿Eliminar inspiración?')) return;
  try {
    await api(`/api/inspirations/${id}`, { method: 'DELETE' });
    toast('Inspiración eliminada');
    await loadDesign();
  } catch (e) { toast(e.message, 'error'); }
};

// ===================== INIT =====================

(async function init() {
  await loadAll();
  await loadTab();
})();
