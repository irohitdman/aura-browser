// Aura chrome: sidebar, collapsed strip, toolbar, This page panel and popovers.
/* global icon, IC */
const $ = (s) => document.querySelector(s);
const act = (t, a) => window.aura.act(t, a);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMac = navigator.platform.startsWith('Mac');

let S = null;          // last state from the main process
let pop = null;        // open popover id
let cmdMode = 'find';  // 'find' (⌘K) or 'address' (⌘L)
let cmdItems = [], cmdSel = 0, cmdSeq = 0;
let findOn = false;
let ed = null;         // Space editor draft
let dragId = null;
const last = {};       // last rendered html per region

function put(el, key, html) { if (last[key] !== html) { last[key] = html; el.innerHTML = html; } }

// ---------- helpers ----------
const INTERNAL = { newtab: ['daily', 'Daily'], library: ['library', 'Library'], history: ['clock', 'History'], downloads: ['download', 'Downloads'], settings: ['gear', 'Settings'], error: ['info', 'Page didn’t load'] };
function internalOf(url) { const m = /^aura:\/\/([a-z]+)/.exec(url || ''); return m ? m[1] : null; }
function fav(it, cls = '') {
  const k = internalOf(it.url);
  if (k && INTERNAL[k]) return `<span class="fav ${k === 'newtab' ? 'daily' : ''} ${cls}">${icon(INTERNAL[k][0], 15)}</span>`;
  if (it.fav && /^(https?|data):/.test(it.fav)) return `<span class="fav ${cls}"><img src="${esc(it.fav)}" alt=""></span>`;
  return `<span class="fav ${cls}">${icon('globe', 15)}</span>`;
}
function titleOf(it) { const k = internalOf(it.url); return k && INTERNAL[k] ? INTERNAL[k][1] : (it.title || it.url); }
function allItems() { if (!S) return []; const out = [...S.pins]; S.folders.forEach(f => out.push(...f.items)); out.push(...S.today); return out; }
function keyFor(id) { const i = allItems().findIndex(x => x.id === id); return i >= 0 && i < 8 ? (isMac ? '⌘' : 'Ctrl+') + (i + 1) : ''; }
function status(it) {
  if (it.loading) return '<span class="spin"></span>';
  if (it.audible) return '<span class="eq"><i></i><i></i><i></i></span>';
  if (it.on) return '<span class="led"></span>';
  return '';
}

// ---------- theme ----------
function applyTheme(t) {
  const r = document.documentElement.style;
  const map = { body: 'body', plate: 'plate', key: 'key', keylit: 'keylit', keyhov: 'keyhov', well: 'well', alu: 'alu', ink: 'ink', mute: 'mute', line: 'line', accent: 'accent', accent30: 'accent30', onaccent: 'onaccent', pop: 'pop', savebg: 'savebg', savefg: 'savefg', savehi: 'savehi' };
  for (const k in map) if (t[k]) r.setProperty('--' + map[k], t[k]);
  document.body.classList.toggle('lightmode', !!t.light);
}

// ---------- sidebar ----------
function rowHtml(it, where, folderId) {
  return `<div class="row ${it.on ? 'on' : ''} ${it.live ? '' : 'asleep'}" draggable="true" data-id="${it.id}" data-where="${where}" ${folderId ? `data-folder="${folderId}"` : ''} title="${esc(titleOf(it))}\n${esc(it.url)}">
    <button class="rmain" data-act="activate" data-id="${it.id}">${fav(it)}<span class="trunc">${esc(titleOf(it))}</span></button>
    ${status(it)}<span class="tk">${keyFor(it.id)}</span>
    <button class="rx" data-act="${where === 'today' ? 'close' : 'sleep'}" data-id="${it.id}" title="${where === 'today' ? 'Close tab' : 'Put to sleep'}">${icon('x', 13)}</button>
  </div>`;
}

