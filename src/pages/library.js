// Library: every save, found by describing it.
/* global A, esc, icon, $, ago */
const KINDS = [['all', 'All saves'], ['look', 'Looks'], ['page', 'Pages'], ['type', 'Typefaces'], ['colour', 'Colours'], ['area', 'Areas']];
const KIND_ONE = { page: 'Page', look: 'Look', type: 'Typeface', colour: 'Colour', area: 'Area' };
let kind = 'all', space = '', sel = location.hash.slice(1) || null, data = { saves: [], counts: {}, spaces: [] };
let seq = 0;
$('#qic').innerHTML = icon('search', 18);

async function load() {
  const s = ++seq;
  const r = await A.call('lib:list', { q: $('#q').value, kind, space });
  if (s !== seq || !r) return;
  data = r;
  draw();
}

function thumb(s) {
  if (s.kind === 'colour') return `<span class="t" style="background:${esc(s.colour)}"></span>`;
  if (s.kind === 'type' && !s.hasShot) return `<span class="t type" style="font-family:${esc(s.type.stack)};font-weight:${esc(s.type.weight)}">Aa</span>`;
  return `<span class="t" style="background-image:url('aura://library/shot/${s.id}/thumb.jpg')"></span>`;
}

function draw() {
  const c = data.counts || {};
  let nav = KINDS.map(([k, n]) => `<button class="k ${kind === k && !space ? 'on' : ''}" data-kind="${k}">${n}<span>${c[k] || 0}</span></button>`).join('');
  nav += `<div class="h lab">Spaces</div>` + data.spaces.map(sp => `<button class="k ${space === sp.id ? 'on' : ''}" data-space="${sp.id}">${esc(sp.name)}</button>`).join('');
  $('#nav').innerHTML = nav;
  $('#chips').innerHTML = KINDS.map(([k, n]) => `<button class="chip ${kind === k ? 'on' : ''}" data-kind="${k}">${k === 'all' ? 'Everything' : n}</button>`).join('') +
    `<span class="meta">${data.saves.length} ${$('#q').value.trim() ? (data.saves.length === 1 ? 'save matches' : 'saves match') : (data.saves.length === 1 ? 'save' : 'saves')}</span>`;
  if (!data.saves.length) {
    $('#grid').innerHTML = $('#q').value.trim() || kind !== 'all' || space
      ? `<div class="empty" style="grid-column:1/-1">${icon('search', 24)}<b>Nothing matches</b><span>Try fewer words, or describe the colour, the type or the site.</span></div>`
      : `<div class="empty" style="grid-column:1/-1">${icon('camera', 24)}<b>Your Library is empty</b><span>Press ⌘S on any site to save the whole view. ⌘⇧S saves its look: colours, type and values. Everything stays on this Mac.</span></div>`;
  } else {
    $('#grid').innerHTML = data.saves.map(s => `<button class="card ${sel === s.id ? 'on' : ''}" data-id="${s.id}">${thumb(s)}<span class="m"><b class="trunc">${esc(s.title || s.host)}</b><span class="trunc">${KIND_ONE[s.kind]} from ${esc(s.host || '')}, ${ago(s.created)}</span></span></button>`).join('');
  }
  drawDetail();
}

