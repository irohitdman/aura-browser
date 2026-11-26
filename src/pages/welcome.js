// Onboarding: bookmarks in, a few questions, a taste palette out.
/* global A, esc, icon, $, isMac */
const W = {
  step: 'intro', sources: [], src: null, loaded: null, importIt: true, spaceId: null, spaces: [],
  howMany: 20, picked: new Set(), results: [], progress: { n: 0, of: 0 }, visiting: false,
  i: 0, answers: {}, words: new Set(), result: null, saved: null
};
const WHY = [['type', 'Type'], ['colour', 'Colour'], ['layout', 'Layout'], ['imagery', 'Imagery'], ['motion', 'Motion']];
const WORDS = ['Calm', 'Bold', 'Playful', 'Editorial', 'Technical', 'Warm', 'Minimal', 'Maximal', 'Crafted', 'Raw', 'Luxurious', 'Friendly'];
const ICONS = { chrome: 'globe', arc: 'globe', brave: 'globe', edge: 'globe', vivaldi: 'globe', opera: 'globe', chromium: 'globe', dia: 'globe', file: 'folder' };

async function start() {
  const s = await A.call('settings:get');
  W.spaces = s.spaces;
  W.spaceId = (s.spaces.find(x => x.id === 'personal') || s.spaces[0]).id;
  draw();
}

const dots = (n, cur) => `<div class="steps">${['Bookmarks', 'Sites', 'Questions', 'Taste'].map((t, i) => `<span class="${i < n ? 'done' : i === n ? 'on' : ''}">${t}</span>`).join('')}</div>`;

