// Onboarding: bring bookmarks over from another browser, look at a handful of those sites,
// ask what the person likes about them, and turn the answers into a taste palette.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow, session } = require('electron');
const { READ_LOOK } = require('./extract');

const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support');
const CHROMIUM = [
  ['chrome', 'Chrome', 'Google/Chrome'],
  ['arc', 'Arc', 'Arc/User Data'],
  ['brave', 'Brave', 'BraveSoftware/Brave-Browser'],
  ['edge', 'Edge', 'Microsoft Edge'],
  ['vivaldi', 'Vivaldi', 'Vivaldi'],
  ['opera', 'Opera', 'com.operasoftware.Opera'],
  ['chromium', 'Chromium', 'Chromium'],
  ['dia', 'Dia', 'Dia/User Data']
];

// Sites that say little about someone's taste.
const SKIP = /(^|\.)(google|gmail|youtube|facebook|twitter|x|linkedin|amazon|apple|icloud|microsoft|live|office|outlook|github|gitlab|stackoverflow|notion|slack|zoom|atlassian|jira|figma|dropbox|wikipedia|reddit|netflix|localhost|chatgpt|openai|claude|anthropic|bank|paypal)\./i;

function profiles(base) {
  const out = [];
  try {
    for (const d of fs.readdirSync(base)) if (d === 'Default' || /^Profile \d+$/.test(d)) out.push(path.join(base, d));
  } catch (e) {}
  if (fs.existsSync(path.join(base, 'Bookmarks'))) out.push(base);
  return out;
}

function walkChromium(node, folder, out) {
  if (!node) return;
  if (node.type === 'url' && /^https?:/.test(node.url)) out.push({ title: node.name || node.url, url: node.url, folder });
  for (const c of node.children || []) walkChromium(c, node.type === 'folder' && node.name && !/^(Bookmarks bar|Other bookmarks|Mobile bookmarks|Bookmarks Bar)$/i.test(node.name) ? node.name : folder, out);
}

function readChromium(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const k of Object.keys(j.roots || {})) walkChromium(j.roots[k], '', out);
  return out;
}

// Arc keeps its sidebar (pinned tabs and folders) in its own file.
function readArc() {
  const file = path.join(SUPPORT, 'Arc', 'StorableSidebar.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  const seen = new Set();
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(visit); return; }
    const tab = v.data && v.data.tab;
    if (tab && /^https?:/.test(tab.savedURL || '') && !seen.has(tab.savedURL)) { seen.add(tab.savedURL); out.push({ title: tab.savedTitle || v.title || tab.savedURL, url: tab.savedURL, folder: 'Arc' }); }
    for (const k in v) if (typeof v[k] === 'object') visit(v[k]);
  };
  visit(j);
  return out;
}

// Netscape bookmark files: what Safari, Firefox and every other browser export.
function readHtml(text) {
  const out = [];
  let folder = '';
  const re = /<H3[^>]*>([^<]*)<\/H3>|<A\s[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) folder = m[1];
    else if (/^https?:/.test(m[2])) out.push({ title: m[3] || m[2], url: m[2].replace(/&amp;/g, '&'), folder });
  }
  return out;
}

function sources() {
  const found = [];
  if (process.platform !== 'darwin' && !process.env.AURA_DRIVE) return found;
  for (const [id, name, rel] of CHROMIUM) {
    for (const p of profiles(path.join(SUPPORT, rel))) {
      const f = path.join(p, 'Bookmarks');
      try {
        const n = readChromium(f).length;
        if (n) found.push({ id: id + ':' + path.basename(p), browser: id, name: name + (path.basename(p) !== 'Default' && p !== path.join(SUPPORT, rel) ? ' · ' + path.basename(p) : ''), file: f, count: n });
      } catch (e) {}
    }
  }
  try { const n = readArc().length; if (n) found.push({ id: 'arc:sidebar', browser: 'arc', name: 'Arc · sidebar', arc: true, count: n }); } catch (e) {}
  // Safari needs Full Disk Access to read directly; the HTML export always works.
  found.push({ id: 'file', browser: 'file', name: 'A bookmarks file', file: null, count: 0, hint: 'Safari: File › Export Browsing Data. Firefox: Bookmarks › Manage › Export.' });
  return found;
}

function load(src, fileText) {
  let list = [];
  if (src.arc) list = readArc();
  else if (src.browser === 'file') list = readHtml(fileText || '');
  else list = readChromium(src.file);
  const seen = new Set();
  return list.filter(b => { if (seen.has(b.url)) return false; seen.add(b.url); return true; });
}

// Candidate sites for the taste pass: one per host, skipping tools and big platforms.
function candidates(list) {
  const byHost = new Map();
  for (const b of list) {
    let u; try { u = new URL(b.url); } catch (e) { continue; }
    const host = u.hostname.replace(/^www\./, '');
    if (SKIP.test(host + '.') || /^(docs|mail|drive|calendar|app|admin|dashboard|console|login|accounts)\./.test(host)) continue;
    if (!byHost.has(host)) byHost.set(host, { host, url: u.origin + (u.pathname.length < 40 ? u.pathname : '/'), title: b.title, folder: b.folder });
  }
  return [...byHost.values()];
}

