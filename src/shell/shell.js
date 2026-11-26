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

function put(el, key, html) { if (last[key] !== html) { last[key] = html; el.innerHTML = html; return true; } return false; }

// ---------- helpers ----------
const INTERNAL = { newtab: ['daily', 'Daily'], library: ['library', 'Library'], history: ['clock', 'History'], downloads: ['download', 'Downloads'], settings: ['gear', 'Settings'], welcome: ['sparkle', 'Welcome to Aura'], error: ['info', 'Page didn’t load'] };
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

  put($('#sbar'), 'sbar', `<div class="sps">${S.spaces.map((sp, i) => `<button class="spi ${sp.id === S.active ? 'on' : ''}" data-act="space" data-id="${sp.id}" title="${esc(sp.name)}${i < 4 ? '  ⌃' + (i + 1) : ''}">${icon(sp.icon, 16)}</button>`).join('')}</div>
    <button class="sbk ${pop === 'nmenu' ? 'open' : ''}" data-act="nmenu" title="New">${icon('plus', 16)}</button>`);
  $('#sbBtn').innerHTML = icon('sidebar', 16);
  put($('#brand'), 'brand', `${brandMark(S.theme.accent)}<b>Aura</b><span>${esc((S.spaces.find(x => x.id === S.active) || {}).name || '')}</span>`);
}

// The Aura mark: the dotted moon from the app icon, lit from the top left in the Space's accent.
function brandMark(accent) {
  let dots = '';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const cx = 2 + x * 2, cy = 2 + y * 2, d = Math.hypot(cx - 10, cy - 10);
    if (d > 8.4) continue;
    const lit = Math.max(0.12, 1 - Math.hypot(cx - 6, cy - 6) / 13);
    dots += `<circle cx="${cx}" cy="${cy}" r="${(0.35 + lit * 0.5).toFixed(2)}" fill="${accent}" opacity="${lit.toFixed(2)}"/>`;
  }
  return `<svg class="mark" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true">${dots}<circle cx="18.6" cy="3.4" r="1.6" fill="var(--ink)"/></svg>`;
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
  h += `<button class="sbk" data-act="nmenu" title="New">${icon('plus', 16)}</button><button class="sbk" data-act="smenu" title="Sidebar">${icon('sidebar', 16)}</button>`;
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
    if (k === 'newtab') { const d = new Date(); sub = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }); }
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
  const k = (n) => isMac ? n : n.replace('⌘', 'Ctrl+').replace('⌥', 'Alt+').replace('⇧', 'Shift+');
  const web = p.url && /^(https?|file):/.test(p.url);
  const panel = S.ui.panel;
  const h = `<div class="dock nodrag">
      <button class="key ${p.back ? '' : 'dim'}" data-act="back" title="Back  ${k('⌘[')}">${icon('back')}</button>
      <button class="key ${p.fwd ? '' : 'dim'}" data-act="forward" title="Forward  ${k('⌘]')}">${icon('fwd')}</button>
      <button class="key" data-act="reload" title="${p.loading ? 'Stop' : 'Reload  ' + k('⌘R')}">${icon(p.loading ? 'stop' : 'reload')}</button>
    </div>
    <div class="wellwrap nodrag">
      <div class="well ${w.cls}" id="well" role="button" tabindex="-1" data-act="${w.cls === 'flash' ? 'noop' : 'address'}" style="${findOn ? 'display:none' : ''}">${w.html}</div>
      <div class="well find" id="findWell" style="${findOn ? '' : 'display:none'}"><span class="wi">${icon('search', 14)}</span><input id="findIn" placeholder="Find in page" spellcheck="false"><span class="cnt" id="findCnt"></span><button class="key" data-act="findPrev" title="Previous  ⇧⏎">${icon('back', 14)}</button><button class="key" data-act="findNext" title="Next  ⏎">${icon('fwd', 14)}</button><button class="key" data-act="findStop" title="Done  esc">${icon('x', 14)}</button></div>
      ${p.loading ? '<span class="loadline"></span>' : ''}
    </div>
    ${p.store && !p.storeInstalled ? `<button class="addext nodrag" data-act="storeFetch">${icon('plus', 14)}Add to Aura</button>` : ''}
    ${S.split ? `<div class="dock nodrag splitk"><span class="sl">${icon('split', 15)}</span><button class="key" data-act="swapSplit" title="Swap sides">${icon('swap', 15)}</button><button class="key" data-act="unsplit" title="Close split view  ${k('⌘⇧\\')}">${icon('x', 14)}</button></div>` : ''}
    <span class="grow"></span>
    <div class="dock nodrag tools">
      ${sw ? `<button class="pal ${panel === 'inspect' ? 'on' : ''}" data-act="panel" data-v="inspect" title="Inspect: colours, type and assets  ${k('⌘I')}">${sw.map(c => `<i style="background:${esc(c.hex)}"></i>`).join('')}</button>`
         : `<button class="key ${panel === 'inspect' ? 'on' : ''} ${web ? '' : 'dim'}" data-act="panel" data-v="inspect" title="Inspect this page  ${k('⌘I')}">${icon('inspect')}</button>`}
      <button class="key ask ${panel === 'ask' ? 'on' : ''}" data-act="panel" data-v="ask" title="Ask about this page  ${k('⌘J')}">${icon('sparkle')}</button>
    </div>
    <div class="save nodrag"><button data-act="save" data-kind="page" title="Save whole view  ${k('⌘S')}">${icon('camera')}Save</button><button data-act="saveMenu" title="More ways to save">${icon('chev', 14)}</button></div>
    <div class="dock nodrag">
      <button class="key ${pop === 'exts' ? 'on' : ''}" data-act="exts" title="Extensions">${icon('puzzle')}${S.exts.filter(x => x.here).length ? '' : ''}</button>
      <button class="key" data-act="downloads" title="Downloads  ${k('⌥⌘L')}">${icon('download')}${S.rt.downloads ? '<span class="badge"></span>' : ''}</button>
      <button class="key ${internalOf(p.url) === 'library' ? 'on' : ''}" data-act="library" title="Library  ${k('⌘⇧O')}">${icon('library')}</button>
    </div>`;
  put($('#bar'), 'bar', h);
  if (findOn && p.find) $('#findCnt').textContent = p.find.text ? (p.find.matches ? `${p.find.active} of ${p.find.matches}` : 'No matches') : '';
}

