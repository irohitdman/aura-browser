// Settings: general, Spaces, passwords, extensions, privacy and shortcuts.
/* global A, esc, icon, $, isMac, ago */
const SECTIONS = [['general', 'General'], ['spaces', 'Spaces'], ['passwords', 'Passwords'], ['extensions', 'Extensions'], ['privacy', 'Privacy'], ['shortcuts', 'Shortcuts'], ['about', 'About']];
const SPACE_PATHS = {
  home: 'M4.5 11L12 4.5l7.5 6.5M6.5 9.5v10h11v-10', briefcase: 'M4 8h16v11H4zM9 8V5.5h6V8M4 13h16',
  compass: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM15.5 8.5l-2 5-5 2 2-5z', star: 'M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z'
};
let S = null, pw = [], exts = [], revealed = {};

async function load() {
  S = await A.call('settings:get');
  pw = await A.call('pw:list') || [];
  exts = await A.call('ext:list') || [];
  draw();
}
const tog = (on, key) => `<button class="tog ${on ? 'on' : ''}" data-tog="${key}" role="switch" aria-checked="${on}"><i></i></button>`;
const seg = (key, val, opts) => `<div class="seg">${opts.map(([v, n]) => `<button class="${val === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;

function draw() {
  $('#nav').innerHTML = SECTIONS.map(([id, n]) => `<a href="#${id}" data-nav="${id}">${n}</a>`).join('');
  const s = S.settings, ui = S.ui;
  let h = `<div><h1>Settings</h1></div>`;

  h += `<section id="general"><h2>General</h2><p>How Aura opens and searches.</p>
    <div class="set"><span><b>Default browser</b><small>${S.isDefault ? 'Links you open from other apps open in Aura.' : S.packaged ? 'macOS asks you to confirm.' : 'Works from the installed Aura.app, not a development run.'}</small></span>${S.isDefault ? `<span class="ok">${icon('check', 14)}Aura is your default</span>` : `<button class="btn pri" data-act="default">Make Aura the default</button>`}</div>
    <div class="set"><span><b>Search engine</b><small>Used by the command bar, Daily and the address.</small></span><select data-sel="search">${S.engines.map(e => `<option value="${e.id}" ${s.search === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="set"><span><b>Chrome</b><small>Websites keep their own colours.</small></span>${seg('theme', ui.theme, [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match macOS']])}</div>
    <div class="set"><span><b>Sidebar</b><small>${isMac ? '⌘⇧1, ⌘⇧2 and ⌘⇧3 switch between these.' : ''}</small></span>${seg('sidebar', ui.sidebar, [['full', 'Always show'], ['icons', 'Icons'], ['hidden', 'Hide']])}</div>
    <div class="set"><span><b>Keep the toolbar showing</b><small>Off: point at the top edge to bring it back.</small></span>${tog(ui.toolbar, 'ui.toolbar')}</div>
  </section>`;

  h += `<section id="spaces"><h2>Spaces</h2><p>Each Space keeps its own tabs, logins and theme, like a separate account. ⌃1 to ⌃4 switch between the first four. Right-click a Space in the sidebar to delete it.</p>
    ${S.spaces.map(sp => `<div class="sp"><span class="bd" style="color:${S.colours[sp.color]}"><svg class="i" viewBox="0 0 24 24"><path d="${SPACE_PATHS[sp.icon] || SPACE_PATHS.star}"/></svg></span>
      <input type="text" value="${esc(sp.name)}" data-spname="${sp.id}" maxlength="40" spellcheck="false">
      <div class="dots">${Object.entries(S.colours).map(([k, hex]) => `<button class="${sp.color === k ? 'on' : ''}" style="background:${hex}" data-spcol="${sp.id}" data-v="${k}" title="${k}"></button>`).join('')}</div>
      <span style="color:var(--mute);font-size:12px;width:70px;text-align:right">${sp.color === 'graphite' ? 'No tint' : 'Tint ' + (sp.tint ?? 24)}</span></div>`).join('')}
  </section>`;

  h += `<section id="passwords"><h2>Passwords</h2><p>Aura offers to save a password when you sign in, and fills it next time on the same site. They're encrypted with a key kept in your macOS Keychain and never leave this Mac.</p>
    ${S.pwOk ? '' : `<div class="note"><b>Keychain isn't available.</b> Aura can't store passwords safely right now, so it won't offer to.</div>`}
    ${pw.length ? pw.map(p => { let host = p.origin; try { host = new URL(p.origin).hostname; } catch (e) {} return `<div class="pw"><b class="trunc">${esc(host)}</b><span class="trunc">${esc(p.username || '(no username)')}</span><span class="a"><span style="min-width:110px;text-align:right">${revealed[p.id] ? esc(revealed[p.id]) : '••••••••'}</span><button class="btn sm" data-pw="reveal" data-id="${p.id}">${revealed[p.id] ? 'Hide' : 'Show'}</button><button class="btn sm" data-pw="copy" data-id="${p.id}">${icon('copy', 13)}</button><button class="btn sm" data-pw="remove" data-id="${p.id}">${icon('trash', 13)}</button></span></div>`; }).join('') : `<div class="note">No saved passwords yet.</div>`}
    <div class="row"><button class="btn" data-act="import">Import from a CSV…</button></div>
    <div class="note" style="margin-top:14px"><b>Coming from 1Password, Chrome or Safari?</b> Export your logins as a CSV (1Password: File, Export; Chrome: Password Manager, Settings, Export; Safari: File, Export, Passwords), import it here, then delete the CSV. The 1Password browser extension relies on Chrome features Electron doesn't have, so it may not fill inside Aura; the 1Password Mac app's Universal Autofill (⌘\\) works in any app, Aura included.</div>
  </section>`;

  h += `<section id="extensions"><h2>Extensions</h2><p>Aura can run unpacked Chrome extensions. Download or build the extension, unzip it, then choose its folder (the one with manifest.json). Not every Chrome extension works: Electron supports a subset of extension APIs.</p>
    ${exts.length ? exts.map(x => `<div class="set"><span><b>${esc(x.name)} ${x.version ? `<span style="color:var(--mute);font-weight:400">${esc(x.version)}</span>` : ''}</b><small class="trunc">${esc(x.path)}${x.loaded ? '' : ' · couldn’t load'}</small></span><button class="btn sm" data-ext="${esc(x.path)}">Remove</button></div>`).join('') : `<div class="note">No extensions added.</div>`}
    <div class="row"><button class="btn" data-act="ext">Add an unpacked extension…</button></div>
  </section>`;

  h += `<section id="privacy"><h2>Privacy</h2><p>Aura remembers saves, never what you browse, unless you keep history on. Everything is stored on this Mac in ${esc(S.userData)}.</p>
    <div class="set"><span><b>Keep history</b><small>Used by History (⌘Y) and the command bar's suggestions.</small></span>${tog(s.keepHistory, 'settings.keepHistory')}</div>
    <div class="set"><span><b>Clear history and cache</b><small>Logins and saves stay.</small></span><button class="btn" data-act="clearHist">Clear</button></div>
    <div class="set"><span><b>Clear cookies and site data in every Space</b><small>Signs you out of every site.</small></span><button class="btn" data-act="clearSites">Clear…</button></div>
  </section>`;

  const K = (k, d) => `<div><kbd>${k}</kbd></div><div>${d}</div>`;
  h += `<section id="shortcuts"><h2>Shortcuts</h2><p>Shown at the end of each tab row when the pointer is over the sidebar.</p><div class="keys">
    ${K('⌘T', 'New tab (Daily)')}${K('⌘W', 'Close tab')}${K('⌘⇧T', 'Reopen closed tab')}${K('⌘1 to ⌘9', 'Go to tab 1 to 9, top to bottom')}${K('⌃1 to ⌃4', 'Switch Space')}
    ${K('⌘K', 'Find: address, tabs or a save described in words')}${K('⌘L', 'Edit the address')}${K('⌘F', 'Find in page')}${K('⌘[ and ⌘]', 'Back and forward')}${K('⌘R', 'Reload')}
    ${K('⌘S', 'Save the whole view')}${K('⌘⇧S', 'Save this look')}${K('⌥⌘T', 'Save a typeface')}${K('⌥⌘C', 'Save a colour')}${K('⌘⇧A', 'Save an area')}${K('⌘I', 'This page panel')}${K('⌘⇧O', 'Library')}
    ${K('⌘D', 'Pin or unpin the tab')}${K('⌘⇧1 / 2 / 3', 'Sidebar: always, icons, hidden')}${K('⌘\\', 'Show or hide the sidebar')}${K('⌘⇧L', 'Keep the toolbar showing')}${K('⌘⇧N', 'New Space')}
    ${K('⌘Y', 'History')}${K('⌥⌘L', 'Downloads')}${K('⌥⌘I', 'Developer tools')}${K('⌘,', 'Settings')}</div></section>`;

  h += `<section id="about"><h2>About</h2><p>Aura ${esc(S.version)}, built on Electron ${esc(S.electron)} (Chromium ${esc(S.chrome)}).</p></section>`;
  $('#in').innerHTML = h;
  if (location.hash) { const el = document.querySelector(location.hash); if (el) el.scrollIntoView(); }
  spy();
}

function spy() {
  const ids = SECTIONS.map(x => x[0]);
  let cur = ids[0];
  for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === cur));
}
$('#main').addEventListener('scroll', spy);

async function setv(path, v) {
  const [grp, key] = path.split('.');
  await A.call('settings:set', { [grp]: { [key]: v } });
  await load();
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tog]');
  if (t) { const [g, k] = t.dataset.tog.split('.'); return setv(t.dataset.tog, !S[g][k]); }
  const sg = e.target.closest('[data-seg]');
  if (sg) return setv('ui.' + sg.dataset.seg, sg.dataset.v);
  const c = e.target.closest('[data-spcol]');
  if (c) { await A.call('space:update', { id: c.dataset.spcol, color: c.dataset.v }); return load(); }
  const p = e.target.closest('[data-pw]');
  if (p) {
    const id = p.dataset.id;
    if (p.dataset.pw === 'reveal') { revealed[id] = revealed[id] ? null : await A.call('pw:reveal', { id }); draw(); }
    if (p.dataset.pw === 'copy') { A.call('copy', { text: await A.call('pw:reveal', { id }) }); p.innerHTML = icon('check', 13); }
    if (p.dataset.pw === 'remove') { if (confirm('Delete this saved password?')) { await A.call('pw:remove', { id }); load(); } }
    return;
  }
  const x = e.target.closest('[data-ext]');
  if (x) { await A.call('ext:remove', { path: x.dataset.ext }); return load(); }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'default') { await A.call('default:set'); setTimeout(load, 1500); }
  if (a.dataset.act === 'import') { const n = await A.call('pw:import'); if (n) alert(n + (n === 1 ? ' password' : ' passwords') + ' imported.'); load(); }
  if (a.dataset.act === 'ext') { const r = await A.call('ext:add'); if (r && r.error) alert(r.error); load(); }
  if (a.dataset.act === 'clearHist') { await A.call('hist:clear', { cache: true }); a.textContent = 'Cleared'; }
  if (a.dataset.act === 'clearSites') { if (confirm('Clear cookies and site data in every Space? You’ll be signed out of every site.')) { await A.call('clear-site-data'); a.textContent = 'Cleared'; } }
});
document.addEventListener('change', (e) => { if (e.target.dataset.sel) setv('settings.' + e.target.dataset.sel, e.target.value); });
document.addEventListener('focusout', async (e) => { if (e.target.dataset.spname) { await A.call('space:update', { id: e.target.dataset.spname, name: e.target.value.trim() || 'Space' }); } });
document.addEventListener('keydown', (e) => { if (e.target.dataset && e.target.dataset.spname && e.key === 'Enter') e.target.blur(); });
A.on(w => { if (w === 'theme') load(); });
load();
