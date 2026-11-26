// Daily: the new tab. Today's picks of typefaces, sites, identities and palettes.
/* global DSRC, DITEMS, DOTD, DROWS, DTABS, DCONNECT, DLIVE, GLYPHS, A, esc, icon, $ */
let LIVE = null, refreshing = false, fontsAsked = false;
const SITE_BY_TITLE = {};
DITEMS.forEach(it => { if (it.cat === 'sites') SITE_BY_TITLE[it.title] = it; });

function linkFor(it) {
  if (it.cat === 'type') return 'https://fonts.google.com/specimen/' + it.title.replace(/ /g, '+');
  if (it.cat === 'sites') return 'https://' + it.host;
  if (it.cat === 'brand') return 'https://www.underconsideration.com/brandnew/';
  if (it.cat === 'dribbble') return 'https://dribbble.com/shots/popular';
  if (it.cat === 'pal') { const s = SITE_BY_TITLE[it.title]; return s ? 'https://' + s.host : 'https://www.awwwards.com/websites/sites_of_the_day/'; }
  return 'https://' + (it.host || 'awwwards.com');
}

function mark(key) {
  const d = DSRC[key] || {};
  if (d.icon && GLYPHS[d.icon]) {
    const g = GLYPHS[d.icon];
    const light = document.documentElement.classList.contains('lightmode');
    const fill = (d.icon === 'x' || g.hex === '#000000') ? (light ? '#111111' : '#F2F2F2') : g.hex;
    return `<span class="fav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${g.path}" fill="${fill}"/></svg></span>`;
  }
  if (d.aura) return `<span class="fav" style="color:var(--accent)">${icon('drop', 13)}</span>`;
  return `<span class="fav"><span class="mono">${esc(d.mono || '')}</span></span>`;
}

function contrastOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#141414' : '#F2F2F2';
}

function thumb(it, h) {
  const t = it.th || {};
  const H = Math.round(h);
  const st = `height:${H}px;background:${t.bg || 'transparent'};color:${t.fg || '#F2F2F2'}`;
  const face = `font-family:${t.ff || 'Geist'};font-weight:${t.fw || 500};font-style:${t.fst || 'normal'};letter-spacing:${t.ls || '0'}`;
  const k = H / 210;
  if (t.kind === 'font') {
    return `<span class="th" style="${st}"><span class="tf"><span class="tfl"><em>${esc(t.tl)}</em><em>${esc(t.tr)}</em></span>
      <span class="tfw" style="${face};font-size:${Math.round((t.fs || 48) * Math.max(.75, k))}px">${esc(t.word)}</span>
      <span class="tfl"><em>${esc(t.bl)}</em><em>${esc(t.br)}</em></span></span></span>`;
  }
  if (t.kind === 'site') {
    return `<span class="th" style="${st}"><span class="tsi"><span class="tsn"><i></i><i></i><i></i><b style="background:${t.acc}"></b></span>
      ${t.shape ? `<span class="tss ${t.shape}" style="background:${t.acc}"></span>` : ''}
      <span class="tsw" style="${face};font-size:${Math.round((t.fs || 28) * Math.max(.8, k))}px">${esc(t.word)}</span>
      <span class="tsl"><i></i><i></i></span></span></span>`;
  }
  if (t.kind === 'pal' || it.cat === 'pal') {
    const sw = (it.pal || []).map(p => `<i style="background:${p[0]};color:${contrastOn(p[0])}"><em>${p[0].slice(1)}</em></i>`).join('');
    return `<span class="th" style="height:${H}px"><span class="tpl">${sw}</span></span>`;
  }
  return `<span class="th" style="${st}"><span class="tar a-${t.art || 'none'}"><span class="tas" style="background:${t.acc}"></span>
    <span class="taw" style="${face};font-size:${Math.round((t.fs || 28) * Math.max(.8, k))}px">${esc(t.word)}</span></span></span>`;
}