// ---------- right panel: Inspect and Ask ----------
function renderPanel() {
  const mode = S.ui.panel;
  const tabs = `<div class="ptabs" role="tablist"><button class="${mode === 'inspect' ? 'on' : ''}" data-act="panel" data-v="inspect" role="tab">${icon('inspect', 14)}Inspect<kbd>${isMac ? '⌘I' : ''}</kbd></button><button class="${mode === 'ask' ? 'on' : ''}" data-act="panel" data-v="ask" role="tab">${icon('sparkle', 14)}Ask<kbd>${isMac ? '⌘J' : ''}</kbd></button><button class="key px" data-act="panel" data-v="${mode}" title="Close">${icon('x', 14)}</button></div>`;
  if (mode === 'ask') return renderAsk(tabs);
  const p = S.page || {};
  const look = p.look;
  if (!look) {
    put($('#panel'), 'panel', tabs + `<div class="empty">${icon('drop', 22)}<b>Nothing to inspect yet</b><span>Open a website and Aura reads its colours, type, images and values here.</span></div>`);
    return;
  }
  const colours = look.colours.map(c => `<button class="col" data-act="copy" data-text="${esc(c.hex)}" title="Copy ${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i><b>${esc(c.hex.slice(1))}</b><span>${esc(c.role)}</span></button>`).join('');
  const faces = look.faces.map(f => `<button class="face" data-act="copy" data-text="font-family: ${esc(f.stack)}; font-weight: ${esc(f.weight)};" title="Copy as CSS"><span class="s" style="font-family:${esc(f.stack)};font-weight:${esc(f.weight)}">${esc(f.family)}</span><div class="d"><span>${esc(f.role)}, ${esc(f.weight)}, ${esc(f.size)}</span><span>${esc(f.licence)}</span></div></button>`).join('');
  const scale = (look.scale || []).length ? `<div class="scale">${look.scale.map(z => `<span><b style="font-size:${Math.min(28, Math.max(10, z * 0.55))}px;font-family:${esc((look.faces[0] || {}).stack || 'inherit')}">Aa</b><em>${z}</em></span>`).join('')}</div>` : '';
  const imgs = (look.images || []).slice(0, 12);
  const svgs = (look.svgs || []).slice(0, 8);
  const assets = imgs.length || svgs.length ? `<div><h2>Assets<em>${imgs.length} ${imgs.length === 1 ? 'image' : 'images'}, ${svgs.length} ${svgs.length === 1 ? 'icon or logo' : 'icons and logos'}</em></h2>
      ${svgs.length ? `<div class="svgs">${svgs.map((g, i) => `<button class="svg ${lightInk(g.html) ? 'dark' : ''}" data-act="copySvg" data-i="${i}" title="Copy SVG"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(g.html.includes('xmlns') ? g.html : g.html.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}" alt=""></button>`).join('')}</div>` : ''}
      ${imgs.length ? `<div class="imgs">${imgs.map(m => `<button class="img" data-act="openImg" data-url="${esc(m.src)}" title="${esc(m.alt || m.src)}\n${m.w}×${m.h}. Click to open"><img src="${esc(m.src)}" alt="" loading="lazy"><em>${m.w}×${m.h}</em></button>`).join('')}</div>` : ''}</div>` : '';
  const v = look.values || {};
  put($('#panel'), 'panel', tabs + `<div class="phd"><b class="trunc">${esc(look.title || look.host)}</b><span>${esc(look.host)}</span></div>
    <div class="body">
      <div><h2>Colours<em>${look.colours.length} found, click to copy</em></h2>${colours}</div>
      <div><h2>Type<em>${look.faces.length} ${look.faces.length === 1 ? 'face' : 'faces'}</em></h2>${faces || '<span class="fempty">No text on screen</span>'}${scale}</div>
      ${assets}
      <div><h2>Values</h2><div class="vals"><div>Radius<b>${esc(v.radius)}</b></div><div>Measure<b>${esc(v.measure)}</b></div><div>Leading<b>${esc(look.lineHeight || '—')}</b></div><div>Motion<b>${esc(v.motion)}</b></div><div>Mode<b>${look.dark ? 'Dark' : 'Light'}</b></div><div>Tokens<b>${Object.keys(look.vars || {}).length || '—'}</b></div></div></div>
    </div>
    <div class="act">${p.savedLook ? `<button class="btn pri" data-act="library">${icon('check', 15)}Saved to Library</button>` : `<button class="btn pri" data-act="save" data-kind="look">${icon('camera', 15)}Save this look</button>`}<button class="btn" data-act="copyCss">Copy as CSS</button></div>`);
}