async function drawDetail() {
  const aside = $('#aside');
  if (!sel) { aside.classList.remove('on'); return; }
  const s = data.saves.find(x => x.id === sel) || await A.call('lib:get', { id: sel });
  if (!s) { sel = null; aside.classList.remove('on'); return; }
  aside.classList.add('on');
  const look = s.look || {};
  let h = `<div class="hd"><input id="title" value="${esc(s.title || '')}" spellcheck="false"><button class="x" data-act="close" title="Close">${icon('x', 14)}</button></div>`;
  if (s.kind === 'colour') h += `<div class="shot" style="height:160px;background:${esc(s.colour)}"></div><div><button class="col" data-copy="${esc(s.colour)}"><i style="background:${esc(s.colour)}"></i><b>${esc(s.colour.slice(1))}</b><span>Click to copy</span></button></div>`;
  else if (s.hasShot) h += `<div class="shot"><img src="aura://library/shot/${s.id}/shot.png" alt=""></div>`;
  h += `<div class="src">${icon('globe', 14)}<a href="#" data-open="${esc(s.url)}" class="trunc">${esc(s.host || s.url)}</a><span>· ${ago(s.created)}</span></div>`;
  if (s.kind === 'type' && s.type) {
    const t = s.type;
    h += `<div><h2>Typeface<em>${esc(t.weight)}, ${esc(t.size)}</em></h2><div class="spec" style="font-family:${esc(t.stack)};font-style:${esc(t.style)}"><span style="font-size:40px;font-weight:${esc(t.weight)};line-height:1">${esc(t.family)}</span><span style="font-size:18px">${esc(t.sample || 'The quick brown fox jumps over the lazy dog')}</span><span style="font-size:12.5px;line-height:1.4">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</span></div>
      <div class="vals" style="margin-top:8px"><div>Line height<b>${esc(t.lineHeight)}</b></div><div>Tracking<b>${esc(t.letterSpacing)}</b></div><div>Colour<b>${esc(t.color)}</b></div></div></div>`;
  }
  if (look.colours && look.colours.length) h += `<div><h2>Colours<em>click to copy</em></h2>${look.colours.map(c => `<button class="col" data-copy="${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i><b>${esc(c.hex.slice(1))}</b><span>${esc(c.role)}</span></button>`).join('')}</div>`;
  if (look.faces && look.faces.length && s.kind !== 'type') h += `<div><h2>Type<em>${look.faces.length} ${look.faces.length === 1 ? 'face' : 'faces'}</em></h2>${look.faces.map(f => `<div class="face"><span class="s" style="font-family:${esc(f.stack)};font-weight:${esc(f.weight)}">${esc(f.family)}</span><div class="d"><span>${esc(f.role)}, ${esc(f.weight)}, ${esc(f.size)}</span><span>${esc(f.licence)}</span></div></div>`).join('')}</div>`;
  if (look.values) h += `<div><h2>Values</h2><div class="vals"><div>Radius<b>${esc(look.values.radius)}</b></div><div>Measure<b>${esc(look.values.measure)}</b></div><div>Motion<b>${esc(look.values.motion)}</b></div></div></div>`;
  h += `<div><h2>Note</h2><textarea id="note" placeholder="Why you kept it">${esc(s.note || '')}</textarea></div>`;
  h += `<div><h2>Found by</h2><div class="tags">${(s.tags || []).slice(0, 24).map(t => `<span>${esc(t)}</span>`).join('')}</div></div>`;
  h += `<div class="acts"><button class="btn pri" data-open="${esc(s.url)}">${icon('ext', 14)}Open page</button>${look.colours ? `<button class="btn" data-act="css">Copy as CSS</button>` : ''}${s.hasShot ? `<button class="btn" data-act="export">Export PNG</button>` : ''}<button class="btn" data-act="del">${icon('trash', 14)}Delete</button></div>`;
  $('#det').innerHTML = h;
}

let t = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { clearTimeout(t); t = setTimeout(load, 120); }
  if (e.target.id === 'title' || e.target.id === 'note') { clearTimeout(t); t = setTimeout(() => A.call('lib:update', { id: sel, title: $('#title').value, note: $('#note').value }), 400); }
});
document.addEventListener('click', async (e) => {
  const k = e.target.closest('[data-kind]');
  if (k) { kind = k.dataset.kind; space = ''; return load(); }
  const sp = e.target.closest('[data-space]');
  if (sp) { space = space === sp.dataset.space ? '' : sp.dataset.space; kind = 'all'; return load(); }
  const c = e.target.closest('.card[data-id]');
  if (c) { sel = sel === c.dataset.id ? null : c.dataset.id; history.replaceState(null, '', sel ? '#' + sel : '#'); return draw(); }
  const cp = e.target.closest('[data-copy]');
  if (cp) { A.call('copy', { text: cp.dataset.copy }); const s = document.createElement('small'); s.textContent = 'Copied'; cp.appendChild(s); setTimeout(() => s.remove(), 1200); return; }
  const op = e.target.closest('[data-open]');
  if (op) { e.preventDefault(); return A.call('open', { url: op.dataset.open, newTab: true }); }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'close') { sel = null; history.replaceState(null, '', '#'); draw(); }
  if (a.dataset.act === 'css') { await A.call('lib:css', { id: sel }); a.textContent = 'Copied'; }
  if (a.dataset.act === 'export') A.call('lib:export', { id: sel });
  if (a.dataset.act === 'del') { await A.call('lib:remove', { id: sel }); sel = null; history.replaceState(null, '', '#'); load(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sel) { sel = null; draw(); }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#q').focus(); }
});
window.addEventListener('hashchange', () => { sel = location.hash.slice(1) || null; draw(); });
A.on(w => { if (w === 'library') load(); });
load();