function draw() {
  let h = '';
  if (W.step === 'intro') {
    h = `<div class="intro">
      <div class="mk">${mark(72)}</div>
      <h1>Aura learns what you like.</h1>
      <p>Bring your bookmarks from the browser you use now. Aura looks at a handful of the sites you keep, asks what you like about each, and turns your answers into a taste palette: colours, typefaces and the feel you keep coming back to. It stays in your Library.</p>
      <div class="btns"><button class="btn pri big" data-go="source">Bring my bookmarks</button><button class="btn big ghost" data-go="skip">Skip for now</button></div>
      <small>Everything happens on this Mac. Aura opens the sites you choose in a private window that keeps nothing.</small>
    </div>`;
  }
  if (W.step === 'source') {
    h = `${dots(0)}<h2>Where are your bookmarks?</h2><p class="lead">Aura found these on this Mac. Pick one to bring over.</p>
      <div class="srcs">${W.sources.map((s, i) => `<button class="src ${W.src === s.id ? 'on' : ''}" data-src="${i}"><span class="si">${icon(ICONS[s.browser] || 'globe', 18)}</span><span><b>${esc(s.name)}</b><small>${s.count ? s.count.toLocaleString() + ' bookmarks' : esc(s.hint || 'Choose an exported .html file')}</small></span>${icon('chevr', 14)}</button>`).join('')}</div>
      ${W.sources.length <= 1 ? `<p class="lead">No other browsers found. Export your bookmarks as an HTML file from your browser and choose it above.</p>` : ''}
      <div class="foot"><button class="btn ghost" data-go="intro">Back</button></div>`;
  }
  if (W.step === 'sites') {
    const c = W.loaded.candidates;
    h = `${dots(1)}<h2>${W.loaded.count.toLocaleString()} bookmarks${W.loaded.folders ? ` in ${W.loaded.folders} folder${W.loaded.folders === 1 ? "" : "s"}` : ''}</h2>
      <label class="imp"><button class="tog ${W.importIt ? 'on' : ''}" data-act="importIt" role="switch" aria-checked="${W.importIt}"><i></i></button><span><b>Add them to Aura</b><small>As sleeping folders in the sidebar, so nothing loads until you open it.</small></span>
        <select id="spaceSel">${W.spaces.map(sp => `<option value="${sp.id}" ${sp.id === W.spaceId ? 'selected' : ''}>${esc(sp.name)}</option>`).join('')}</select></label>
      <div class="sh"><div><h3>Sites to learn from</h3><p class="lead">Aura skips tools and big platforms. Choose the ones that say something about your taste.</p></div>
        <div class="seg">${[10, 20, 30].map(n => `<button class="${W.howMany === n ? 'on' : ''}" data-many="${n}">${n}</button>`).join('')}</div></div>
      <div class="cands">${c.slice(0, 80).map(x => `<button class="cand ${W.picked.has(x.host) ? 'on' : ''}" data-host="${esc(x.host)}"><span class="av" style="background:hsl(${[...x.host].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 30% 30%)">${esc(x.host[0].toUpperCase())}</span><span class="trunc"><b class="trunc">${esc(x.host)}</b><small class="trunc">${esc(x.folder || x.title || '')}</small></span><i>${icon('check', 12)}</i></button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-go="source">Back</button><span class="cnt">${W.picked.size} chosen</span><button class="btn pri" data-go="visit" ${W.picked.size < 3 ? 'disabled' : ''}>Look at ${W.picked.size} sites</button></div>`;
  }
  if (W.step === 'ask') {
    const ready = W.results.filter(r => !r.error);
    const r = ready[W.i];
    const pct = W.progress.of ? Math.round(W.progress.n / W.progress.of * 100) : 0;
    if (!r) {
      h = `${dots(2)}<div class="wait"><span class="spin"></span><h2>${W.visiting ? 'Looking at your sites…' : 'That’s every site'}</h2><p class="lead">${W.visiting ? `${W.progress.n} of ${W.progress.of} so far. The first question shows as soon as one is ready.` : ''}</p>
        <div class="bar"><i style="width:${pct}%"></i></div>${!W.visiting ? `<button class="btn pri" data-go="words">Continue</button>` : ''}</div>`;
    } else {
      const a = W.answers[r.host] || {};
      const look = r.look || {};
      h = `${dots(2)}<div class="quiz">
        <div class="shot"><img src="${r.thumb}" alt=""><span class="host">${esc(r.host)}</span></div>
        <div class="qa">
          <span class="num">${W.i + 1} of ${Math.max(ready.length, W.i + 1)}${W.visiting ? ` · still looking at ${W.progress.of - W.progress.n}` : ''}</span>
          <h2 class="trunc2">${esc(r.title || r.host)}</h2>
          <div class="mini">${(look.colours || []).map(c => `<i style="background:${esc(c.hex)}" title="${esc(c.hex)} ${esc(c.role)}"></i>`).join('')}<span class="trunc">${esc(((look.faces || [])[0] || {}).family || '')}</span></div>
          <h3>How do you feel about it?</h3>
          <div class="love">${[[2, 'Love it', '1'], [1, 'It’s good', '2'], [0, 'Not for me', '3']].map(([v, t, k]) => `<button class="${a.love === v ? 'on' : ''}" data-love="${v}">${t}<kbd>${k}</kbd></button>`).join('')}</div>
          <h3 class="${a.love > 0 ? '' : 'dim'}">What pulls you in?</h3>
          <div class="why ${a.love > 0 ? '' : 'dim'}">${WHY.map(([k, t]) => `<button class="${(a.why || []).includes(k) ? 'on' : ''}" data-why="${k}" ${a.love > 0 ? '' : 'disabled'}>${t}</button>`).join('')}</div>
          <div class="foot"><button class="btn ghost" data-act="prev" ${W.i ? '' : 'disabled'}>Back</button><button class="btn ghost" data-act="skipSite">Skip this one</button><button class="btn pri" data-act="next" ${a.love === undefined ? 'disabled' : ''}>Next<kbd>⏎</kbd></button></div>
        </div></div>
        ${W.visiting ? `<div class="bar thin"><i style="width:${pct}%"></i></div>` : ""}`;
    }
  }
  if (W.step === 'words') {
    h = `${dots(2)}<h2>Three words for what you like</h2><p class="lead">Pick up to three. They go on your palette and help Aura describe it.</p>
      <div class="words">${WORDS.map(w => `<button class="${W.words.has(w) ? 'on' : ''}" data-word="${w}">${w}</button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-act="backAsk">Back</button><button class="btn pri" data-go="result">Make my palette</button></div>`;
  }
  if (W.step === 'result') {
    const r = W.result;
    if (!r || !r.palette.length) {
      h = `${dots(3)}<h2>Not enough to go on yet</h2><p class="lead">Mark a few more sites as Love it or It’s good, and Aura can find the thread between them.</p><div class="foot"><button class="btn pri" data-act="backAsk">Back to the questions</button></div>`;
    } else {
      h = `${dots(3)}<div class="taste" id="taste">
        <div class="th"><div><span class="eyebrow">Your taste</span><h2>${r.words.length ? esc(r.words.join(', ')) : 'From ' + r.likedCount + ' sites you like'}</h2></div>${mark(40)}</div>
        <div class="pal">${r.palette.map(c => `<button class="sw" data-copy="${esc(c.hex)}" style="background:${esc(c.hex)};color:${on(c.hex)}"><b>${esc(c.hex.slice(1))}</b><small>${esc((c.from && c.from[0]) || c.role)}</small></button>`).join('')}</div>
        <div class="tgrid">
          <div class="cell type"><span class="eyebrow">Typefaces</span>${r.type.length ? r.type.map(f => `<div class="tf"><span class="spec" style="font-family:${esc(f.stack)}">${esc(f.family)}</span><small>${esc(f.roles.join(', ').toLowerCase())} · ${esc(f.from.join(', '))}</small></div>`).join('') : '<small>Mostly system fonts</small>'}</div>
          <div class="cell"><span class="eyebrow">Feel</span><div class="kv"><span>Lean</span><b>${esc(r.lean)}</b></div><div class="kv"><span>Corners</span><b>${esc(r.radius)}</b></div><div class="kv"><span>Motion</span><b>${esc(r.motion)}</b></div>${r.drawn.length ? `<div class="kv"><span>Drawn to</span><b>${esc(r.drawn.slice(0, 3).join(', '))}</b></div>` : ''}</div>
          <div class="cell"><span class="eyebrow">Sites you love</span>${r.loved.slice(0, 6).map(l => `<div class="kv"><b class="trunc">${esc(l.host)}</b></div>`).join('') || '<small>None marked Love it</small>'}</div>
        </div>
      </div>
      <div class="foot center">${W.saved ? `<span class="ok">${icon('check', 14)}Saved to your Library</span><button class="btn" data-act="openLib">Open in Library</button><button class="btn pri" data-act="done">Start browsing</button>` : `<span class="spin"></span>`}</div>`;
    }
  }
  $('#wl').innerHTML = h;
  if (W.step === 'result' && W.result && W.result.type.length) loadFonts(W.result.type);
}

function mark(size) {
  let d = '';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const cx = 2 + x * 2, cy = 2 + y * 2, dist = Math.hypot(cx - 10, cy - 10);
    if (dist > 8.4) continue;
    const lit = Math.max(0.12, 1 - Math.hypot(cx - 6, cy - 6) / 13);
    d += `<circle cx="${cx}" cy="${cy}" r="${(0.35 + lit * 0.5).toFixed(2)}" fill="var(--accent)" opacity="${lit.toFixed(2)}"/>`;
  }
  return `<svg viewBox="0 0 22 22" width="${size}" height="${size}" aria-hidden="true">${d}<circle cx="18.6" cy="3.4" r="1.6" fill="var(--ink)"/></svg>`;
}
function on(hex) { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#141414' : '#F2F2F2'; }
let fontsOnce = false;
function loadFonts(type) {
  if (fontsOnce) return; fontsOnce = true;
  const fam = type.map(f => 'family=' + encodeURIComponent(f.family).replace(/%20/g, '+')).join('&');
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap';
  document.head.appendChild(l);
}

async function go(step) {
  if (step === 'skip') { await A.call('onboarded'); return A.call('open', { url: 'aura://newtab/' }); }
  if (step === 'source') { W.sources = await A.call('taste:sources') || []; }
  if (step === 'visit') {
    if (W.importIt) await A.call('taste:import', { spaceId: W.spaceId, name: W.srcName });
    W.step = 'ask'; W.i = 0; W.results = []; W.visiting = true; W.progress = { n: 0, of: W.picked.size };
    draw();
    const sites = W.loaded.candidates.filter(c => W.picked.has(c.host));
    A.call('taste:visit', { sites }).then(() => { W.visiting = false; draw(); });
    return;
  }
  if (step === 'result') {
    W.step = 'result'; W.saved = null;
    W.result = await A.call('taste:compose', { answers: W.answers, words: [...W.words] });
    draw();
    if (W.result && W.result.palette.length) {
      await new Promise(r => setTimeout(r, 700)); // let the typefaces arrive before the picture is taken
      const el = $('#taste'); const b = el.getBoundingClientRect();
      W.saved = await A.call('taste:save', { result: W.result, rect: { x: b.left - 12, y: b.top - 12, width: b.width + 24, height: b.height + 24 } });
      draw();
    }
    return;
  }
  W.step = step;
  draw();
}

function pickDefault() {
  W.picked = new Set(W.loaded.candidates.slice(0, W.howMany).map(c => c.host));
}
function answer(patch) {
  const r = W.results.filter(x => !x.error)[W.i];
  if (!r) return;
  W.answers[r.host] = Object.assign(W.answers[r.host] || {}, patch);
  if (patch.love === 0) W.answers[r.host].why = [];
  draw();
}
function next() {
  const ready = W.results.filter(x => !x.error);
  const r = ready[W.i];
  if (!r || W.answers[r.host] === undefined || W.answers[r.host].love === undefined) return;
  W.i++;
  if (W.i >= ready.length && !W.visiting) { W.step = 'words'; }
  draw();
}

document.addEventListener('click', async (e) => {
  const g = e.target.closest('[data-go]');
  if (g && !g.disabled) return go(g.dataset.go);
  const s = e.target.closest('[data-src]');
  if (s) {
    const src = W.sources[Number(s.dataset.src)];
    W.src = src.id; W.srcName = src.name.split(' ·')[0];
    s.classList.add('busy');
    const r = await A.call('taste:load', { src });
    if (!r) { s.classList.remove('busy'); return; }
    W.loaded = r; pickDefault();
    return go('sites');
  }
  const m = e.target.closest('[data-many]');
  if (m) { W.howMany = Number(m.dataset.many); pickDefault(); return draw(); }
  const c = e.target.closest('[data-host]');
  if (c) { const h = c.dataset.host; if (W.picked.has(h)) W.picked.delete(h); else if (W.picked.size < 30) W.picked.add(h); return draw(); }
  const lv = e.target.closest('[data-love]');
  if (lv) return answer({ love: Number(lv.dataset.love) });
  const wy = e.target.closest('[data-why]');
  if (wy && !wy.disabled) { const r = W.results.filter(x => !x.error)[W.i]; const a = W.answers[r.host] || {}; const set = new Set(a.why || []); set.has(wy.dataset.why) ? set.delete(wy.dataset.why) : set.add(wy.dataset.why); return answer({ why: [...set] }); }
  const wd = e.target.closest('[data-word]');
  if (wd) { const w = wd.dataset.word; if (W.words.has(w)) W.words.delete(w); else if (W.words.size < 3) W.words.add(w); return draw(); }
  const cp = e.target.closest('[data-copy]');
  if (cp) { A.call('copy', { text: cp.dataset.copy }); return; }
  const a = e.target.closest('[data-act]');
  if (!a || a.disabled) return;
  const k = a.dataset.act;
  if (k === 'importIt') { W.importIt = !W.importIt; draw(); }
  if (k === 'next') next();
  if (k === 'prev') { W.i = Math.max(0, W.i - 1); draw(); }
  if (k === 'skipSite') { const r = W.results.filter(x => !x.error)[W.i]; if (r) { W.answers[r.host] = { love: 0, skipped: true }; next(); } }
  if (k === 'backAsk') { W.step = 'ask'; W.i = Math.max(0, W.results.filter(x => !x.error).length - 1); draw(); }
  if (k === 'openLib') A.call('open', { url: 'aura://library/#' + W.saved });
  if (k === 'done') A.call('open', { url: 'aura://newtab/' });
});
document.addEventListener('change', (e) => { if (e.target.id === 'spaceSel') W.spaceId = e.target.value; });
document.addEventListener('keydown', (e) => {
  if (W.step !== 'ask') return;
  if (e.key === '1') answer({ love: 2 });
  if (e.key === '2') answer({ love: 1 });
  if (e.key === '3') answer({ love: 0 });
  if (e.key === 'Enter') next();
  if (e.key === 'ArrowLeft' && W.i) { W.i--; draw(); }
});
A.on((what, data) => {
  if (what !== 'taste' || !data) return;
  W.progress = { n: data.n, of: data.of };
  W.results.push(data.site);
  // Redraw only when it changes what's on screen: the waiting view or the counter.
  const ready = W.results.filter(x => !x.error);
  if (W.step === 'ask' && (ready.length === W.i + 1 || !ready[W.i] || true)) {
    const cur = document.activeElement;
    if (!cur || cur.tagName !== 'INPUT') draw();
  }
});
start();