// Light strokes and fills show on a dark tile, dark ones on a light tile.
function lightInk(html) {
  const cols = (html.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|white|currentColor/gi) || []).map(c => c.toLowerCase());
  if (!cols.length) return false;
  const lum = (c) => { if (c === 'white') return 1; if (c === 'currentcolor') return 0.9; if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  return cols.reduce((a, c) => a + lum(c), 0) / cols.length > 0.62;
}

// Answers come back as plain text with light markdown: bullets, bold, headings, code blocks.
function md(t) {
  const lines = esc(t).split('\n');
  let out = '', inCode = false, list = false;
  for (const ln of lines) {
    if (/^```/.test(ln)) { if (list) { out += '</ul>'; list = false; } out += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue; }
    if (inCode) { out += ln + '\n'; continue; }
    const b = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^\s*[-*•]\s+/.test(ln)) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + b.replace(/^\s*[-*•]\s+/, '') + '</li>'; continue; }
    if (list) { out += '</ul>'; list = false; }
    if (/^#{1,4}\s/.test(ln)) out += '<h4>' + b.replace(/^#+\s/, '') + '</h4>';
    else if (ln.trim()) out += '<p>' + b + '</p>';
  }
  if (list) out += '</ul>'; if (inCode) out += '</pre>';
  return out;
}

function renderAsk(tabs) {
  const p = S.page || {};
  const ai = S.ai || {};
  const web = p.url && /^(https?|file):/.test(p.url);
  const presets = [['summary', 'Summarise in 3 bullets'], ['design', 'Describe the design'], ['takeaways', 'Key takeaways'], ['csv', 'Tables to CSV'], ['faq', 'Generate an FAQ']];
  let body;
  if (!S.aiReady || ai.needKey) {
    body = `<div class="empty">${icon('sparkle', 22)}<b>Ask about any page</b><span>Summaries, design notes and answers about the page you’re on, written by Claude. Add your Anthropic API key once to start; it stays in your Mac’s Keychain.</span><button class="btn pri" data-act="run" data-action="open:aura://settings/#ai">Add your API key</button></div>`;
  } else if (!web) {
    body = `<div class="empty">${icon('sparkle', 22)}<b>Open a website to ask about it</b><span>Aura sends only that page’s text, and only when you ask.</span></div>`;
  } else {
    const turns = (ai.turns || []).map(t => `<div class="turn"><div class="qb">${esc(t.q)}</div><div class="ab ${t.busy && !t.text ? 'wait' : ''}">${t.text ? md(t.text) : (t.busy ? '<span class="dots"><i></i><i></i><i></i></span>' : '')}${t.error ? `<p class="err">${esc(t.error)}</p>` : ''}</div>${!t.busy && t.text ? `<div class="tacts"><button data-act="copy" data-text="${esc(t.text)}">${icon('copy', 13)}Copy</button></div>` : ''}</div>`).join('');
    body = `<div class="phd"><b class="trunc">${esc(p.title || '')}</b><span>${ai.words ? ai.words.toLocaleString() + ' words' + (ai.article ? ', article only' : '') : 'Reading…'}</span></div>
      <div class="body ask" id="askBody">
        ${(ai.turns || []).length ? '' : `<div class="chips">${presets.map(([k, t]) => `<button class="chipb" data-act="askPreset" data-v="${k}">${esc(t)}</button>`).join('')}</div>`}
        ${turns}
      </div>
      <div class="askin">
        <div class="aq"><textarea id="askIn" rows="1" placeholder="Ask about this page" spellcheck="true"></textarea>${ai.busy ? `<button class="key" data-act="askStop" title="Stop">${icon('stop', 14)}</button>` : `<button class="key send" data-act="askSend" title="Ask  ⏎">${icon('send', 15)}</button>`}</div>
        <div class="anote"><span>Only this page’s text is sent, when you ask.</span>${(ai.turns || []).length ? '<button data-act="askClear">New chat</button>' : ''}</div>
      </div>`;
  }
  const keep = document.activeElement && document.activeElement.id === 'askIn' ? $('#askIn').value : (document.querySelector('#askIn') || {}).value;
  const atBottom = (() => { const b = $('#askBody'); return !b || b.scrollHeight - b.scrollTop - b.clientHeight < 40; })();
  const focused = document.activeElement && document.activeElement.id === 'askIn';
  if (put($('#panel'), 'panel', tabs + body)) {
    const i = $('#askIn');
    if (i && keep) i.value = keep;
    if (i && focused) i.focus();
    const b = $('#askBody');
    if (b && atBottom) b.scrollTop = b.scrollHeight;
  }
}

// ---------- layout ----------
function placeFrames(f) {
  const fr = $('#frames');
  const boxes = f.panes ? f.panes : [{ id: S.page && S.page.id, x: f.x, y: f.y, width: f.width, height: f.height }];
  while (fr.children.length < boxes.length) { const d = document.createElement('div'); d.className = 'frame'; d.innerHTML = '<div class="still"></div>'; fr.appendChild(d); }
  while (fr.children.length > boxes.length) fr.lastChild.remove();
  boxes.forEach((b, i) => {
    const d = fr.children[i];
    Object.assign(d.style, { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px' });
    d.classList.toggle('calm', f.r === 0);
    d.classList.toggle('lit', !!f.panes && S.split && b.id === S.split.active);
    const st = (S.rt.stills || [])[i] || (S.rt.peek && i === 0 && S.rt.peekStill ? { src: S.rt.peekStill } : null);
    d.firstChild.style.backgroundImage = st ? `url(${st.src})` : 'none';
  });
}

function layout() {
  const f = S.frame;
  const ui = S.ui;
  const peeking = ui.sidebar === 'hidden' && S.rt.revealSide;
  const sideShown = ui.sidebar === 'full' || peeking;
  const side = $('#side');
  side.classList.toggle('off', !sideShown);
  side.classList.toggle('peek', peeking);
  $('#strip').classList.toggle('off', ui.sidebar !== 'icons');
  const bar = $('#bar');
  bar.classList.toggle('off', f.barH === 0);
  bar.style.left = (ui.sidebar === 'full' ? f.sideW : (isMac && !S.full ? 80 : (ui.sidebar === 'icons' ? 56 : 8))) + 'px';
  placeFrames(f);
  const pn = $('#panel');
  pn.classList.toggle('off', !ui.panel);
  pn.style.top = (f.barH || 10) + 'px';
  $('#shade').classList.toggle('on', !!S.rt.overlay && !!pop);
  const sb = document.querySelector('.save');
  if (sb) { const r = sb.getBoundingClientRect(); $('#saveMenu').style.left = Math.max(10, Math.min(window.innerWidth - 326, r.right - 316)) + 'px'; }
  const ek = document.querySelector('[data-act=exts]');
  if (ek) { const r = ek.getBoundingClientRect(); $('#exts').style.left = Math.max(10, Math.min(window.innerWidth - 350, r.right - 340)) + 'px'; }
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
  if (pop === 'exts') renderExts();
  if (S.rt.install && pop !== 'install') openPop('install');
  if (pop === 'install') { if (!S.rt.install) closePop(); else renderInstall(); }
}
window.aura.onFrame((f) => { if (!S) return; S.frame = f; layout(); });

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
  if (id === 'nmenu') {
    Object.assign(el.style, S.ui.sidebar === 'icons' ? { left: '60px', bottom: '12px', top: 'auto' } : { left: '12px', bottom: '54px', top: 'auto' });
  }
  if (id === 'exts') renderExts();
  if (id === 'install') renderInstall();
  await act('overlay', { on: true });
  el.classList.add('on');
  layout();
  if (id === 'cmd') { const i = $('#cmdIn'); i.focus(); i.select(); }
  if (id === 'spaceEd') { const i = $('#spName'); if (i) { i.focus(); i.select(); } }
  if (['saveMenu', 'smenu', 'nmenu', 'exts'].includes(id)) { const b = el.querySelector('button'); if (b) b.focus(); }
  renderBar();
}
// Popovers fade out rather than vanish.
function hidePop() {
  if (!pop) return;
  const el = document.getElementById(pop);
  el.classList.add('out');
  setTimeout(() => el.classList.remove('on', 'out'), 120);
}
function closePop(keepOverlay) {
  if (!pop) return;
  hidePop();
  pop = null;
  ed = null;
  $('#shade').classList.remove('on');
  if (!keepOverlay) act('overlay', { on: false });
  if (S && S.rt.install && !installing) act('storeCancel');
  renderSide(); renderBar();
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
    '<div class="hdr">View</div>' + r(!!S.split, 'cmd:split', 'Split view', 'Two tabs side by side', '⌘⇧\\') +
    '<div class="hdr">Chrome</div>' + r(ui.theme === 'dark', 'ui:theme:dark', 'Dark', '', '') + r(ui.theme === 'light', 'ui:theme:light', 'Light', '', '') + r(ui.theme === 'system', 'ui:theme:system', 'Match macOS', '', '');
}
function renderNMenu() {
  const r = (a, ic, b, k) => `<button class="mrow simple" data-act="run" data-action="${a}"><span class="ic">${icon(ic, 16)}</span><span><b>${b}</b></span><kbd>${k}</kbd></button>`;
  $('#nmenu').innerHTML = r('cmd:newtab', 'plus', 'New tab', '⌘T') + r('cmd:newfolder', 'folder', 'New folder', '') + r('newspace', 'star', 'New Space', '⌘⇧N') + '<hr>' +
    r('cmd:split', 'split', 'Split view', '⌘⇧\\') + '<hr>' +
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

// ---------- extensions ----------
function renderExts() {
  const list = S.exts || [];
  const here = list.filter(x => x.here);
  const rows = list.map(x => `<div class="erow ${x.here ? '' : 'off'}"><button class="emain" data-act="extOpen" data-path="${esc(x.path)}" title="${x.here ? (x.popup ? 'Open ' : '') + esc(x.name) : 'Off in this Space'}">
      <span class="eic">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : esc(x.name.slice(0, 1))}</span><span class="trunc"><b class="trunc">${esc(x.name)}</b><small>${!x.on ? 'Turned off' : x.spaces === 'all' ? 'All Spaces' : (S.spaces.filter(sp => (x.spaces || []).includes(sp.id)).map(sp => sp.name).join(', ') || 'No Spaces') + ' only'}</small></span></button>
      <button class="key" data-act="extMenu" data-path="${esc(x.path)}" title="Options">${icon('more', 15)}</button></div>`).join('');
  put($('#exts'), 'exts', `<div class="ehd"><b>Extensions</b><span>${list.length ? `${list.length} installed, ${here.length} on in this Space` : 'None yet'}</span></div>
    ${rows || `<p class="enone">Chrome extensions work in Aura. Find one in the Chrome Web Store, then press Add to Aura in the toolbar.</p>`}
    <hr><button class="mrow simple" data-act="run" data-action="open:https://chromewebstore.google.com/category/extensions"><span class="ic">${icon('globe', 15)}</span><span><b>Find more in the Chrome Web Store</b></span><kbd></kbd></button>
    <button class="mrow simple" data-act="run" data-action="open:aura://settings/#extensions"><span class="ic">${icon('gear', 15)}</span><span><b>Manage extensions</b></span><kbd></kbd></button>`);
}
let installSpaces = 'one', installing = false;
function renderInstall() {
  const x = S.rt.install;
  if (!x) return;
  const sp = S.spaces.find(s => s.id === S.active) || {};
  put($('#install'), 'install', `<div class="ihd"><span class="eic big">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : esc(x.name.slice(0, 1))}</span><div><h3>Add ${esc(x.name)} to Aura?</h3><p class="lead">Version ${esc(x.version)}${x.mv === 2 ? ', an older kind of extension that may not work fully' : ''}</p></div></div>
    ${x.description ? `<p class="idesc">${esc(x.description)}</p>` : ''}
    <div class="ilab">It will be able to</div>
    <div class="perms">${x.perms.map(p => `<div class="perm ${p.warn ? 'warn' : ''}"><i></i><span><b>${esc(p.t)}</b>${p.s ? `<small>${esc(p.s)}</small>` : ''}</span></div>`).join('')}</div>
    <div class="ilab">Install in</div>
    <div class="seg"><button class="${installSpaces === 'one' ? 'on' : ''}" data-act="instSpaces" data-v="one">${icon(sp.icon || 'star', 14)}${esc(sp.name)} only</button><button class="${installSpaces === 'all' ? 'on' : ''}" data-act="instSpaces" data-v="all">All Spaces</button></div>
    <p class="lead">${installSpaces === 'one' ? `Your other Spaces won’t see it. You can change this in Settings › Extensions.` : 'It runs in every Space, with each Space’s own logins.'}</p>
    <div class="ibtns"><button class="btn" data-act="storeCancel">Cancel</button><button class="btn pri" data-act="storeInstall">Add to ${installSpaces === 'one' ? esc(sp.name) : 'all Spaces'}</button></div>`);
}

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
    else if (r.kind === 'find') t = `<span class="t">${icon('search', 15)}</span>`;
    else if (r.kind === 'ask') t = `<span class="t acc">${icon('sparkle', 15)}</span>`;
    else t = `<span class="t">${icon(r.kind === 'search' ? 'search' : 'globe', 15)}</span>`;
    h += `<button class="res ${i === cmdSel ? 'on' : ''}" data-act="cmdPick" data-i="${i}">${t}<span class="trunc"><b class="trunc">${esc(r.title)}</b><small class="trunc">${esc(r.sub || '')}</small></span><kbd>${esc(r.key || (r.kind === 'tab' ? 'Switch' : i === cmdSel ? '⏎' : ''))}</kbd></button>`;
  });
  $('#cmdRes').innerHTML = h;
  $('#cmdFt').innerHTML = `<span><kbd>↑↓</kbd>Move</span><span><kbd>⏎</kbd>Open</span><span><kbd>⌘⏎</kbd>${cmdItems.some(r => r.kind === 'ask' && !r.preset) ? 'Ask Aura' : 'New tab'}</span><span class="r"><kbd>esc</kbd>Close</span>`;
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
  if (r.kind === 'find') { findOn = true; renderBar(); const i = $('#findIn'); i.value = r.text; act('findText', { text: r.text }); return; }
  if (r.kind === 'ask') return act('ask', r.preset ? { preset: r.preset } : { q: r.title });
  const inPlace = cmdMode === 'address' || (S.page && internalOf(S.page.url) === 'newtab');
  act('navigate', { url: r.url, newTab: newTab ? !inPlace : !inPlace });
}

function runAction(a) {
  if (!a) return;
  if (a === 'cmd') return openCmd('find');
  if (a === 'newspace') { closePop(true); return startSpaceEd(); }
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

function flashBtn(b) { const s = document.createElement('small'); s.className = 'copied'; s.textContent = 'Copied'; if (!b.querySelector('.copied')) { b.appendChild(s); setTimeout(() => s.remove(), 1200); } }

// ---------- events ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (pop && !e.target.closest('.pop') && !(b && ['saveMenu', 'smenu', 'nmenu', 'exts'].includes(b.dataset.act))) { closePop(); if (!b) return; }
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
    case 'panel': act('ui', { panel: b.dataset.v || 'inspect' }); break;
    case 'askPreset': act('ask', { preset: b.dataset.v }); break;
    case 'askSend': { const i = $('#askIn'); if (i && i.value.trim()) { act('ask', { q: i.value.trim() }); i.value = ''; } break; }
    case 'askStop': act('askStop'); break;
    case 'askClear': act('askClear'); break;
    case 'copySvg': { const g = (S.page.look.svgs || [])[Number(b.dataset.i)]; if (g) { act('copy', { text: g.html }); flashBtn(b); } break; }
    case 'openImg': act('newTab', { url: b.dataset.url }); break;
    case 'swapSplit': act('swapSplit'); break;
    case 'unsplit': act('unsplit'); break;
    case 'exts': openPop('exts'); break;
    case 'extOpen': closePop(); act('extOpen', { path: b.dataset.path }); break;
    case 'extMenu': act('extMenu', { path: b.dataset.path }); break;
    case 'storeFetch': { b.disabled = true; b.innerHTML = '<span class="spin"></span>Getting it…'; act('storeFetch').then(r => { if (r && r.error) { b.textContent = r.error.slice(0, 40); setTimeout(renderBar, 3000); } }); break; }
    case 'instSpaces': installSpaces = b.dataset.v; renderInstall(); break;
    case 'storeInstall': installing = true; act('storeInstall', { spaces: installSpaces === 'all' ? 'all' : 'one' }).then(() => { closePop(); installing = false; }); break;
    case 'storeCancel': closePop(); break;
    case 'save': closePop(); act('save', { kind: b.dataset.kind }); break;
    case 'saveMenu': openPop('saveMenu'); break;
    case 'smenu': openPop('smenu'); break;
    case 'nmenu': openPop('nmenu'); break;
    case 'run': runAction(b.dataset.action); break;
    case 'copy': act('copy', { text: b.dataset.text }); flashBtn(b); break;
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
    else if (e.key === 'Enter') {
      e.preventDefault();
      const askI = cmdItems.findIndex(r => r.kind === 'ask' && !r.preset);
      if ((e.metaKey || e.ctrlKey) && askI >= 0) pickCmd(askI); else pickCmd(cmdSel, e.metaKey || e.ctrlKey);
    }
    else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
    return;
  }
  if (t.id === 'askIn') {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (t.value.trim() && !(S.ai && S.ai.busy)) { act('ask', { q: t.value.trim() }); t.value = ''; } }
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
  else if (c === 'extensions') openPop('exts');
});
// Favicons that fail to load fall back to the globe.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.closest('.fav')) { const f = e.target.closest('.fav'); f.innerHTML = icon('globe', 15); }
}, true);
window.aura.onState(render);
