// The Library: everything saved with ⌘S and friends, kept on this Mac only.
const fs = require('fs');
const path = require('path');
const { JsonStore, dir } = require('./store');
const { uid } = require('./state');

const KINDS = { page: 'Pages', look: 'Looks', type: 'Typefaces', colour: 'Colours', area: 'Areas', taste: 'Taste' };

const HUES = [
  [0, 'red'], [20, 'orange'], [45, 'yellow'], [70, 'lime'], [140, 'green'], [170, 'teal'], [188, 'cyan'],
  [205, 'blue'], [245, 'indigo'], [290, 'violet'], [320, 'pink'], [345, 'red']
];
function describeColour(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const words = [];
  if (l < 0.12) words.push('black', 'dark');
  else if (l > 0.93) words.push('white', 'light');
  else if (s < 0.12) words.push(l < 0.45 ? 'dark' : 'light', 'grey', 'gray', 'neutral');
  if (s >= 0.12 && l >= 0.12 && l <= 0.93) {
    let h = 0;
    if (d) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    let name = 'red';
    for (const [deg, nm] of HUES) if (h >= deg) name = nm;
    words.push(name);
    if (name === 'orange' && l < 0.4) words.push('brown');
    if (l > 0.75) words.push('pastel', 'light'); else if (l < 0.3) words.push('deep', 'dark');
    if (s > 0.7) words.push('bright', 'vivid');
  }
  return words;
}

function classifyFont(f) {
  const n = (f.family + ' ' + (f.stack || '')).toLowerCase();
  if (/mono|code|courier|menlo/.test(n)) return ['mono', 'monospace'];
  if (/serif/.test(n) && !/sans/.test(n)) return ['serif'];
  if (/display|grotesk|grotesque/.test(n)) return ['sans', 'grotesk'];
  return ['sans'];
}

function tagsFor(save) {
  const t = new Set();
  t.add(save.kind); t.add(KINDS[save.kind] ? KINDS[save.kind].toLowerCase() : save.kind);
  if (save.host) save.host.split('.').forEach(p => p.length > 2 && t.add(p.toLowerCase()));
  (save.title || '').toLowerCase().split(/[^a-z0-9]+/).forEach(w => w.length > 2 && t.add(w));
  const look = save.look || {};
  if (look.colours && look.colours.length) {
    t.add(look.dark ? 'dark' : 'light');
    if (look.dark) t.add('night');
    look.colours.forEach(c => describeColour(c.hex).forEach(w => t.add(w)));
  }
  (look.faces || []).forEach(f => {
    f.family.toLowerCase().split(/\s+/).forEach(w => t.add(w));
    classifyFont(f).forEach(w => t.add(w));
  });
  if (look.values && look.values.motion && look.values.motion !== 'Still') t.add(look.values.motion.toLowerCase()).add('motion').add('animated');
  if (save.type) {
    save.type.family.toLowerCase().split(/\s+/).forEach(w => t.add(w));
    classifyFont(save.type).forEach(w => t.add(w));
    t.add('font').add('typeface').add('type');
  }
  if (save.colour) describeColour(save.colour).forEach(w => t.add(w));
  if (save.spaceName) t.add(save.spaceName.toLowerCase());
  return [...t];
}

class Library {
  constructor() {
    this.root = path.join(dir(), 'library');
    fs.mkdirSync(this.root, { recursive: true });
    this.index = new JsonStore('library', { saves: [], boards: [] });
  }
  all() { return this.index.data.saves; }
  get(id) { return this.all().find(s => s.id === id); }
  file(id, name) { return path.join(this.root, id, name); }

  add(save, image) {
    const id = uid('s');
    const folder = path.join(this.root, id);
    fs.mkdirSync(folder, { recursive: true });
    const rec = Object.assign({ id, created: Date.now() }, save);
    if (image && !image.isEmpty()) {
      fs.writeFileSync(path.join(folder, 'shot.png'), image.toPNG());
      const size = image.getSize();
      const w = Math.min(720, size.width);
      const thumb = image.resize({ width: w, quality: 'good' });
      fs.writeFileSync(path.join(folder, 'thumb.jpg'), thumb.toJPEG(82));
      rec.hasShot = true;
      rec.size = size;
    }
    rec.tags = tagsFor(rec);
    this.index.data.saves.unshift(rec);
    this.index.save();
    return rec;
  }

  update(id, patch) {
    const s = this.get(id);
    if (!s) return null;
    Object.assign(s, patch);
    s.tags = tagsFor(s);
    this.index.save();
    return s;
  }

  remove(id) {
    const i = this.all().findIndex(s => s.id === id);
    if (i < 0) return false;
    this.all().splice(i, 1);
    this.index.save();
    fs.rm(path.join(this.root, id), { recursive: true, force: true }, () => {});
    return true;
  }

  // "Describe it, any words": every word has to match something about the save.
  search(q, kind, spaceId) {
    let list = this.all();
    if (kind && kind !== 'all') list = list.filter(s => s.kind === kind);
    if (spaceId) list = list.filter(s => s.spaceId === spaceId);
    const words = String(q || '').toLowerCase().split(/[^a-z0-9#]+/).filter(w => w && !['on', 'the', 'a', 'an', 'with', 'and', 'of', 'in', 'from', 'that', 'my'].includes(w));
    if (!words.length) return list;
    const scored = [];
    for (const s of list) {
      const hay = s.tags.join(' ') + ' ' + (s.url || '') + ' ' + (s.note || '').toLowerCase();
      let score = 0;
      for (const w of words) {
        if (s.tags.includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
        else if (w.startsWith('#') && JSON.stringify(s.look || s.colour || '').toLowerCase().includes(w)) score += 3;
      }
      if (score) scored.push([score, s]);
    }
    return scored.sort((a, b) => b[0] - a[0] || b[1].created - a[1].created).map(x => x[1]);
  }

  counts() {
    const c = { all: this.all().length };
    for (const k of Object.keys(KINDS)) c[k] = 0;
    for (const s of this.all()) c[s.kind] = (c[s.kind] || 0) + 1;
    return c;
  }
}

function lookToCss(look, name) {
  const lines = [`/* ${name || look.host || 'Saved look'}, saved in Aura */`, ':root {'];
  const used = {};
  (look.colours || []).forEach(c => {
    let k = '--' + c.role.toLowerCase().replace(/[^a-z]+/g, '-');
    used[k] = (used[k] || 0) + 1;
    if (used[k] > 1) k += '-' + used[k];
    lines.push(`  ${k}: ${c.hex};`);
  });
  (look.faces || []).forEach(f => {
    lines.push(`  --font-${f.role.toLowerCase()}: ${f.stack};`);
  });
  if (look.values) {
    if (look.values.radius && look.values.radius !== '0') lines.push(`  --radius: ${look.values.radius.split('/')[0].replace('px', '')}px;`);
    if (look.values.measure && look.values.measure !== 'Fluid') lines.push(`  --measure: ${look.values.measure};`);
  }
  lines.push('}');
  const vars = Object.entries(look.vars || {});
  if (vars.length) {
    lines.push('', '/* The page\'s own custom properties */', ':root {');
    vars.slice(0, 40).forEach(([k, v]) => lines.push(`  ${k}: ${v};`));
    lines.push('}');
  }
  return lines.join('\n');
}

module.exports = { Library, KINDS, lookToCss, describeColour };
