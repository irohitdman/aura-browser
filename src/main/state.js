// Persistent browser state: Spaces, pins, folders, Today tabs and UI preferences.
const { JsonStore } = require('./store');

let n = Date.now();
const uid = (p = 'i') => p + (n++).toString(36);

const DEFAULT_SPACES = [
  { id: 'personal', name: 'Personal', icon: 'home', color: 'red', tint: 22 },
  { id: 'work', name: 'Work', icon: 'briefcase', color: 'graphite', tint: 0 },
  { id: 'research', name: 'Research', icon: 'compass', color: 'blue', tint: 28 }
];

function emptySpace() {
  return { pins: [], folders: [], today: [], activeId: null };
}

function defaults() {
  const sp = {};
  DEFAULT_SPACES.forEach(s => { sp[s.id] = emptySpace(); });
  return {
    version: 1,
    spaces: DEFAULT_SPACES,
    active: 'work',
    sp,
    ui: { sidebar: 'full', toolbar: true, theme: 'dark', panel: false },
    settings: {
      search: 'google',
      newTab: 'daily',
      extensions: [],
      keepHistory: true,
      askDefault: true,
      onboarded: false
    },
    closed: [],
    bounds: null
  };
}

const SEARCH = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' }
};

function openState() {
  const st = new JsonStore('state', defaults());
  const d = st.data;
  // Repair anything missing after upgrades.
  const def = defaults();
  d.ui = Object.assign({}, def.ui, d.ui);
  d.settings = Object.assign({}, def.settings, d.settings);
  if (!Array.isArray(d.spaces) || !d.spaces.length) d.spaces = def.spaces;
  d.sp = d.sp || {};
  d.spaces.forEach(s => { if (!d.sp[s.id]) d.sp[s.id] = emptySpace(); });
  if (!d.spaces.find(s => s.id === d.active)) d.active = d.spaces[0].id;
  d.closed = d.closed || [];
  return st;
}

// Turn what someone typed into a URL.
function toUrl(input, engine) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^(https?|file|aura|about|chrome|view-source|data):/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  const e = SEARCH[engine] || SEARCH.google;
  return e.url.replace('%s', encodeURIComponent(s));
}

module.exports = { openState, uid, emptySpace, SEARCH, toUrl };
