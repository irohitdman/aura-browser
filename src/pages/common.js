// Shared by Aura's own pages: theme from the current Space, icons and small helpers.
const A = window.aura;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const isMac = navigator.platform.startsWith('Mac');

async function applyTheme() {
  const t = await A.call('theme');
  if (!t) return;
  const r = document.documentElement.style;
  ['body', 'plate', 'key', 'keylit', 'keyhov', 'well', 'alu', 'ink', 'mute', 'line', 'accent', 'accent30', 'onaccent', 'pop', 'savebg', 'savefg', 'savehi'].forEach(k => t[k] && r.setProperty('--' + k, t[k]));
  document.documentElement.classList.toggle('lightmode', !!t.light);
}
applyTheme();
A.on(w => { if (w === 'theme') applyTheme(); });

const PATHS = {
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM20 20l-4.2-4.2',
  x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  drop: 'M12 3.5c3.5 4.2 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.5-6.6 6-10.8z',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  ext: 'M14 5h5v5M19 5l-8 8M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5',
  library: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v15h-6zM4.5 13.5h6v6h-6z',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 7.5V12l3 2',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  folder: 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5V4.5h-11v11h4',
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM12 11v5M12 7.8v.4',
  camera: 'M4 7.5h3l1.8-2.5h6.4L17 7.5h3V19H4zM12 9.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z',
  plus: 'M12 5v14M5 12h14',
  play: 'M7 4.5v15l12.5-7.5z',
  reload: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.6 8.5L4 18.5V21h3v-2h2v-2h2l1.4-1.4A5.5 5.5 0 0 1 14.5 4zM16 8.5v.1',
  puzzle: 'M9 4.5h3.5a2 2 0 1 1 4 0H19V9a2 2 0 1 1 0 4v6.5h-4a2 2 0 1 0-4 0H5V15a2 2 0 1 0 0-4V4.5z'
};
function icon(n, size = 16) { return `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${PATHS[n] || PATHS.globe}"/></svg>`; }

function ago(ts) {
  const d = new Date(ts), now = new Date();
  const m = Math.round((now - d) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (d.toDateString() === now.toDateString()) return 'today, ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' }) + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
}
function bytes(n) { if (!n) return '0 KB'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i]; }