function renderSide() {
  const pins = $('#pins');
  if (!S.pins.length) {
    pins.classList.add('empty');
    put(pins, 'pins', `<div class="pinhint" data-drop="pins">Drag a tab here to pin it</div>`);
  } else {
    pins.classList.remove('empty');
    put(pins, 'pins', S.pins.map(p => `<button class="pin ${p.on ? 'on' : ''} ${p.live ? '' : 'asleep'}" draggable="true" data-act="activate" data-id="${p.id}" data-where="pins" title="${esc(titleOf(p))}">${fav(p)}</button>`).join(''));
  }

  let h = '';
  for (const f of S.folders) {
    const renaming = S.rt.renameFolder === f.id;
    h += `<div class="list"><div class="frow ${f.open ? 'open' : ''}" data-folder-row="${f.id}" data-act="folder" data-id="${f.id}">
      <span class="chv">${icon('chevr', 12)}</span>${icon(f.open ? 'folderOpen' : 'folder', 16)}
      ${renaming ? `<input class="frename" data-id="${f.id}" value="${esc(f.name)}" spellcheck="false">` : `<span class="trunc">${esc(f.name)}</span>`}<small>${f.items.length}</small></div>`;
    if (f.open) h += `<div class="fkids" data-folder="${f.id}">${f.items.length ? f.items.map(it => rowHtml(it, 'folder', f.id)).join('') : '<span class="fempty">Drag tabs here</span>'}</div>`;
    h += `</div>`;
  }
  h += `<div class="list today" data-drop="today"><div class="lab"><span>Today</span><span>${S.today.length}</span></div>`;
  h += S.today.map(it => rowHtml(it, 'today')).join('');
  h += `<button class="newt" data-act="newtab">${icon('plus', 16)}<span>New tab</span><kbd>${isMac ? '⌘T' : 'Ctrl+T'}</kbd></button></div>`;
  put($('#scroll'), 'scroll', h);
  const inp = document.querySelector('.frename');
  if (inp && document.activeElement !== inp) { inp.focus(); inp.select(); }

  put($('#sbar'), 'sbar', `<button class="sbk ${internalOf(S.page && S.page.url) === 'library' ? 'open' : ''}" data-act="library" title="Library  ${isMac ? '⌘⇧O' : ''}">${icon('library', 16)}</button>
    <div class="sps">${S.spaces.map((sp, i) => `<button class="spi ${sp.id === S.active ? 'on' : ''}" data-act="space" data-id="${sp.id}" title="${esc(sp.name)}${i < 4 ? '  ⌃' + (i + 1) : ''}">${icon(sp.icon, 16)}</button>`).join('')}</div>
    <button class="sbk ${pop === 'nmenu' ? 'open' : ''}" data-act="nmenu" title="New">${icon('plus', 16)}</button>`);
  $('#sbBtn').innerHTML = icon('sidebar', 16);
}

function renderStrip() {
  let n = 0;
  const k = (it, pinned) => { n++; return `<button class="tkey ${pinned ? 'pinned' : ''} ${it.on ? 'on' : ''} ${it.live ? '' : 'asleep'}" data-act="activate" data-id="${it.id}" title="${esc(titleOf(it))}">${fav(it)}${n <= 9 ? `<span class="num">${n}</span>` : ''}</button>`; };
  let h = `<div class="sc">`;
  S.pins.forEach(p => { h += k(p, true); });
  if (S.pins.length) h += `<span class="sep"></span>`;
  S.folders.forEach(f => { h += `<div class="sfold"><button class="fic" data-act="folder" data-id="${f.id}" title="${esc(f.name)}">${icon(f.open ? 'folderOpen' : 'folder', 15)}</button>${f.open ? f.items.map(it => k(it)).join('') : ''}</div>`; });
  if (S.folders.length) h += `<span class="sep"></span>`;
  S.today.forEach(it => { h += k(it); });
  h += `<button class="tkey" data-act="newtab" title="New tab">${icon('plus', 15)}</button></div>`;
  h += `<div class="sspaces">${S.spaces.map(sp => `<button class="spi ${sp.id === S.active ? 'on' : ''}" data-act="space" data-id="${sp.id}" title="${esc(sp.name)}">${icon(sp.icon, 16)}</button>`).join('')}</div>`;
  h += `<button class="sbk" data-act="library" title="Library">${icon('library', 16)}</button><button class="sbk" data-act="smenu" title="Sidebar">${icon('sidebar', 16)}</button>`;
  put($('#strip'), 'strip', h);
}