// Visit sites off screen, a few at a time, and read their look plus a screenshot.
async function visit(sites, onEach, signal) {
  const ses = session.fromPartition('aura-taste'); // not persisted: nothing stays behind
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < sites.length && !(signal && signal.stopped)) {
      const s = sites[i++];
      const r = await one(ses, s).catch(e => ({ ...s, error: e.message }));
      results.push(r);
      onEach(r, results.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return results;
}

async function one(ses, site) {
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { session: ses, offscreen: false, sandbox: true, contextIsolation: true, javascript: true, images: true, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  try {
    await Promise.race([win.loadURL(site.url), new Promise((_, rej) => setTimeout(() => rej(new Error('Took too long')), 20000))]);
    await new Promise(r => setTimeout(r, 1800));
    const look = await win.webContents.executeJavaScript(READ_LOOK, false);
    const img = await win.webContents.capturePage();
    const thumb = img.isEmpty() ? null : 'data:image/jpeg;base64,' + img.resize({ width: 640, quality: 'good' }).toJPEG(78).toString('base64');
    return { ...site, title: look.title || site.title, look, thumb };
  } finally { win.destroy(); }
}

// Answers in, palette out. Each answer: { love: 2|1|0, why: ['type','colour','layout','imagery','motion'] }.
function compose(results, answers, words) {
  const w = (r) => { const a = answers[r.host] || {}; return a.love === 2 ? 3 : a.love === 1 ? 1 : 0; };
  const liked = results.filter(r => r.look && w(r) > 0);
  const colours = new Map(), faces = new Map();
  let dark = 0, total = 0, radius = [], motion = 0;
  const near = (a, b) => { const p = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), q = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 48; };
  for (const r of liked) {
    const a = answers[r.host] || {};
    const why = a.why || [];
    const k = w(r);
    total += k; if (r.look.dark) dark += k;
    (r.look.colours || []).forEach((c, i) => {
      const weight = k * (why.includes('colour') ? 2 : 1) * (c.role === 'Accent' ? 2.2 : c.role === 'Background' ? 1.4 : 1) / (1 + i * 0.25);
      const hit = [...colours.keys()].find(h => near(h, c.hex));
      const key = hit || c.hex;
      const e = colours.get(key) || { hex: key, n: 0, roles: {}, from: new Set() };
      e.n += weight; e.roles[c.role] = (e.roles[c.role] || 0) + weight; e.from.add(r.host);
      colours.set(key, e);
    });
    (r.look.faces || []).slice(0, 2).forEach((f) => {
      if (/^(-apple-system|system-ui|BlinkMacSystemFont|Arial|Helvetica|sans-serif|serif|Times New Roman|Segoe UI|Roboto)$/i.test(f.family)) return;
      const e = faces.get(f.family) || { family: f.family, stack: f.stack, n: 0, roles: new Set(), from: new Set() };
      e.n += k * (why.includes('type') ? 2 : 1); e.roles.add(f.role); e.from.add(r.host);
      faces.set(f.family, e);
    });
    const rad = parseFloat(String((r.look.values || {}).radius || '0'));
    if (rad) radius.push(rad);
    if ((r.look.values || {}).motion && r.look.values.motion !== 'Still') motion += k;
  }
  const pal = [...colours.values()].sort((a, b) => b.n - a.n).slice(0, 8)
    .map(e => ({ hex: e.hex, role: Object.entries(e.roles).sort((a, b) => b[1] - a[1])[0][0], from: [...e.from].slice(0, 3) }));
  const type = [...faces.values()].sort((a, b) => b.n - a.n).slice(0, 4).map(e => ({ family: e.family, stack: e.stack, roles: [...e.roles], from: [...e.from].slice(0, 3) }));
  const whyCount = {};
  for (const h in answers) (answers[h].why || []).forEach(x => { whyCount[x] = (whyCount[x] || 0) + 1; });
  radius.sort((a, b) => a - b);
  return {
    palette: pal, type, words: words || [],
    lean: total ? (dark / total > 0.6 ? 'Dark' : dark / total < 0.4 ? 'Light' : 'Both') : 'Both',
    radius: radius.length ? Math.round(radius[Math.floor(radius.length / 2)]) + 'px' : 'Square',
    motion: total ? (motion / total > 0.4 ? 'Moving' : 'Mostly still') : '',
    drawn: Object.entries(whyCount).sort((a, b) => b[1] - a[1]).map(x => x[0]),
    loved: liked.filter(r => (answers[r.host] || {}).love === 2).map(r => ({ host: r.host, url: r.url, title: r.title })),
    count: results.length, likedCount: liked.length
  };
}

module.exports = { sources, load, candidates, visit, compose, readHtml };
