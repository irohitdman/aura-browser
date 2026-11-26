// Daily: the new tab. Today's picks of typefaces, sites, identities and palettes.
/* global DSRC, DITEMS, DOTD, DROWS, DTABS, DCONNECT, DLIVE, GLYPHS, A, esc, icon, $ */
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
  if (t) { e.preventDefault(); tab = t.dataset.tab; localStorage.setItem('daily.tab', tab); render(); document.querySelector('.dyin').scrollTop = 0; return; }
  if (e.target.closest('#srcBtn')) { showSources = !showSources; render(); return; }
  const s = e.target.closest('[data-src]');
  if (s) { const k = s.dataset.src; off.has(k) ? off.delete(k) : off.add(k); localStorage.setItem('daily.off', JSON.stringify([...off])); render(); return; }
  if (showSources && !e.target.closest('.dpop')) { showSources = false; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'q' && e.key === 'Enter' && e.target.value.trim()) {
    A.call('open', { url: e.target.value.trim(), newTab: e.metaKey });
  }
  if (e.key === 'Escape' && showSources) { showSources = false; render(); }
});
A.on(w => { if (w === 'theme') setTimeout(render, 50); });
render();
window.addEventListener('focus', () => { const q = $('#q'); if (q && !q.value) q.focus(); });