// ---------- toolbar ----------
function wellHtml() {
  const p = S.page;
  const f = S.rt.flash;
  if (f) {
    const ic = { check: 'check', download: 'download', key: 'key', info: 'info', area: 'area', type: 'type' }[f.icon] || 'info';
    let acts = (f.actions || []).map(([label, a]) => `<button data-act="run" data-action="${esc(a)}">${esc(label)}</button>`).join('');
    if (f.pw) acts = `<button class="pri" data-act="pwSave">Save</button><button data-act="pwNever">Never for this site</button><button data-act="unflash">Not now</button>`;
    return { cls: 'flash', html: `<span class="${f.saved ? 'ok' : 'wi'}">${icon(ic, 15)}</span><b>${esc(f.title)}</b><span class="trunc">${esc(f.text || '')}</span><span class="acts">${acts}</span>` };
  }
  if (!p) return { cls: '', html: '' };
  const k = internalOf(p.url);
  if (k) {
    let sub = '';
    if (k === 'newtab') { const d = new Date(); sub = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) + ', 40 picks'; }
    if (k === 'library') sub = S.saves + (S.saves === 1 ? ' save' : ' saves');
    if (k === 'error') { try { sub = new URL(p.url).searchParams.get('url') || ''; } catch (e) {} }
    return { cls: '', html: `<span class="wi">${icon(INTERNAL[k] ? INTERNAL[k][0] : 'info', 14)}</span><span class="host">${esc(INTERNAL[k] ? INTERNAL[k][1] : k)}</span><span class="trunc path">${esc(sub)}</span><kbd class="tag">${isMac ? '⌘K' : 'Ctrl+K'}</kbd>` };
  }
  let host = p.url, path = '';
  try { const u = new URL(p.url); host = u.hostname.replace(/^www\./, ''); path = (u.pathname === '/' ? '' : u.pathname) + u.search; if (u.protocol === 'file:') { host = 'file'; path = decodeURI(u.pathname); } } catch (e) {}
  return { cls: '', html: `<span class="wi">${icon(p.secure ? 'lock' : 'info', 14)}</span><span class="host">${esc(host)}</span><span class="trunc path">${esc(path)}</span>${p.zoom !== 100 ? `<span class="zoom">${p.zoom}%</span>` : ''}<kbd class="tag">${isMac ? '⌘K' : 'Ctrl+K'}</kbd>` };
}

function renderBar() {
  const p = S.page || {};
  const look = p.look;
  const sw = look && look.colours && look.colours.length ? look.colours.slice(0, 5) : null;
  const w = wellHtml();
  const h = `<div class="dock nodrag">
      <button class="key ${p.back ? '' : 'dim'}" data-act="back" title="Back  ${isMac ? '⌘[' : ''}">${icon('back')}</button>
      <button class="key ${p.fwd ? '' : 'dim'}" data-act="forward" title="Forward  ${isMac ? '⌘]' : ''}">${icon('fwd')}</button>
      <button class="key" data-act="reload" title="${p.loading ? 'Stop' : 'Reload  ⌘R'}">${icon(p.loading ? 'stop' : 'reload')}</button>
    </div>
    <div class="wellwrap nodrag">
      <div class="well ${w.cls}" id="well" role="button" tabindex="-1" data-act="${w.cls === 'flash' ? 'noop' : 'address'}" style="${findOn ? 'display:none' : ''}">${w.html}</div>
      <div class="well find" id="findWell" style="${findOn ? '' : 'display:none'}"><span class="wi">${icon('search', 14)}</span><input id="findIn" placeholder="Find in page" spellcheck="false"><span class="cnt" id="findCnt"></span><button class="key" data-act="findPrev" title="Previous  ⇧⏎">${icon('back', 14)}</button><button class="key" data-act="findNext" title="Next  ⏎">${icon('fwd', 14)}</button><button class="key" data-act="findStop" title="Done  esc">${icon('x', 14)}</button></div>
      ${p.loading ? '<span class="loadline"></span>' : ''}
    </div>
    ${sw ? `<button class="pal nodrag ${S.ui.panel ? 'on' : ''}" data-act="panel" title="This page: colours, type and values  ${isMac ? '⌘I' : ''}">${sw.map(c => `<i style="background:${esc(c.hex)}"></i>`).join('')}<em>${isMac ? '⌘I' : ''}</em></button>` : ''}
    <div class="save nodrag"><button data-act="save" data-kind="page" title="Save whole view  ${isMac ? '⌘S' : ''}">${icon('camera')}Save</button><button data-act="saveMenu" title="More ways to save">${icon('chev', 14)}</button></div>
    <div class="dock nodrag">
      <button class="key" data-act="save" data-kind="colour" title="Save a colour  ${isMac ? '⌥⌘C' : ''}">${icon('pen')}</button>
      <button class="key" data-act="save" data-kind="type" title="Save a typeface  ${isMac ? '⌥⌘T' : ''}">${icon('type')}</button>
      <button class="key" data-act="downloads" title="Downloads">${icon('download')}${S.rt.downloads ? '<span class="badge"></span>' : ''}</button>
      <button class="key" data-act="settings" title="Settings  ${isMac ? '⌘,' : ''}">${icon('puzzle')}</button>
    </div>`;
  put($('#bar'), 'bar', h);
  if (findOn && p.find) $('#findCnt').textContent = p.find.text ? (p.find.matches ? `${p.find.active} of ${p.find.matches}` : 'No matches') : '';
}