function card(it, h) {
  return `<a class="dcard" href="${esc(linkFor(it))}" data-url="${esc(linkFor(it))}">${thumb(it, h || it.h || 190)}
    <span class="dm"><b class="trunc">${esc(it.title)}</b><span class="dsrc">${mark(it.src)}<span class="trunc">${esc(it.by)}</span></span></span></a>`;
}

const find = (id) => DITEMS.find(x => x.id === id);
let tab = localStorage.getItem('daily.tab') || 'today';
let showSources = false;
const off = new Set(JSON.parse(localStorage.getItem('daily.off') || '[]'));
const visible = (it) => !off.has(it.src);

function fitType() { document.querySelectorAll(".tfw").forEach(e => { let s = parseFloat(e.style.fontSize) || 40; while (s > 16 && (e.scrollWidth > e.clientWidth + 1 || e.parentElement.scrollHeight > e.parentElement.clientHeight + 1)) { s -= 2; e.style.fontSize = s + "px"; } }); }
function draw() { if (LIVE && LIVE.items && LIVE.items.length) renderLive(); else render(); requestAnimationFrame(fitType); if (document.fonts) { document.fonts.ready.then(fitType); document.fonts.onloadingdone = fitType; } }

function render() {
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const items = DITEMS.filter(visible);
  const counts = { today: items.length, type: 0, sites: 0, brand: 0, dribbble: 0, pal: 0 };
  items.forEach(i => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
  const tabs = DTABS.map(([id, name, m]) => {
    const n = id === 'x' || id === 'ig' ? '' : (counts[id] || 0);
    return `<button class="dtab ${tab === id ? 'on' : ''}" data-tab="${id}">${m ? mark(m === 'dribbble' ? 'dribbble' : m) : ''}${esc(name)}${n !== '' ? `<em>${n}</em>` : ''}</button>`;
  }).join('');

  let body = '';
  if (tab === 'today') {
    const otd = DOTD.map(([id]) => find(id)).filter(it => it && visible(it));
    body += `<section class="dsec"><div class="dsh"><h2>Of the day</h2><span>A typeface, a site, a palette and an identity</span></div>
      <div class="drow4">${otd.map(it => card(it, 210)).join('')}</div></section>`;
    for (const [name, cat, ids] of DROWS) {
      const list = ids.map(find).filter(it => it && visible(it));
      if (!list.length) continue;
      body += `<section class="dsec"><div class="dsh"><h2>${esc(name)}</h2><a data-tab="${cat}">See all ${counts[cat] || list.length}</a></div>
        <div class="drow4">${list.map(it => card(it, 150)).join('')}</div></section>`;
    }
  } else if (DCONNECT[tab]) {
    const c = DCONNECT[tab];
    body += `<div class="dcon">${mark(c.key)}<b>${esc(c.title)}</b><span>${esc(c.body)}</span><span>Connecting accounts comes in a later version of Aura.</span></div>`;
  } else {
    const list = items.filter(i => i.cat === tab);
    body += `<div class="dwall">${list.map(it => card(it, it.h)).join('')}</div>`;
  }

  const srcs = ['googlefonts', 'awwwards', 'brandnew', 'dribbble', 'aura'];
  $('#dy').innerHTML = `
    <div class="dyh">
      <div class="dyt"><h1>${esc(dateLine)}</h1><p class="dysub">${items.length} picks from Google Fonts, Awwwards, Brand New and Dribbble. A snapshot fetched 26 Nov at 11:20.</p></div>
      <label class="dyq">${icon('search', 17)}<input id="q" placeholder="Search, enter an address, or describe a save" autocomplete="off" spellcheck="false" autofocus><kbd>⏎</kbd></label>
    </div>
    <nav class="dyn" aria-label="Daily sections">${tabs}<span class="dyupd">${esc(DLIVE.stamp)}</span>
      <button class="dsrcb ${showSources ? 'on' : ''}" id="srcBtn">${icon('sliders', 14)}Sources</button></nav>
    ${body}
    <p class="dyf">Every pick links to where it came from; Aura keeps only a preview. Daily refreshes each morning in a later version; for now it shows the 26 November snapshot.</p>
    ${showSources ? `<div class="dpop" role="dialog" aria-label="Sources"><div class="hdr"><b>Sources</b><span>${srcs.filter(s => !off.has(s)).length} on</span></div>
      ${srcs.map(s => `<button class="dsr ${off.has(s) ? '' : 'on'}" data-src="${s}">${mark(s)}<span><b>${esc(DSRC[s].name)}</b><small>${esc(DSRC[s].what)}</small></span><span class="tog"><i></i></span></button>`).join('')}
      <p>Turn a source off and its picks leave Daily.</p></div>` : ''}`;
  const q = $('#q');
  if (q && document.hasFocus()) q.focus();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { e.preventDefault(); tab = t.dataset.tab; localStorage.setItem('daily.tab', tab); draw(); document.querySelector('.dyin').scrollTo({ top: 0 }); return; }
  if (e.target.closest('#srcBtn')) { showSources = !showSources; draw(); return; }
  if (e.target.closest('#refresh')) { refreshing = true; draw(); A.call('daily:refresh').then(r => { refreshing = false; LIVE = r; draw(); }); return; }
  const s = e.target.closest('[data-src]');
  if (s) { const k = s.dataset.src; off.has(k) ? off.delete(k) : off.add(k); localStorage.setItem('daily.off', JSON.stringify([...off])); draw(); return; }
  if (showSources && !e.target.closest('.dpop')) { showSources = false; draw(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'q' && e.key === 'Enter' && e.target.value.trim()) {
    A.call('open', { url: e.target.value.trim(), newTab: e.metaKey });
  }
  if (e.key === 'Escape' && showSources) { showSources = false; draw(); }
});
A.on(w => { if (w === 'theme') setTimeout(draw, 50); if (w === 'daily') loadLive(); });
draw();
loadLive();
window.addEventListener('focus', () => { const q = $('#q'); if (q && !q.value) q.focus(); });


// ---------- Daily, live ----------
// Fetched each morning from open feeds: websites (Awwwards, FWA, One Page Love), new typefaces (Google Fonts),
// interactions (Codrops, CodePen), and palettes read from today's site previews.
async function loadLive() {
  const r = await A.call('daily:get');
  if (r && r.items && r.items.length) { LIVE = r; draw(); }
}
const LTABS = [['today', 'Today'], ['sites', 'Websites'], ['type', 'Typefaces'], ['motion', 'Interactions'], ['pal', 'Palettes']];
const TONES = [['#E8E2D6', '#141414'], ['#0E1116', '#E8E2D6'], ['#D7E3F4', '#0E1A2B'], ['#1D1A17', '#F0B36A'], ['#F2F2F2', '#111111'], ['#14201A', '#C9F0D6'], ['#F4D9D0', '#2A1310'], ['#101010', '#F2F2F2']];

function liveMark(src) {
  const d = (LIVE.sources || {})[src] || {};
  const g = src === 'googlefonts' ? 'googlefonts' : src === 'codepen' ? 'codepen' : null;
  if (g && GLYPHS[g]) {
    const light = document.documentElement.classList.contains('lightmode');
    const fill = GLYPHS[g].hex === '#000000' ? (light ? '#111' : '#F2F2F2') : GLYPHS[g].hex;
    return `<span class="fav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPHS[g].path}" fill="${fill}"/></svg></span>`;
  }
  const mono = { awwwards: 'Aw', fwa: 'FWA', onepagelove: '1P', codrops: 'Cd', codepen: 'CP', googlefonts: 'GF' }[src] || (d.name || '?').slice(0, 2);
  return `<span class="fav"><span class="mono">${esc(mono)}</span></span>`;
}
function when(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0 && d.getDate() === now.getDate()) return 'today';
  if (days <= 1) return 'yesterday';
  return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' });
}
function askFonts(list) {
  if (fontsAsked || !list.length) return;
  fontsAsked = true;
  // One request for every new family; each card is set in its own typeface.
  const fam = list.map(it => 'family=' + encodeURIComponent(it.title).replace(/%20/g, '+') + (it.weights && it.weights.length ? ':wght@' + [...new Set([it.weights[0], it.weights[it.weights.length - 1]])].join(';') : '')).join('&');
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap&text=' + encodeURIComponent('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&!?.,·–') ;
  document.head.appendChild(l);
  // Families with spaces or many styles sometimes fail the text subset; ask once more without it.
  const l2 = document.createElement('link'); l2.rel = 'stylesheet'; l2.href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap';
  document.head.appendChild(l2);
}
function liveCard(it, h) {
  const src = (LIVE.sources || {})[it.src] || {};
  let th;
  if (it.cat === 'type') {
    const [bg, fg] = TONES[Math.abs(hash(it.title)) % TONES.length];
    const w = it.weights && it.weights.length ? it.weights[it.weights.length - 1] >= 700 ? 700 : it.weights[it.weights.length - 1] : 400;
    const fs = Math.max(30, Math.min(64, Math.round(h * 0.3 * (10 / Math.max(6, it.title.length)))));
    th = `<span class="th" style="height:${h}px;background:${bg};color:${fg}"><span class="tf"><span class="tfl"><em>${esc(cap(it.category || 'Typeface'))}</em><em>${it.date && Date.now() - it.date < 30 * 86400000 ? 'New' : esc(when(it.date))}</em></span>
      <span class="tfw" style="font-family:'${esc(it.title)}',${/serif/i.test(it.category || '') && !/sans/i.test(it.category || '') ? 'serif' : 'sans-serif'};font-weight:${w};font-size:${fs}px">${esc(it.title)}</span>
      <span class="tfl"><em style="font-family:'${esc(it.title)}';opacity:.85;font-size:13px">Aa Gg Rr 123</em><em>${it.styles} ${it.styles === 1 ? 'style' : 'styles'}</em></span></span></span>`;
  } else if (it.cat === 'pal') {
    th = `<span class="th" style="height:${h}px"><span class="tpl">${it.pal.map(c => `<i style="background:${c};color:${contrastOn(c)}"><em>${c.slice(1)}</em></i>`).join('')}</span></span>`;
  } else {
    th = `<span class="th shot" style="height:${h}px"><img src="aura://newtab/daily-img/${esc(it.file)}" alt="" loading="lazy" decoding="async">${it.cat === 'motion' ? `<span class="dsv">${icon('drop', 12)}Interaction</span>` : ''}${it.pal ? `<span class="pdots">${it.pal.slice(0, 5).map(c => `<i style="background:${c}"></i>`).join('')}</span>` : ''}</span>`;
  }
  const by = it.cat === 'type' ? (it.by ? 'By ' + it.by : src.name) : it.cat === 'pal' ? 'Read from ' + it.site : (src.what || src.name) + (it.date ? ', ' + when(it.date) : '');
  return `<a class="dcard" href="${esc(it.url)}" data-url="${esc(it.url)}">${th}<span class="dm"><b class="trunc">${esc(it.title)}</b><span class="dsrc">${liveMark(it.src)}<span class="trunc">${esc(by)}</span></span></span></a>`;
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
function cap(s) { return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '); }

function liveItems() {
  const items = LIVE.items.filter(i => !off.has(i.src));
  const pals = items.filter(i => i.cat === 'sites' && i.pal).map(i => ({ id: 'pal-' + i.id, cat: 'pal', src: i.src, title: i.title, url: i.url, pal: i.pal, site: (LIVE.sources[i.src] || {}).name || '' }));
  return items.concat(pals);
}

function renderLive() {
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const items = liveItems();
  const by = (c) => items.filter(i => i.cat === c);
  const counts = { today: items.length, sites: by('sites').length, type: by('type').length, motion: by('motion').length, pal: by('pal').length };
  if (!LTABS.some(t => t[0] === tab)) tab = 'today';
  askFonts(by('type'));
  const tabs = LTABS.map(([id, name]) => `<button class="dtab ${tab === id ? 'on' : ''}" data-tab="${id}">${esc(name)}<em>${counts[id] || 0}</em></button>`).join('');
  let body = '';
  // Mix sources so one feed doesn't fill a row.
  const mix = (list) => { const g = {}; list.forEach(i => (g[i.src] = g[i.src] || []).push(i)); const out = []; let k = 0; while (out.length < list.length) { for (const s in g) if (g[s][k]) out.push(g[s][k]); k++; } return out; };
  if (tab === 'today') {
    const otd = [mix(by('sites'))[0], by('type')[0], by('pal')[0], mix(by('motion'))[0]].filter(Boolean);
    body += `<section class="dsec"><div class="dsh"><h2>Of the day</h2><span>A site, a typeface, a palette and an interaction</span></div><div class="drow4">${otd.map(it => liveCard(it, 220)).join('')}</div></section>`;
    for (const [name, cat, n, h] of [['Websites', 'sites', 8, 170], ['Typefaces', 'type', 8, 150], ['Interactions', 'motion', 4, 170], ['Palettes', 'pal', 4, 120]]) {
      const list = mix(by(cat)).slice(cat === 'type' || cat === 'pal' ? 1 : 1, n + 1);
      if (!list.length) continue;
      body += `<section class="dsec"><div class="dsh"><h2>${name}</h2><a data-tab="${cat}">See all ${counts[cat]}</a></div><div class="drow4">${list.map(it => liveCard(it, h)).join('')}</div></section>`;
    }
  } else {
    const list = mix(by(tab));
    const h = (it) => it.cat === 'type' ? 170 + (Math.abs(hash(it.title)) % 3) * 30 : it.cat === 'pal' ? 140 : Math.round(Math.min(1.2, Math.max(0.5, it.ratio || 0.62)) * 290);
    body += `<div class="dwall">${list.map(it => liveCard(it, h(it))).join('')}</div>`;
  }
  const srcKeys = Object.keys(LIVE.sources || {});
  const at = new Date(LIVE.at);
  $('#dy').innerHTML = `
    <div class="dyh">
      <div class="dyt"><h1>${esc(dateLine)}</h1><p class="dysub">${items.length} picks from ${srcKeys.filter(k => !off.has(k)).map(k => LIVE.sources[k].name).join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p></div>
      <label class="dyq">${icon('search', 17)}<input id="q" placeholder="Search, enter an address, or describe a save" autocomplete="off" spellcheck="false" autofocus><kbd>⏎</kbd></label>
    </div>
    <nav class="dyn" aria-label="Daily sections">${tabs}<span class="dyupd">${refreshing ? 'Refreshing…' : 'Updated ' + (at.toDateString() === now.toDateString() ? at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : when(LIVE.at))}</span>
      <button class="dsrcb" id="refresh" title="Fetch again">${icon('reload', 14)}</button>
      <button class="dsrcb ${showSources ? 'on' : ''}" id="srcBtn">${icon('sliders', 14)}Sources</button></nav>
    ${body}
    <p class="dyf">Every pick links to where it came from. Aura keeps only a small preview on this Mac, and fetches new picks each morning.</p>
    ${showSources ? `<div class="dpop" role="dialog" aria-label="Sources"><div class="hdr"><b>Sources</b><span>${srcKeys.filter(s => !off.has(s)).length} on</span></div>
      ${srcKeys.map(s => `<button class="dsr ${off.has(s) ? '' : 'on'}" data-src="${s}">${liveMark(s)}<span><b>${esc(LIVE.sources[s].name)}</b><small>${esc(LIVE.sources[s].what)}</small></span><span class="tog"><i></i></span></button>`).join('')}
      <p>Turn a source off and its picks leave Daily. Palettes are read from the websites’ previews.</p></div>` : ''}`;
  const q = $('#q');
  if (q && document.hasFocus()) q.focus();
}
