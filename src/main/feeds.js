// Daily, live: websites, typefaces, palettes and interactions pulled from open feeds each morning.
// Everything is cached on this Mac; Daily shows the bundled snapshot until the first fetch lands.
const fs = require('fs');
const path = require('path');
const { app, net, nativeImage } = require('electron');

const SOURCES = {
  awwwards: { name: 'Awwwards', host: 'awwwards.com', what: 'Sites of the Day', cat: 'sites', feed: 'https://feeds.feedburner.com/awwwards-sites-of-the-day' },
  fwa: { name: 'FWA', host: 'thefwa.com', what: 'FWA of the Day', cat: 'sites', feed: 'https://thefwa.com/rss' },
  onepagelove: { name: 'One Page Love', host: 'onepagelove.com', what: 'One-page sites, hand picked', cat: 'sites', feed: 'https://onepagelove.com/feed' },
  googlefonts: { name: 'Google Fonts', host: 'fonts.google.com', what: 'Newest typefaces', cat: 'type', meta: 'https://fonts.google.com/metadata/fonts' },
  codrops: { name: 'Codrops', host: 'tympanus.net', what: 'Interaction demos and tutorials', cat: 'motion', feed: 'https://tympanus.net/codrops/feed/' },
  codepen: { name: 'CodePen', host: 'codepen.io', what: 'Picked pens', cat: 'motion', feed: 'https://codepen.io/picks/feed/' }
};

const decode = (s) => String(s || '')
  .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = (h) => decode(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function tag(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block);
  return m ? m[1].trim() : '';
}
function attr(block, name, a) {
  const m = new RegExp('<' + name + '\\s[^>]*' + a + '=["\']([^"\']+)["\']', 'i').exec(block);
  return m ? decode(m[1]) : '';
}