// ---------- This page panel ----------
function renderPanel() {
  const p = S.page || {};
  const look = p.look;
  if (!look) {
    put($('#panel'), 'panel', `<div class="hd"><b>This page</b><button class="key" data-act="panel" title="Close  ⌘I">${icon('x', 14)}</button></div>
      <div class="empty">${icon('drop', 22)}<b>Nothing to read yet</b><span>Open a website and Aura reads its colours, type and values here.</span></div>`);
    return;
  }
  const colours = look.colours.map(c => `<button class="col" data-act="copy" data-text="${esc(c.hex)}" title="Copy ${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i><b>${esc(c.hex.slice(1))}</b><span>${esc(c.role)}</span></button>`).join('');
  const faces = look.faces.map(f => `<div class="face"><span class="s" style="font-family:${esc(f.stack)};font-weight:${esc(f.weight)}">${esc(f.family)}</span><div class="d"><span>${esc(f.role)}, ${esc(f.weight)}, ${esc(f.size)}</span><span>${esc(f.licence)}</span></div></div>`).join('');
  const v = look.values || {};
  put($('#panel'), 'panel', `<div class="hd"><b>This page<span>${esc(look.host)}</span></b><button class="key" data-act="panel" title="Close  ⌘I">${icon('x', 14)}</button></div>
    <div class="body">
      <div><h2>Colours<em>${look.colours.length} found, click to copy</em></h2>${colours}</div>
      <div><h2>Type<em>${look.faces.length} ${look.faces.length === 1 ? 'face' : 'faces'}</em></h2>${faces || '<span class="fempty">No text on screen</span>'}</div>
      <div><h2>Values</h2><div class="vals"><div>Radius<b>${esc(v.radius)}</b></div><div>Measure<b>${esc(v.measure)}</b></div><div>Motion<b>${esc(v.motion)}</b></div></div></div>
    </div>
    <div class="act">${p.savedLook ? `<button class="btn pri" data-act="library">${icon('check', 15)}Saved to Library</button>` : `<button class="btn pri" data-act="save" data-kind="look">${icon('camera', 15)}Save this look</button>`}<button class="btn" data-act="copyCss">Copy as CSS</button></div>`);
}

// ---------- layout ----------
function layout() {
  const f = S.frame;
  const ui = S.ui;
  const sideShown = ui.sidebar === 'full' || (ui.sidebar === 'hidden' && S.rt.revealSide);
  $('#side').classList.toggle('off', !sideShown);
  $('#strip').classList.toggle('off', ui.sidebar !== 'icons');
  const barShown = f.barH > 0;
  const bar = $('#bar');
  bar.classList.toggle('off', !barShown);
  let left = f.sideW;
  if (ui.sidebar === 'icons' && isMac && !S.full) left = f.sideW + 70;
  if (!f.sideW && isMac && !S.full) left = 78;
  bar.style.left = left + 'px';
  bar.style.right = '0px';
  const fr = $('#frame');
  Object.assign(fr.style, { left: f.x + 'px', top: f.y + 'px', width: f.width + 'px', height: f.height + 'px' });
  fr.classList.toggle('calm', f.r === 0);
  const pn = $('#panel');
  pn.classList.toggle('off', !ui.panel);
  pn.style.top = (f.barH || 10) + 'px';
  $('#still').style.backgroundImage = S.rt.still ? `url(${S.rt.still})` : 'none';
  $('#shade').classList.toggle('on', !!S.rt.overlay && !!pop);
  // Save menu sits under the Save button.
  const sb = document.querySelector('.save');
  if (sb) { const r = sb.getBoundingClientRect(); $('#saveMenu').style.left = Math.max(10, Math.min(window.innerWidth - 326, r.right - 316)) + 'px'; }
}

function render(s) {
  S = s;
  applyTheme(S.theme);
  renderSide();
  if (S.ui.sidebar === 'icons') renderStrip();
  renderBar();
  if (S.ui.panel) renderPanel();
  layout();
  if (pop === 'spaceEd') renderSpaceEd();
}

