// History, downloads and saved passwords.
const { safeStorage } = require('electron');
const { JsonStore } = require('./store');

class History {
  constructor() { this.st = new JsonStore('history', { visits: [] }); }
  add(v) {
    if (!v.url || /^(aura|about|data|chrome|devtools):/.test(v.url)) return;
    const list = this.st.data.visits;
    const last = list[0];
    if (last && last.url === v.url && Date.now() - last.ts < 30 * 60 * 1000) {
      last.title = v.title || last.title; last.ts = Date.now();
    } else {
      list.unshift({ url: v.url, title: v.title || v.url, ts: Date.now(), space: v.space });
      if (list.length > 20000) list.length = 20000;
    }
    this.st.save();
  }
  title(url, title) {
    const v = this.st.data.visits.find(x => x.url === url);
    if (v && title) { v.title = title; this.st.save(); }
  }
  query(q, limit = 300) {
    const s = String(q || '').toLowerCase();
    const out = [];
    for (const v of this.st.data.visits) {
      if (!s || v.url.toLowerCase().includes(s) || (v.title || '').toLowerCase().includes(s)) out.push(v);
      if (out.length >= limit) break;
    }
    return out;
  }
  // For the command bar: one row per address, most visited first.
  suggest(q, limit = 6) {
    const s = String(q || '').toLowerCase();
    if (!s) return [];
    const seen = new Map();
    for (const v of this.st.data.visits) {
      const hit = v.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').startsWith(s) ? 3 : (v.url.toLowerCase().includes(s) || (v.title || '').toLowerCase().includes(s)) ? 1 : 0;
      if (!hit) continue;
      const cur = seen.get(v.url) || { url: v.url, title: v.title, score: 0 };
      cur.score += hit;
      seen.set(v.url, cur);
      if (seen.size > 400) break;
    }
    return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
  remove(url) { this.st.data.visits = this.st.data.visits.filter(v => v.url !== url); this.st.save(); }
  clear(sinceMs) {
    if (sinceMs) { const cut = Date.now() - sinceMs; this.st.data.visits = this.st.data.visits.filter(v => v.ts < cut); }
    else this.st.data.visits = [];
    this.st.save(true);
  }
}

class Downloads {
  constructor() { this.st = new JsonStore('downloads', { items: [] }); this.live = new Map(); }
  list() { return this.st.data.items; }
  track(item, onChange) {
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { id, name: item.getFilename(), url: item.getURL(), path: item.getSavePath(), total: item.getTotalBytes(), received: 0, state: 'progressing', ts: Date.now() };
    this.st.data.items.unshift(rec);
    if (this.st.data.items.length > 500) this.st.data.items.length = 500;
    this.live.set(id, item);
    item.on('updated', (_e, state) => {
      rec.received = item.getReceivedBytes(); rec.total = item.getTotalBytes(); rec.path = item.getSavePath();
      rec.state = state === 'interrupted' ? 'interrupted' : (item.isPaused() ? 'paused' : 'progressing');
      onChange(rec);
    });
    item.once('done', (_e, state) => {
      rec.state = state; rec.received = item.getReceivedBytes(); rec.path = item.getSavePath();
      this.live.delete(id); this.st.save(); onChange(rec, true);
    });
    this.st.save();
    return rec;
  }
  cancel(id) { const it = this.live.get(id); if (it) it.cancel(); }
  remove(id) { this.st.data.items = this.st.data.items.filter(i => i.id !== id); this.st.save(); }
  clear() { this.st.data.items = this.st.data.items.filter(i => this.live.has(i.id)); this.st.save(); }
}

// Passwords are encrypted with a key that macOS keeps in the Keychain (safeStorage).
class Passwords {
  constructor() { this.st = new JsonStore('passwords', { items: [], never: [] }); }
  ok() { return safeStorage.isEncryptionAvailable(); }
  enc(s) { return safeStorage.encryptString(s).toString('base64'); }
  dec(s) { try { return safeStorage.decryptString(Buffer.from(s, 'base64')); } catch (e) { return ''; } }
  list() { return this.st.data.items.map(i => ({ id: i.id, origin: i.origin, username: i.username, ts: i.ts })); }
  reveal(id) { const i = this.st.data.items.find(x => x.id === id); return i ? this.dec(i.password) : ''; }
  forOrigin(origin) {
    return this.st.data.items.filter(i => i.origin === origin).map(i => ({ username: i.username, password: this.dec(i.password) }));
  }
  has(origin, username, password) {
    return this.st.data.items.some(i => i.origin === origin && i.username === username && this.dec(i.password) === password);
  }
  isNever(origin) { return this.st.data.never.includes(origin); }
  never(origin) { if (!this.isNever(origin)) { this.st.data.never.push(origin); this.st.save(); } }
  save(origin, username, password) {
    if (!this.ok()) return false;
    const cur = this.st.data.items.find(i => i.origin === origin && i.username === username);
    if (cur) { cur.password = this.enc(password); cur.ts = Date.now(); }
    else this.st.data.items.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), origin, username, password: this.enc(password), ts: Date.now() });
    this.st.save();
    return true;
  }
  remove(id) { this.st.data.items = this.st.data.items.filter(i => i.id !== id); this.st.save(); }
  // Chrome, 1Password and most managers export: name,url,username,password
  importCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return 0;
    const head = rows[0].map(h => h.trim().toLowerCase());
    const iu = head.findIndex(h => h === 'url' || h === 'website' || h === 'login_uri');
    const iuser = head.findIndex(h => h === 'username' || h === 'login_username' || h === 'login');
    const ip = head.findIndex(h => h === 'password' || h === 'login_password');
    if (iu < 0 || ip < 0) return 0;
    let n = 0;
    for (const r of rows.slice(1)) {
      const url = r[iu], pw = r[ip];
      if (!url || !pw) continue;
      let origin;
      try { origin = new URL(/^https?:/.test(url) ? url : 'https://' + url).origin; } catch (e) { continue; }
      this.save(origin, iuser >= 0 ? (r[iuser] || '') : '', pw);
      n++;
    }
    return n;
  }
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

module.exports = { History, Downloads, Passwords };