// RSS 2.0 and Atom, forgiving about what each source puts where.
function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href');
    const html = decode(tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    const img = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || (/<enclosure[^>]+type=["']image/i.test(b) ? attr(b, 'enclosure', 'url') : '') ||
      ((/<img[^>]+src=["']([^"']+)["']/i.exec(html) || [])[1] || '');
    const date = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const by = strip(tag(b, 'dc:creator') || tag(b, 'author'));
    if (title && link) out.push({ title, link, img: decode(img), date: date ? new Date(date).getTime() || 0 : 0, by, text: strip(html).slice(0, 240) });
  }
  return out;
}

async function get(url, type = 'text') {
  const res = await net.fetch(url, { headers: { 'user-agent': app.userAgentFallback, accept: type === 'text' ? 'application/rss+xml, application/xml, text/xml, text/html, */*' : '*/*' } });
  if (!res.ok) throw new Error(url + ' ' + res.status);
  return type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function ogImage(url) {
  try {
    const html = await withTimeout(get(url), 12000);
    const m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    return m ? new URL(decode(m[1]), url).href : '';
  } catch (e) { return ''; }
}

// Five colours from an image: downsample, bucket, then keep distinct, frequent ones.
function paletteOf(buf) {
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) return null;
  const small = img.resize({ width: 64, height: 40, quality: 'good' });
  const px = small.toBitmap(); // BGRA
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const b = px[i], g = px[i + 1], r = px[i + 2];
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; buckets.set(k, e);
  }
  const hex = (e) => '#' + [e.r, e.g, e.b].map(v => Math.round(v / e.n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => { const p = rgb(a), q = rgb(b); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); };
  const sat = (h) => { const [r, g, b] = rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const ranked = [...buckets.values()].map(e => ({ h: hex(e), n: e.n })).sort((a, b) => (b.n * (1 + sat(b.h))) - (a.n * (1 + sat(a.h))));
  const out = [];
  for (const c of ranked) { if (out.length >= 5) break; if (out.every(o => dist(o, c.h) > 60)) out.push(c.h); }
  return out.length >= 3 ? out : null;
}

class Daily {
  constructor() {
    this.dir = path.join(app.getPath('userData'), 'daily');
    fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, 'daily.json');
    this.data = null;
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) {}
    this.running = null;
    this.onChange = () => {};
  }
  stale() { return !this.data || Date.now() - this.data.at > 6 * 3600 * 1000 || new Date(this.data.at).toDateString() !== new Date().toDateString(); }
  get() { return this.data ? Object.assign({ sources: SOURCES }, this.data) : { sources: SOURCES, items: [], at: 0 }; }

  refresh(force) {
    if (this.running) return this.running;
    if (!force && !this.stale()) return Promise.resolve(this.get());
    this.running = this.fetchAll().then((items) => {
      if (items.length >= 6) {
        this.data = { at: Date.now(), items, errors: this.errors };
        fs.writeFileSync(this.file, JSON.stringify(this.data));
        this.onChange();
      }
      return this.get();
    }).catch((e) => { console.warn('daily refresh failed', e.message); return this.get(); }).finally(() => { this.running = null; });
    return this.running;
  }

  async fetchAll() {
    this.errors = [];
    const items = [];
    const feeds = Object.entries(SOURCES).filter(([, s]) => s.feed);
    await Promise.all(feeds.map(async ([key, s]) => {
      try {
        const list = parseFeed(await withTimeout(get(s.feed), 15000)).slice(0, s.cat === 'motion' ? 8 : 10);
        for (const [i, it] of list.entries()) items.push({ id: key + '-' + i, src: key, cat: s.cat, title: it.title, url: it.link, img: it.img, date: it.date, by: it.by, text: it.text });
      } catch (e) { this.errors.push(key + ': ' + e.message); }
    }));
    // Images: the feed's own, otherwise the page's preview image.
    await pool(items.filter(i => !i.img), 4, async (it) => { it.img = await ogImage(it.url); });
    // Keep a local copy of each preview so Daily opens instantly and works offline; read palettes from site previews.
    await pool(items.filter(i => i.img), 4, async (it) => {
      try {
        const buf = await withTimeout(get(it.img, 'buffer'), 15000);
        const img = nativeImage.createFromBuffer(buf);
        if (img.isEmpty()) { it.img = ''; return; }
        const size = img.getSize();
        const w = Math.min(720, size.width);
        const name = it.id.replace(/[^a-z0-9-]/gi, '') + '.jpg';
        fs.writeFileSync(path.join(this.dir, name), img.resize({ width: w, quality: 'good' }).toJPEG(80));
        it.file = name; it.ratio = size.height / size.width;
        if (it.cat === 'sites') it.pal = paletteOf(buf);
      } catch (e) { it.img = ''; }
    });
    // Typefaces: newest families on Google Fonts.
    try {
      let raw = await withTimeout(get(SOURCES.googlefonts.meta), 15000);
      raw = raw.replace(/^\)\]\}'\s*/, '');
      const meta = JSON.parse(raw);
      const fams = (meta.familyMetadataList || []).filter(f => f.dateAdded && !/Noto|Icons|Symbols/i.test(f.family))
        .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 16);
      fams.forEach((f, i) => items.push({
        id: 'gf-' + i, src: 'googlefonts', cat: 'type', title: f.family, url: 'https://fonts.google.com/specimen/' + f.family.replace(/ /g, '+'),
        date: new Date(f.dateAdded).getTime() || 0, by: (f.designers || []).join(', '), category: f.category,
        styles: Object.keys(f.fonts || {}).length, axes: (f.axes || []).map(a => a.tag + ' ' + a.min + '–' + a.max), weights: Object.keys(f.fonts || {}).filter(k => !/i$/.test(k)).map(Number).sort((a, b) => a - b)
      }));
    } catch (e) { this.errors.push('googlefonts: ' + e.message); }
    return items.filter(i => i.cat === 'type' || i.file);
  }
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const it = list[i++]; await fn(it).catch(() => {}); } }));
}

module.exports = { Daily, SOURCES, parseFeed, paletteOf };