// ---------- popovers ----------
async function openPop(id) {
  if (pop === id) return closePop();
  if (pop) hidePop();
  pop = id;
  if (id === 'saveMenu') renderSaveMenu();
  if (id === 'smenu') renderSMenu();
  if (id === 'nmenu') renderNMenu();
  if (id === 'spaceEd') renderSpaceEd();
  const el = document.getElementById(id);
  if (id === 'smenu') {
    const b = S.ui.sidebar === 'icons' ? document.querySelector('#strip [data-act=smenu]') : $('#sbBtn');
    const r = b.getBoundingClientRect();
    Object.assign(el.style, S.ui.sidebar === 'icons' ? { left: '60px', top: 'auto', bottom: '12px' } : { left: Math.min(r.left, 14) + 'px', top: r.bottom + 6 + 'px', bottom: 'auto' });
  }
  if (id === 'nmenu' || id === 'spaceEd') {
    Object.assign(el.style, S.ui.sidebar === 'icons' ? { left: '60px', bottom: '12px' } : { left: '12px', bottom: '54px' });
  }
  await act('overlay', { on: true });
  el.classList.add('on');
  layout();
  if (id === 'cmd') { const i = $('#cmdIn'); i.focus(); i.select(); }
  if (id === 'spaceEd') { const i = $('#spName'); if (i) { i.focus(); i.select(); } }
  if (['saveMenu', 'smenu', 'nmenu'].includes(id)) el.querySelector('button').focus();
}
function hidePop() { if (pop) document.getElementById(pop).classList.remove('on'); }
function closePop(keepOverlay) {
  if (!pop) return;
  hidePop();
  pop = null;
  ed = null;
  $('#shade').classList.remove('on');
  if (!keepOverlay) act('overlay', { on: false });
  renderSide();
}

function renderSaveMenu() {
  const r = (kind, ic, b, s, k) => `<button class="mrow" data-act="save" data-kind="${kind}"><span class="ic">${icon(ic, 15)}</span><span><b>${b}</b><small>${s}</small></span><kbd>${k}</kbd></button>`;
  $('#saveMenu').innerHTML = r('page', 'camera', 'Whole view', 'Screenshot and address', '⌘S') + r('look', 'panel', 'This look', 'Colours, type and values', '⌘⇧S') + '<hr>' +
    r('type', 'type', 'A typeface', 'Click any text', '⌥⌘T') + r('colour', 'drop', 'A colour', 'Pick from the page', '⌥⌘C') + r('area', 'area', 'An area', 'Drag over part of the page', '⌘⇧A');
}
function renderSMenu() {
  const ui = S.ui;
  const r = (on, a, b, s, k) => `<button class="mrow simple" data-act="run" data-action="${a}"><span class="ck">${on ? icon('check', 14) : ''}</span><span><b>${b}</b>${s ? `<small>${s}</small>` : ''}</span><kbd>${k}</kbd></button>`;
  $('#smenu').innerHTML = '<div class="hdr">Sidebar</div>' +
    r(ui.sidebar === 'full', 'ui:sidebar:full', 'Always show', 'The sidebar stays beside the page', '⌘⇧1') +
    r(ui.sidebar === 'icons', 'ui:sidebar:icons', 'Collapse to icons', 'One icon per tab, numbered for ⌘1 to ⌘9', '⌘⇧2') +
    r(ui.sidebar === 'hidden', 'ui:sidebar:hidden', 'Hide', 'Point at the left edge to open it', '⌘⇧3') +
    '<div class="hdr">Toolbar</div>' + r(ui.toolbar, 'toolbar', 'Keep the toolbar showing', 'Off: point at the top edge to bring it back', '⌘⇧L') +
    '<div class="hdr">Chrome</div>' + r(ui.theme === 'dark', 'ui:theme:dark', 'Dark', '', '') + r(ui.theme === 'light', 'ui:theme:light', 'Light', '', '') + r(ui.theme === 'system', 'ui:theme:system', 'Match macOS', '', '');
}
function renderNMenu() {
  const r = (a, ic, b, k) => `<button class="mrow simple" data-act="run" data-action="${a}"><span class="ic">${icon(ic, 16)}</span><span><b>${b}</b></span><kbd>${k}</kbd></button>`;
  $('#nmenu').innerHTML = r('cmd:newtab', 'plus', 'New tab', '⌘T') + r('cmd:newfolder', 'folder', 'New folder', '') + r('newspace', 'star', 'New Space', '⌘⇧N') + '<hr>' +
    r('open:aura://library/', 'library', 'Library', '⌘⇧O') + r('open:aura://history/', 'clock', 'History', '⌘Y') + r('open:aura://downloads/', 'download', 'Downloads', '⌥⌘L') + r('open:aura://settings/', 'gear', 'Settings', '⌘,');
}

// Create or edit a Space: name, icon, colour and tint. Editing previews live.
function startSpaceEd(id) {
  const sp = id && S.spaces.find(s => s.id === id);
  ed = sp ? { mode: 'edit', id: sp.id, name: sp.name, icon: sp.icon, color: sp.color, tint: sp.tint ?? 24 } : { mode: 'create', name: '', icon: 'star', color: 'green', tint: 24 };
  openPop('spaceEd');
}
const COLOUR_HEX = { graphite: '#9EB8D9', red: '#E5534B', orange: '#F0883E', yellow: '#E3B341', green: '#3FB950', teal: '#39C5BB', blue: '#6CA6F5', slate: '#8B9BB4' };
function renderSpaceEd() {
  if (!ed) return;
  const el = $('#spaceEd');
  const focused = document.activeElement && document.activeElement.id;
  el.innerHTML = `<h3>${ed.mode === 'create' ? 'New Space' : 'Edit Space'}</h3>
    <p class="lead">${ed.mode === 'create' ? 'A Space keeps its own tabs, logins and theme, like a separate account.' : 'Changes show in the window as you make them.'}</p>
    <label class="name"><span class="ib">${icon(ed.icon, 16)}</span><input id="spName" value="${esc(ed.name)}" placeholder="Name it, for example Clients" maxlength="40" spellcheck="false"></label>
    <div class="igrid">${(S.icons || []).map(i => `<button class="cell ${ed.icon === i ? 'on' : ''}" data-act="edIcon" data-v="${i}" title="${i}">${icon(i, 16)}</button>`).join('')}</div>
    <div class="cols">${(S.colours || []).map(c => `<button class="chip ${ed.color === c ? 'on' : ''}" data-act="edColour" data-v="${c}"><i style="background:${COLOUR_HEX[c]}"></i>${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div>
    ${ed.color !== 'graphite' ? `<label class="tint">Tint<input type="range" id="spTint" min="0" max="100" value="${ed.tint}"><b>${ed.tint}</b></label>` : ''}
    <button class="cbtn" data-act="edDone" ${ed.name.trim() ? '' : 'disabled'}>${ed.mode === 'create' ? 'Create Space' : 'Done'}</button>
    <button class="cancel" data-act="edCancel">${ed.mode === 'create' ? 'Cancel' : 'Close'}</button>`;
  if (focused === 'spName') { const i = $('#spName'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function edLive() { if (ed && ed.mode === 'edit') act('spaceUpdate', { id: ed.id, name: ed.name || 'Space', icon: ed.icon, color: ed.color, tint: ed.tint }); }

// ---------- command bar ----------
function openCmd(mode) {
  cmdMode = mode;
  const i = $('#cmdIn');
  const p = S.page;
  i.value = mode === 'address' && p && !internalOf(p.url) ? p.url : '';
  i.placeholder = mode === 'address' ? 'Enter an address or search' : 'Search, enter an address, or describe a save';
  $('#cmdIc').innerHTML = icon('search', 18);
  queryCmd();
  openPop('cmd');
}
async function queryCmd() {
  const q = $('#cmdIn').value;
  const seq = ++cmdSeq;
  const res = await act('commands', { q: cmdMode === 'address' && S.page && q === S.page.url ? '' : q });
  if (seq !== cmdSeq) return;
  cmdItems = res || [];
  cmdSel = 0;
  drawCmd();
}
function drawCmd() {
  let h = '', g = null;
  cmdItems.forEach((r, i) => {
    if (r.group !== g) { g = r.group; if (g !== 'Go') h += `<div class="grp">${esc(g)}</div>`; }
    let t;
    if (r.kind === 'save') t = r.thumb ? `<span class="t" style="background-image:url('${esc(r.thumb)}')"></span>` : `<span class="t" style="background:${esc(r.colour || 'var(--body)')}"></span>`;
    else if (r.kind === 'tab') t = `<span class="t">${fav({ url: r.sub.startsWith('aura') ? r.sub : 'https://' + r.sub, fav: r.fav })}</span>`;
    else if (r.kind === 'cmd') t = `<span class="t">${icon('chevr', 15)}</span>`;
    else t = `<span class="t">${icon(r.kind === 'search' ? 'search' : 'globe', 15)}</span>`;
    h += `<button class="res ${i === cmdSel ? 'on' : ''}" data-act="cmdPick" data-i="${i}">${t}<span class="trunc"><b class="trunc">${esc(r.title)}</b><small class="trunc">${esc(r.sub || '')}</small></span><kbd>${esc(r.key || (r.kind === 'tab' ? 'Switch' : i === cmdSel ? '⏎' : ''))}</kbd></button>`;
  });
  $('#cmdRes').innerHTML = h;
  const on = $('#cmdRes .res.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function pickCmd(i, newTab) {
  const r = cmdItems[i];
  if (!r) return;
  closePop();
  if (r.kind === 'tab') return act('activate', { id: r.id });
  if (r.kind === 'save') return act('internal', { page: 'library', hash: '#' + r.id });
  if (r.kind === 'cmd') return runAction(r.action);
  const inPlace = cmdMode === 'address' || (S.page && internalOf(S.page.url) === 'newtab');
  act('navigate', { url: r.url, newTab: newTab ? !inPlace : !inPlace });
}

function runAction(a) {
  if (!a) return;
  if (a === 'cmd') return openCmd('find');
  if (a === 'newspace') { closePop(true); return startSpaceEd(); }
  if (a === 'toolbar') { closePop(); return act('ui', { toolbar: !S.ui.toolbar }); }
  if (a.startsWith('ui:')) { const [, k, v] = a.split(':'); closePop(); return act('ui', { [k]: v }); }
  closePop();
  act('run', { action: a });
}

// ---------- find ----------
function openFind() {
  findOn = true;
  renderBar();
  const i = $('#findIn');
  const p = S.page;
  if (p && p.find && p.find.text) i.value = p.find.text;
  i.focus(); i.select();
}
function stopFind() { findOn = false; act('findStop'); renderBar(); }

// ---------- events ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (pop && !e.target.closest('.pop') && !(b && ['saveMenu', 'smenu', 'nmenu'].includes(b.dataset.act))) { closePop(); if (!b) return; }
  if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case 'activate': act('activate', { id }); break;
    case 'close': act('close', { id }); break;
    case 'sleep': act('tabMenu', { id }); break;
    case 'newtab': act('newTab', {}); break;
    case 'space': act('space', { id }); break;
    case 'folder': if (!e.target.closest('input')) { const f = S.folders.find(x => x.id === id); if (f) act('folderUpdate', { id, open: !f.open }); } break;
    case 'library': act('internal', { page: 'library' }); break;
    case 'downloads': act('internal', { page: 'downloads' }); break;
    case 'settings': act('internal', { page: 'settings' }); break;
    case 'back': act('back'); break;
    case 'forward': act('forward'); break;
    case 'reload': act('reload'); break;
    case 'address': openCmd('address'); break;
    case 'panel': act('ui', { panel: !S.ui.panel }); break;
    case 'save': closePop(); act('save', { kind: b.dataset.kind }); break;
    case 'saveMenu': openPop('saveMenu'); break;
    case 'smenu': openPop('smenu'); break;
    case 'nmenu': openPop('nmenu'); break;
    case 'run': runAction(b.dataset.action); break;
    case 'copy': act('copy', { text: b.dataset.text }); { const s = document.createElement('small'); s.textContent = 'Copied'; b.querySelector('small') || b.appendChild(s); setTimeout(() => s.remove(), 1200); } break;
    case 'copyCss': act('copyCss'); break;
    case 'findNext': act('find', { text: $('#findIn').value, forward: true }); break;
    case 'findPrev': act('find', { text: $('#findIn').value, forward: false }); break;
    case 'findStop': stopFind(); break;
    case 'cmdPick': pickCmd(Number(b.dataset.i), e.metaKey); break;
    case 'pwSave': act('pwSave', S.rt.flash.pw); break;
    case 'pwNever': act('pwNever', { origin: S.rt.flash.pw.origin }); break;
    case 'unflash': act('unflash'); break;
    case 'edIcon': ed.icon = b.dataset.v; renderSpaceEd(); edLive(); break;
    case 'edColour': ed.color = b.dataset.v; renderSpaceEd(); edLive(); break;
    case 'edDone':
      if (ed.mode === 'create') act('spaceCreate', { name: ed.name.trim(), icon: ed.icon, color: ed.color, tint: ed.tint });
      else edLive();
      closePop(); break;
    case 'edCancel': closePop(); break;
  }
});
document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-id]');
  if (!row) return;
  e.preventDefault();
  if (row.dataset.act === 'space') return act('menuSpace', { id: row.dataset.id });
  if (row.dataset.folderRow || row.dataset.act === 'folder') return act('folderMenu', { id: row.dataset.id || row.dataset.folderRow });
  act('tabMenu', { id: row.dataset.id });
});
document.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const row = e.target.closest('.row[data-where=today]');
  if (row) act('close', { id: row.dataset.id });
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'cmdIn') queryCmd();
  if (e.target.id === 'findIn') act('find', { text: e.target.value });
  if (e.target.id === 'spName') { ed.name = e.target.value; const btn = document.querySelector('#spaceEd .cbtn'); btn.disabled = !ed.name.trim(); edLive(); }
  if (e.target.id === 'spTint') { ed.tint = Number(e.target.value); e.target.nextElementSibling.textContent = ed.tint; edLive(); }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.id === 'cmdIn') {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdItems.length - 1, cmdSel + 1); drawCmd(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(0, cmdSel - 1); drawCmd(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickCmd(cmdSel, e.metaKey || e.ctrlKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
    return;
  }
  if (t.id === 'findIn') {
    if (e.key === 'Enter') { e.preventDefault(); act('find', { text: t.value, forward: !e.shiftKey }); }
    else if (e.key === 'Escape') { e.preventDefault(); stopFind(); }
    return;
  }
  if (t.classList && t.classList.contains('frename')) {
    if (e.key === 'Enter') { e.preventDefault(); act('folderUpdate', { id: t.dataset.id, name: t.value }); }
    else if (e.key === 'Escape') { e.preventDefault(); act('folderUpdate', { id: t.dataset.id, name: t.defaultValue }); }
    return;
  }
  if (e.key === 'Escape' && pop) { e.preventDefault(); closePop(); return; }
  if (pop && ['saveMenu', 'smenu', 'nmenu'].includes(pop) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = [...document.querySelectorAll('#' + pop + ' button')];
    const i = items.indexOf(document.activeElement);
    const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (n) n.focus();
  }
});
document.addEventListener('focusout', (e) => {
  if (e.target.classList && e.target.classList.contains('frename')) act('folderUpdate', { id: e.target.dataset.id, name: e.target.value });
});

// Drag tabs between pins, folders and Today.
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest('[data-id][draggable]');
  if (!el) return;
  dragId = el.dataset.id;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragend', () => { dragId = null; clearDrop(); document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); });
function clearDrop() { document.querySelectorAll('.dropbefore,.dropafter,.drop').forEach(x => x.classList.remove('dropbefore', 'dropafter', 'drop')); }
function dropTarget(e) {
  const row = e.target.closest('.row[data-id]');
  if (row && row.dataset.id !== dragId) {
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    const where = row.dataset.where, folderId = row.dataset.folder;
    const list = where === 'today' ? S.today : (S.folders.find(f => f.id === folderId) || { items: [] }).items;
    let index = list.findIndex(x => x.id === row.dataset.id) + (after ? 1 : 0);
    return { el: row, cls: after ? 'dropafter' : 'dropbefore', to: { where, folderId, index } };
  }
  const pin = e.target.closest('.pin[data-id], .pinhint, #pins');
  if (pin) {
    let index = S.pins.length;
    const p = e.target.closest('.pin[data-id]');
    if (p) { const i = S.pins.findIndex(x => x.id === p.dataset.id); const r = p.getBoundingClientRect(); index = i + (e.clientX > r.left + r.width / 2 ? 1 : 0); }
    return { el: $('#pins'), cls: 'drop', to: { where: 'pins', index } };
  }
  const fr = e.target.closest('[data-folder-row]');
  if (fr) return { el: fr, cls: 'drop', to: { where: 'folder', folderId: fr.dataset.folderRow } };
  const kids = e.target.closest('.fkids');
  if (kids) return { el: kids, cls: 'drop', to: { where: 'folder', folderId: kids.dataset.folder } };
  const today = e.target.closest('.today');
  if (today) return { el: today, cls: 'drop', to: { where: 'today' } };
  return null;
}
document.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  t.el.classList.add(t.cls);
});
document.addEventListener('drop', (e) => {
  if (!dragId) return;
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  act('move', { id: dragId, to: t.to });
  dragId = null;
});

// Commands from the menu bar.
window.aura.onCmd((c, a) => {
  if (c === 'cmd') openCmd('find');
  else if (c === 'address') openCmd('address');
  else if (c === 'find') openFind();
  else if (c === 'newspace') startSpaceEd();
  else if (c === 'editspace') startSpaceEd(a);
  else if (c === 'deletespace') act('spaceDelete', { id: a });
});
// Favicons that fail to load fall back to the globe.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.closest('.fav')) { const f = e.target.closest('.fav'); f.innerHTML = icon('globe', 15); }
}, true);
window.aura.onState(render);
