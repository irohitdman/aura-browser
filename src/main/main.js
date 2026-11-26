// Aura: a browser for designers. Main process entry.
const path = require('path');
const fs = require('fs');
const { app, protocol, ipcMain, Menu, shell, clipboard, dialog, session, nativeTheme } = require('electron');

app.setName('Aura');
if (process.env.AURA_USER_DATA) app.setPath('userData', process.env.AURA_USER_DATA);
protocol.registerSchemesAsPrivileged([
  { scheme: 'aura', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

// Sites treat Electron's user agent as an unknown browser; present as the Chrome it is built on.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Aura|aura-browser)\/[\d.]+/i, '').replace(/\sElectron\/[\d.]+/, '');

const { openState, uid, SEARCH, toUrl } = require('./state');
const { Library, lookToCss } = require('./library');
const { History, Downloads, Passwords } = require('./records');
const { Browser, NEWTAB } = require('./browser');
const { tokens, SPACE_COLOURS, SPACE_ICONS } = require('./theme');
const { AI } = require('./ai');
const { Daily } = require('./feeds');
const taste = require('./taste');
const webstore = require('./webstore');

let B = null;
const pending = [];

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  const url = argv.find(a => /^https?:\/\//.test(a));
  if (B && B.win) { if (url) B.newTab({ url }); if (B.win.isMinimized()) B.win.restore(); B.win.focus(); }
});
// Links opened from other apps when Aura is the default browser.
app.on('open-url', (e, url) => {
  e.preventDefault();
  if (B && B.win) { B.newTab({ url }); B.win.focus(); } else pending.push(url);
});
app.on('open-file', (e, file) => {
  e.preventDefault();
  const url = 'file://' + file;
  if (B && B.win) B.newTab({ url }); else pending.push(url);
});

app.whenReady().then(() => {
  const state = openState();
  migrate(state.data);
  const daily = new Daily();
  B = new Browser({ state, library: new Library(), history: new History(), downloads: new Downloads(), passwords: new Passwords(), ai: new AI(), daily });
  daily.onChange = () => B.broadcastInternal('daily');
  B.protocolHandler(session.defaultSession);
  buildMenu();
  wireIpc();
  B.open();
  pending.splice(0).forEach(u => B.newTab({ url: u }));
  // First run: bring bookmarks over and find a taste. Skippable, and never shown again once done or skipped.
  if (!B.d.settings.onboarded && !process.env.AURA_DRIVE) B.navigate('aura://welcome/');
  setTimeout(() => daily.refresh().catch(() => {}), 1500);
  setInterval(() => daily.refresh().catch(() => {}), 60 * 60 * 1000);
  if (process.env.AURA_DRIVE) startDriver(process.env.AURA_DRIVE);
  nativeTheme.on('updated', () => { if (B.d.ui.theme === 'system') { B.push(); B.broadcastInternal('theme'); } });
  app.on('activate', () => { if (!B.win) B.open(); });
});

// Older saved state: extensions were plain folder paths, the panel was on or off.
function migrate(d) {
  d.settings.extensions = (d.settings.extensions || []).map(x => typeof x === 'string' ? { path: x, name: path.basename(x), spaces: 'all', on: true } : x);
  if (d.ui.panel === true) d.ui.panel = 'inspect';
  d.ui.toolbar = true;
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (B) B.state.save(true); });

// ---------- shortcuts ----------
function buildMenu() {
  const go = (fn) => () => { if (B && B.win) fn(); };
  const wc = () => B.wc();
  const spaceKeys = [1, 2, 3, 4].map(n => ({ label: 'Space ' + n, accelerator: 'Ctrl+' + n, click: go(() => { const s = B.d.spaces[n - 1]; if (s) B.switchSpace(s.id); }) }));
  const tabKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: 'Tab ' + n, accelerator: 'CmdOrCtrl+' + n, visible: false, click: go(() => { const list = B.orderedItems(); const it = n === 9 ? list[list.length - 1] : list[n - 1]; if (it) B.activate(it.id); }) }));
  const tmpl = [
    { label: 'Aura', submenu: [
      { role: 'about', label: 'About Aura' },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: go(() => openInternal('settings')) },
      { label: 'Make Aura the default browser', click: go(() => makeDefault()) },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide', label: 'Hide Aura' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { role: 'quit', label: 'Quit Aura' }
    ] },
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: go(() => B.newTab()) },
      { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: go(() => B.newTab()) },
      { label: 'New Space', accelerator: 'CmdOrCtrl+Shift+N', click: go(() => shellCmd('newspace')) },
      { label: 'New Folder', click: go(() => B.folderCreate()) },
      { label: 'Open Location…', accelerator: 'CmdOrCtrl+L', click: go(() => shellCmd('address')) },
      { label: 'Command bar', accelerator: 'CmdOrCtrl+K', click: go(() => shellCmd('cmd')) },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: go(() => B.closeTab()) },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: go(() => B.reopenClosed()) },
      { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: go(() => B.win.close()) },
      { type: 'separator' },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: go(() => wc() && wc().print()) }
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: go(() => shellCmd('find')) },
      { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: go(() => findStep(true)) },
      { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: go(() => findStep(false)) },
      { label: 'Copy Page Address', accelerator: 'CmdOrCtrl+Shift+C', visible: false, click: go(() => wc() && clipboard.writeText(wc().getURL())) }
    ] },
    { label: 'Save', submenu: [
      { label: 'Whole view', accelerator: 'CmdOrCtrl+S', click: go(() => B.save('page')) },
      { label: 'This look', accelerator: 'CmdOrCtrl+Shift+S', click: go(() => B.save('look')) },
      { type: 'separator' },
      { label: 'A typeface', accelerator: 'Alt+CmdOrCtrl+T', click: go(() => B.save('type')) },
      { label: 'A colour', accelerator: 'Alt+CmdOrCtrl+C', click: go(() => B.save('colour')) },
      { label: 'An area', accelerator: 'CmdOrCtrl+Shift+A', click: go(() => B.save('area')) },
      { type: 'separator' },
      { label: 'Library', accelerator: 'CmdOrCtrl+Shift+O', click: go(() => openInternal('library')) }
    ] },
    { label: 'View', submenu: [
      { label: 'Inspect this page', accelerator: 'CmdOrCtrl+I', click: go(() => togglePanel('inspect')) },
      { label: 'Ask about this page', accelerator: 'CmdOrCtrl+J', click: go(() => togglePanel('ask')) },
      { label: 'Split view', accelerator: 'CmdOrCtrl+Shift+\\', click: go(() => B.split() ? B.unsplit() : B.splitWith()) },
      { type: 'separator' },
      { label: 'Sidebar: always show', accelerator: 'CmdOrCtrl+Shift+1', click: go(() => setUi({ sidebar: 'full' })) },
      { label: 'Sidebar: collapse to icons', accelerator: 'CmdOrCtrl+Shift+2', click: go(() => setUi({ sidebar: 'icons' })) },
      { label: 'Sidebar: hide', accelerator: 'CmdOrCtrl+Shift+3', click: go(() => setUi({ sidebar: 'hidden' })) },
      { label: 'Toggle sidebar', accelerator: 'CmdOrCtrl+\\', click: go(() => setUi({ sidebar: B.d.ui.sidebar === 'full' ? 'hidden' : 'full' })) },
      { type: 'separator' },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: go(() => wc() && wc().reload()) },
      { label: 'Hard Reload', accelerator: 'CmdOrCtrl+Shift+R', click: go(() => wc() && wc().reloadIgnoringCache()) },
      { label: 'Stop', accelerator: 'Esc', visible: false, acceleratorWorksWhenHidden: false, click: go(() => wc() && wc().isLoading() && wc().stop()) },
      { type: 'separator' },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: go(() => { if (wc()) { wc().setZoomLevel(0); B.push(); } }) },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: go(() => zoom(0.5)) },
      { label: 'Zoom In ', accelerator: 'CmdOrCtrl+Plus', visible: false, click: go(() => zoom(0.5)) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: go(() => zoom(-0.5)) },
      { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'Alt+CmdOrCtrl+I', click: go(() => wc() && wc().toggleDevTools()) },
      { label: 'View Source', accelerator: 'Alt+CmdOrCtrl+U', click: go(() => wc() && B.newTab({ url: 'view-source:' + wc().getURL() })) },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ] },
    { label: 'History', submenu: [
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: go(() => wc() && wc().navigationHistory.goBack()) },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: go(() => wc() && wc().navigationHistory.goForward()) },
      { label: 'Back ', accelerator: 'CmdOrCtrl+Left', visible: false, click: go(() => wc() && wc().navigationHistory.goBack()) },
      { label: 'Forward ', accelerator: 'CmdOrCtrl+Right', visible: false, click: go(() => wc() && wc().navigationHistory.goForward()) },
      { type: 'separator' },
      { label: 'Show All History', accelerator: 'CmdOrCtrl+Y', click: go(() => openInternal('history')) },
      { label: 'Downloads', accelerator: 'Alt+CmdOrCtrl+L', click: go(() => openInternal('downloads')) }
    ] },
    { label: 'Spaces', submenu: spaceKeys.concat([{ type: 'separator' }, { label: 'New Space…', click: go(() => shellCmd('newspace')) }]) },
    { label: 'Tabs', submenu: [
      { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: go(() => cycle(1)) },
      { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: go(() => cycle(-1)) },
      { label: 'Next Tab ', accelerator: 'Alt+CmdOrCtrl+Down', visible: false, click: go(() => cycle(1)) },
      { label: 'Previous Tab ', accelerator: 'Alt+CmdOrCtrl+Up', visible: false, click: go(() => cycle(-1)) },
      { label: 'Pin or Unpin Tab', accelerator: 'CmdOrCtrl+D', click: go(() => { const c = B.current(); if (c) { const l = B.locate(c.id); B.move(c.id, { where: l.where === 'pins' ? 'today' : 'pins' }); } }) },
      { type: 'separator' }
    ].concat(tabKeys) },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Keyboard shortcuts', click: go(() => openInternal('settings', '#shortcuts')) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tmpl));
}

function shellCmd(cmd, arg) { if (B && B.shell) { B.shell.webContents.focus(); B.shell.webContents.send('cmd', cmd, arg); } }
function setUi(patch) { Object.assign(B.d.ui, patch); B.state.save(); B.layout(true); }
function togglePanel(kind) {
  B.d.ui.panel = B.d.ui.panel === kind ? false : kind;
  B.state.save(); B.layout(true);
  const t = B.currentTab();
  if (kind === 'ask' && B.d.ui.panel === 'ask' && t) B.pageText(t).catch(() => {});
  if (kind === 'inspect' && B.d.ui.panel === 'inspect' && t) B.readLook(t).catch(() => {});
}
function zoom(d) { const w = B.wc(); if (w) { w.setZoomLevel(Math.max(-5, Math.min(5, w.getZoomLevel() + d))); B.push(); } }
function cycle(d) {
  const list = B.orderedItems(); const c = B.current();
  if (!list.length) return;
  const i = c ? list.findIndex(x => x.id === c.id) : -1;
  B.activate(list[(i + d + list.length) % list.length].id);
}
function findStep(fwd) {
  const t = B.currentTab();
  if (t && t.find && t.find.text) t.view.webContents.findInPage(t.find.text, { forward: fwd, findNext: true });
  else shellCmd('find');
}
function openInternal(page, hash = '') {
  const url = 'aura://' + page + '/' + hash;
  const existing = B.orderedItems().find(i => i.url && i.url.startsWith('aura://' + page + '/'));
  if (existing) { B.activate(existing.id); if (hash) { const t = B.tabs.get(existing.id); t && t.view.webContents.loadURL(url); } }
  else {
    const c = B.current();
    if (c && /^aura:\/\/newtab/.test(c.url)) B.navigate(url); else B.newTab({ url });
  }
}
function isDefault() { return app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http'); }
function makeDefault() {
  // macOS asks the person to confirm. Unpackaged dev runs register Electron itself, so only packaged builds take.
  const a = app.setAsDefaultProtocolClient('http');
  const b = app.setAsDefaultProtocolClient('https');
  if (!app.isPackaged) B.flash({ icon: 'info', title: 'Default browser needs the packaged app', text: 'Open Aura.app from Applications and try again.' }, 6000);
  return a && b;
}

// ---------- IPC ----------
function wireIpc() {
  const fromShell = (e) => B && B.shell && e.sender === B.shell.webContents;
  const fromInternal = (e) => { try { return new URL(e.senderFrame.url).protocol === 'aura:'; } catch (_) { return false; } };

  ipcMain.handle('shell', async (e, type, a = {}) => {
    if (!fromShell(e)) return null;
    const wcx = B.wc();
    switch (type) {
      case 'navigate': return B.navigate(a.url, a);
      case 'back': return wcx && wcx.navigationHistory.goBack();
      case 'forward': return wcx && wcx.navigationHistory.goForward();
      case 'reload': return wcx && (wcx.isLoading() ? wcx.stop() : wcx.reload());
      case 'newTab': return B.newTab(a);
      case 'close': return B.closeTab(a.id);
      case 'activate': return B.activate(a.id);
      case 'tabMenu': return B.tabMenu(a.id);
      case 'move': return B.move(a.id, a.to);
      case 'space': return B.switchSpace(a.id);
      case 'spaceCreate': {
        const s = { id: uid('sp'), name: (a.name || 'New Space').slice(0, 40), icon: a.icon || 'star', color: a.color || 'graphite', tint: a.tint ?? 24 };
        B.d.spaces.push(s); B.sp(s.id); B.state.save(); buildMenu(); B.switchSpace(s.id); return s;
      }
      case 'spaceUpdate': {
        const s = B.space(a.id); if (!s) return;
        ['name', 'icon', 'color', 'tint'].forEach(k => { if (a[k] !== undefined) s[k] = a[k]; });
        B.state.save(); B.layout(); B.broadcastInternal('theme'); buildMenu(); return s;
      }
      case 'spaceDelete': {
        if (B.d.spaces.length < 2) return;
        const r = await dialog.showMessageBox(B.win, { type: 'warning', buttons: ['Delete Space', 'Cancel'], defaultId: 1, cancelId: 1, message: `Delete the ${B.space(a.id).name} Space?`, detail: 'Its pins, folders and tabs go, and so do the logins kept in it. Saves in your Library stay.' });
        if (r.response !== 0) return;
        for (const it of B.orderedItems(a.id)) { const t = B.tabs.get(it.id); if (t) { B.win.contentView.removeChildView(t.view); t.view.webContents.close(); B.tabs.delete(it.id); } }
        B.d.spaces = B.d.spaces.filter(s => s.id !== a.id); delete B.d.sp[a.id];
        session.fromPartition('persist:space-' + a.id).clearStorageData().catch(() => {});
        B.sessions.delete(a.id);
        if (B.d.active === a.id) B.switchSpace(B.d.spaces[0].id);
        B.state.save(); buildMenu(); B.push(); return true;
      }
      case 'folderCreate': return B.folderCreate(a.name);
      case 'folderUpdate': { const f = B.sp().folders.find(x => x.id === a.id); if (f) { if (a.name !== undefined) f.name = a.name.slice(0, 60) || 'Folder'; if (a.open !== undefined) f.open = a.open; B.rt.renameFolder = null; B.state.save(); B.push(); } return; }
      case 'folderDelete': { const sp = B.sp(); const f = sp.folders.find(x => x.id === a.id); if (f) { sp.today.push(...f.items); sp.folders = sp.folders.filter(x => x !== f); B.state.save(); B.push(); } return; }
      case 'folderMenu': {
        const f = B.sp().folders.find(x => x.id === a.id); if (!f) return;
        Menu.buildFromTemplate([
          { label: 'Rename', click: () => { B.rt.renameFolder = f.id; B.push(); } },
          { label: 'Open all', click: () => f.items.forEach(i => B.ensureView(i, B.d.active)) },
          { label: 'Put all to sleep', click: () => f.items.forEach(i => B.sleep(i.id)) },
          { type: 'separator' },
          { label: 'Delete folder (keep tabs)', click: () => { const sp = B.sp(); sp.today.push(...f.items); sp.folders = sp.folders.filter(x => x !== f); B.state.save(); B.push(); } }
        ]).popup({ window: B.win });
        return;
      }
      case 'ui': {
        if (a.panel !== undefined) { togglePanel(a.panel || B.d.ui.panel); delete a.panel; }
        if (Object.keys(a).length) { Object.assign(B.d.ui, a); B.state.save(); B.layout(a.sidebar !== undefined); if (a.theme) B.broadcastInternal('theme'); }
        return;
      }
      case 'ask': return B.ask(a);
      case 'askStop': return B.stopAsk();
      case 'askClear': return B.clearAsk();
      case 'split': return a.id ? B.splitWith(a.id) : (B.split() ? B.unsplit() : B.splitWith());
      case 'unsplit': return B.unsplit();
      case 'swapSplit': return B.swapSplit();
      case 'extOpen': return extOpen(a.path);
      case 'extMenu': return extMenu(a.path);
      case 'storeFetch': {
        const id = webstore.storeId(B.wc() && B.wc().getURL());
        if (!id) return { error: 'Open an extension’s page in the Chrome Web Store first.' };
        try { B.rt.install = Object.assign({ storeId: id }, await webstore.fetchExtension(id)); B.push(); return B.rt.install; }
        catch (e) { return { error: 'Couldn’t download it: ' + e.message }; }
      }
      case 'storeInstall': {
        const x = B.rt.install; if (!x) return;
        const rec = { path: x.path, name: x.name, version: x.version, icon: x.icon, popup: x.popup, storeId: x.storeId, spaces: a.spaces === 'all' ? 'all' : [B.d.active], on: true };
        B.d.settings.extensions = B.d.settings.extensions.filter(e => e.storeId !== x.storeId && e.path !== x.path).concat([rec]);
        B.state.save(); B.rt.install = null; B.syncExtensions(); broadcastExt();
        B.flash({ icon: 'check', title: x.name + ' added', text: rec.spaces === 'all' ? 'In every Space' : 'In ' + B.space().name + ' only', saved: true }, 5000);
        return true;
      }
      case 'storeCancel': B.rt.install = null; B.push(); return;
      case 'overlay': return B.overlay(!!a.on);
      case 'find': {
        const t = B.currentTab(); if (!t) return;
        if (!a.text) { t.find = { text: '', matches: 0, active: 0 }; t.view.webContents.stopFindInPage('clearSelection'); B.push(); return; }
        const fresh = !t.find || t.find.text !== a.text;
        t.find = Object.assign(t.find || {}, { text: a.text });
        t.view.webContents.findInPage(a.text, { forward: a.forward !== false, findNext: !fresh });
        return;
      }
      case 'findStop': { const t = B.currentTab(); if (t) { t.find = null; t.view.webContents.stopFindInPage('keepSelection'); t.view.webContents.focus(); B.push(); } return; }
      case 'save': return B.save(a.kind);
      case 'saveMenu': return;
      case 'copy': clipboard.writeText(String(a.text || '')); return true;
      case 'copyCss': { const t = B.currentTab(); if (t && t.look) { clipboard.writeText(lookToCss(t.look)); B.flash({ icon: 'check', title: 'Copied as CSS', text: (t.look.colours || []).length + ' colours, ' + (t.look.faces || []).length + ' faces' }, 3000); } return; }
      case 'commands': return B.commandResults(a.q);
      case 'findText': { const t = B.currentTab(); if (t) { t.find = { text: a.text, matches: 0, active: 0 }; t.view.webContents.findInPage(a.text); B.push(); } return; }
      case 'run': return runAction(a.action);
      case 'focusPage': { const t = B.currentTab(); if (t) t.view.webContents.focus(); return; }
      case 'unflash': return B.unflash();
      case 'pwSave': { B.passwords.save(a.origin, a.username, a.password); B.unflash(); return; }
      case 'pwNever': { B.passwords.never(a.origin); B.unflash(); return; }
      case 'menuSpace': {
        const s = B.space(a.id); if (!s) return;
        Menu.buildFromTemplate([
          { label: 'Edit Space…', click: () => shellCmd('editspace', s.id) },
          { label: 'Delete Space…', enabled: B.d.spaces.length > 1, click: () => B.shell.webContents.send('cmd', 'deletespace', s.id) }
        ]).popup({ window: B.win });
        return;
      }
      case 'internal': return openInternal(a.page, a.hash || '');
      case 'default': return makeDefault();
    }
  });

  // Internal pages: Daily, Library, History, Downloads, Settings.
  ipcMain.handle('aura', async (e, type, a = {}) => {
    if (!fromInternal(e)) return null;
    switch (type) {
      case 'theme': {
        const t = B.tabs && [...B.tabs.values()].find(x => x.view.webContents === e.sender);
        return B.theme(t ? t.space : B.d.active);
      }
      case 'open': return a.newTab ? B.newTab({ url: toUrl(a.url, B.d.settings.search) }) : (() => { const t = [...B.tabs.values()].find(x => x.view.webContents === e.sender); if (t) { const l = B.locate(t.id); if (l) l.item.url = a.url; e.sender.loadURL(toUrl(a.url, B.d.settings.search)); } })();
      case 'command': return shellCmd('cmd');
      case 'lib:list': {
        const list = B.library.search(a.q, a.kind, a.space);
        return { saves: list, counts: B.library.counts(), spaces: B.d.spaces };
      }
      case 'lib:get': return B.library.get(a.id);
      case 'lib:remove': { const r = B.library.remove(a.id); B.broadcastInternal('library'); B.push(); return r; }
      case 'lib:update': { const r = B.library.update(a.id, { title: a.title, note: a.note }); B.broadcastInternal('library'); return r; }
      case 'lib:css': { const s = B.library.get(a.id); if (s && s.look) { clipboard.writeText(lookToCss(s.look, s.title)); return true; } return false; }
      case 'lib:reveal': return shell.showItemInFolder(B.library.file(a.id, 'shot.png'));
      case 'lib:export': {
        const s = B.library.get(a.id); if (!s) return;
        const r = await dialog.showSaveDialog(B.win, { defaultPath: (s.title || 'save').replace(/[^\w\- ]+/g, '').slice(0, 60) + '.png' });
        if (!r.canceled && r.filePath) fs.copyFileSync(B.library.file(a.id, 'shot.png'), r.filePath);
        return true;
      }
      case 'copy': clipboard.writeText(String(a.text || '')); return true;
      case 'hist:query': return B.history.query(a.q, a.limit || 500);
      case 'hist:remove': return B.history.remove(a.url);
      case 'hist:clear': {
        B.history.clear(a.since);
        if (a.cache) for (const s of B.d.spaces) await B.sessionFor(s.id).clearCache();
        return true;
      }
      case 'dl:list': return B.downloads.list().map(d => Object.assign({ exists: d.path ? fs.existsSync(d.path) : false }, d));
      case 'dl:open': { const d = B.downloads.list().find(x => x.id === a.id); if (d) shell.openPath(d.path); return; }
      case 'dl:show': { const d = B.downloads.list().find(x => x.id === a.id); if (d) shell.showItemInFolder(d.path); return; }
      case 'dl:cancel': return B.downloads.cancel(a.id);
      case 'dl:remove': B.downloads.remove(a.id); return;
      case 'dl:clear': B.downloads.clear(); return;
      case 'settings:get': return {
        settings: B.d.settings, ui: B.d.ui, spaces: B.d.spaces, engines: Object.entries(SEARCH).map(([k, v]) => ({ id: k, name: v.name })),
        isDefault: isDefault(), packaged: app.isPackaged, version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
        icons: SPACE_ICONS, colours: SPACE_COLOURS, pwOk: B.passwords.ok(), userData: app.getPath('userData')
      };
      case 'settings:set': {
        if (a.settings) Object.assign(B.d.settings, a.settings);
        if (a.ui) Object.assign(B.d.ui, a.ui);
        B.state.save(); B.layout(); if (a.ui && a.ui.theme) B.broadcastInternal('theme');
        return true;
      }
      case 'space:update': {
        const s = B.space(a.id); if (!s) return;
        ['name', 'icon', 'color', 'tint'].forEach(k => { if (a[k] !== undefined) s[k] = a[k]; });
        B.state.save(); B.layout(); B.broadcastInternal('theme'); buildMenu(); return s;
      }
      case 'default:set': return makeDefault();
      case 'pw:list': return B.passwords.list();
      case 'pw:reveal': return B.passwords.reveal(a.id);
      case 'pw:remove': return B.passwords.remove(a.id);
      case 'pw:import': {
        const r = await dialog.showOpenDialog(B.win, { properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }], message: 'Choose a passwords CSV exported from Chrome, 1Password or another manager' });
        if (r.canceled || !r.filePaths[0]) return 0;
        return B.passwords.importCsv(fs.readFileSync(r.filePaths[0], 'utf8'));
      }
      case 'ext:add': {
        const r = await dialog.showOpenDialog(B.win, { properties: ['openDirectory'], message: 'Choose an unpacked Chrome extension folder (it has a manifest.json)' });
        if (r.canceled || !r.filePaths[0]) return null;
        const p = r.filePaths[0];
        let manifest;
        try { manifest = JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8')); } catch (e) { return { error: 'That folder has no readable manifest.json.' }; }
        if (!B.d.settings.extensions.some(x => x.path === p)) {
          const icon = webstore.iconOf(p, manifest);
          let iconData = null; try { if (icon) iconData = 'data:image/png;base64,' + fs.readFileSync(icon).toString('base64'); } catch (e) {}
          B.d.settings.extensions.push({ path: p, name: webstore.localised(p, manifest, manifest.name), version: manifest.version, icon: iconData, popup: (manifest.action || manifest.browser_action || {}).default_popup || null, spaces: 'all', on: true });
        }
        B.state.save(); B.syncExtensions();
        return { ok: true };
      }
      case 'ext:list': return B.d.settings.extensions.map(x => ({ path: x.path, name: x.name, version: x.version, icon: x.icon, spaces: x.spaces, on: x.on !== false, store: x.storeId || null }));
      case 'ext:update': {
        const x = B.d.settings.extensions.find(e => e.path === a.path); if (!x) return false;
        if (a.on !== undefined) x.on = !!a.on;
        if (a.spaces !== undefined) x.spaces = a.spaces === 'all' ? 'all' : (Array.isArray(a.spaces) ? a.spaces.filter(id => B.space(id)) : x.spaces);
        B.state.save(); B.syncExtensions(); return true;
      }
      case 'ext:remove': {
        const x = B.d.settings.extensions.find(e => e.path === a.path);
        B.d.settings.extensions = B.d.settings.extensions.filter(e => e.path !== a.path); B.state.save(); B.syncExtensions();
        if (x && x.storeId && x.path.startsWith(app.getPath('userData'))) fs.rm(x.path, { recursive: true, force: true }, () => {});
        return true;
      }
      // Daily
      case 'daily:get': return B.daily.get();
      case 'daily:refresh': return B.daily.refresh(true);
      // Aura Farming settings
      case 'ai:get': return B.ai.settings();
      case 'ai:set': B.ai.set(a); B.push(); return B.ai.settings();
      case 'ai:key': { const ok = B.ai.setKey(a.key); B.push(); return ok ? B.ai.settings() : { error: 'This Mac can’t store keys securely right now.' }; }
      // Onboarding
      case 'taste:sources': return taste.sources();
      case 'taste:load': {
        let text = null;
        const src = a.src;
        if (src.browser === 'file') {
          const r = await dialog.showOpenDialog(B.win, { properties: ['openFile'], filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }], message: 'Choose a bookmarks file exported from Safari, Firefox or another browser' });
          if (r.canceled || !r.filePaths[0]) return null;
          text = fs.readFileSync(r.filePaths[0], 'utf8');
        } else if (!taste.sources().some(x => x.id === src.id)) return null;
        const list = taste.load(src.browser === 'file' ? src : taste.sources().find(x => x.id === src.id), text);
        tasteSession.bookmarks = list;
        return { count: list.length, folders: [...new Set(list.map(b => b.folder).filter(Boolean))].length, candidates: taste.candidates(list) };
      }
      case 'taste:import': {
        const list = tasteSession.bookmarks || [];
        if (!list.length) return 0;
        const sp = B.sp(a.spaceId && B.space(a.spaceId) ? a.spaceId : B.d.active);
        const groups = new Map();
        for (const b of list.slice(0, 600)) { const k = b.folder || a.name || 'Bookmarks'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
        for (const [name, items] of groups) sp.folders.push({ id: uid('f'), name: name.slice(0, 60), open: false, items: items.map(b => ({ id: uid('t'), url: b.url, title: b.title, fav: null, ts: 0 })) });
        B.state.save(); B.push();
        return Math.min(list.length, 600);
      }
      case 'taste:visit': {
        const sender = e.sender;
        tasteSession.stop = { stopped: false };
        const sites = (a.sites || []).slice(0, 30).filter(x => /^https?:/.test(x.url));
        tasteSession.results = await taste.visit(sites, (r, n) => { if (!sender.isDestroyed()) sender.send('aura:changed', 'taste', { n, of: sites.length, site: { host: r.host, url: r.url, title: r.title, thumb: r.thumb, error: r.error, look: r.look ? { colours: r.look.colours, faces: r.look.faces, dark: r.look.dark, values: r.look.values } : null } }); }, tasteSession.stop);
        return tasteSession.results.length;
      }
      case 'taste:stop': if (tasteSession.stop) tasteSession.stop.stopped = true; return;
      case 'taste:compose': return taste.compose(tasteSession.results || [], a.answers || {}, a.words || []);
      case 'taste:save': {
        const t = [...B.tabs.values()].find(x => x.view.webContents === e.sender);
        const r = a.result;
        let image = null;
        if (t && a.rect) { try { image = await e.sender.capturePage({ x: Math.round(a.rect.x), y: Math.round(a.rect.y), width: Math.round(a.rect.width), height: Math.round(a.rect.height) }); } catch (err) {} }
        const look = { colours: r.palette.map(c => ({ hex: c.hex, role: c.role, from: c.from })), faces: r.type.map(f => ({ family: f.family, stack: f.stack, role: (f.roles[0] || 'Body'), weight: '', size: '', licence: (f.from || []).join(', '), from: f.from })), values: { radius: r.radius, measure: '', words: (r.words || []).join(', '), motion: r.motion }, dark: r.lean === 'Dark' };
        const rec = B.library.add({ kind: 'taste', title: 'My taste, ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), host: 'aura', url: 'aura://welcome/', look, taste: r, spaceId: B.d.active, spaceName: B.space().name }, image);
        B.d.settings.onboarded = true; B.d.settings.taste = rec.id; B.state.save();
        B.broadcastInternal('library'); B.push();
        return rec.id;
      }
      case 'onboarded': B.d.settings.onboarded = true; B.state.save(); return true;
      case 'clear-site-data': {
        for (const s of B.d.spaces) await B.sessionFor(s.id).clearStorageData();
        return true;
      }
    }
  });

  // Web pages: Explain, Summarise and Translate on selected text. Only from a real click, only from a tab.
  ipcMain.handle('web:ai', async (e, a) => {
    const t = [...B.tabs.values()].find(x => x.view.webContents === e.sender);
    if (!t || !a || !['explain', 'summarize', 'translate'].includes(a.action)) return { error: 'Not available here.' };
    if (!B.ai.hasKey()) return { error: 'nokey' };
    const res = await B.ai.ask({ action: a.action, selection: String(a.text || '').slice(0, 12000) }, (piece) => { if (!e.sender.isDestroyed()) e.sender.send('web:ai-chunk', a.n, piece); });
    return { text: res.text, error: res.error, model: B.ai.d.model };
  });
  ipcMain.handle('web:ai-ready', () => ({ ready: B.ai.hasKey() && B.ai.d.readSelection, lang: B.ai.d.lang }));
  ipcMain.on('web:ai-panel', (e, a) => {
    const t = [...B.tabs.values()].find(x => x.view.webContents === e.sender);
    if (t && B.currentTab() === t) B.ask({ q: 'About this passage: "' + String(a.text || '').slice(0, 2000) + '". ' + (a.q || 'Explain it in more depth.') });
  });

  // Web pages: only the password bridge, keyed by the frame's real origin.
  ipcMain.handle('web:pw-get', (e) => {
    const origin = e.senderFrame && e.senderFrame.origin;
    if (!origin || !/^https:/.test(origin)) return [];
    return B.passwords.forOrigin(origin);
  });
  ipcMain.on('web:pw-offer', (e, a) => {
    const origin = e.senderFrame && e.senderFrame.origin;
    if (!origin || !/^https:/.test(origin) || !a || !a.password) return;
    if (B.passwords.isNever(origin) || B.passwords.has(origin, a.username || '', a.password)) return;
    if (!B.passwords.ok()) return;
    B.flash({ icon: 'key', title: 'Save password?', text: (a.username ? a.username + ' on ' : '') + new URL(origin).hostname, pw: { origin, username: a.username || '', password: a.password } }, 20000);
  });
}

const tasteSession = {};

// Extensions: open the extension's own popup page in a small window under the toolbar.
function extOpen(p) {
  const x = B.d.settings.extensions.find(e => e.path === p);
  if (!x) return;
  const ses = B.sessionFor(B.d.active);
  const api = ses.extensions || ses;
  const loaded = api.getAllExtensions().find(l => l.path === p);
  if (!loaded) return B.flash({ icon: 'info', title: x.name + ' is off in this Space', text: 'Turn it on in Settings › Extensions.' }, 4000);
  if (!x.popup) return B.flash({ icon: 'info', title: x.name + ' works on the page', text: 'It has no menu of its own.' }, 3500);
  const { BrowserWindow } = require('electron');
  const b = B.win.getContentBounds();
  const pop = new BrowserWindow({ parent: B.win, x: b.x + b.width - 400, y: b.y + 44, width: 380, height: 520, frame: false, resizable: false, show: false, roundedCorners: true, backgroundColor: '#FFFFFF', webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  pop.loadURL(`chrome-extension://${loaded.id}/${x.popup.replace(/^\//, '')}`).catch(() => {});
  pop.once('ready-to-show', () => pop.show());
  pop.on('blur', () => { if (!pop.isDestroyed()) pop.close(); });
}
function extMenu(p) {
  const x = B.d.settings.extensions.find(e => e.path === p);
  if (!x) return;
  Menu.buildFromTemplate([
    { label: x.on === false ? 'Turn on' : 'Turn off', click: () => { x.on = x.on === false; B.state.save(); B.syncExtensions(); broadcastExt(); } },
    { label: 'Run in', submenu: [{ label: 'All Spaces', type: 'radio', checked: x.spaces === 'all', click: () => { x.spaces = 'all'; B.state.save(); B.syncExtensions(); broadcastExt(); } }].concat(B.d.spaces.map(sp => ({ label: sp.name + ' only', type: 'radio', checked: Array.isArray(x.spaces) && x.spaces.length === 1 && x.spaces[0] === sp.id, click: () => { x.spaces = [sp.id]; B.state.save(); B.syncExtensions(); broadcastExt(); } }))) },
    { type: 'separator' },
    { label: 'Manage extensions…', click: () => openInternal('settings', '#extensions') },
    { label: 'Remove ' + x.name, click: () => { B.d.settings.extensions = B.d.settings.extensions.filter(e => e !== x); B.state.save(); B.syncExtensions(); broadcastExt(); } }
  ]).popup({ window: B.win });
}
function broadcastExt() { B.broadcastInternal('extensions'); B.push(); }

function runAction(action) {
  if (!action) return;
  const [k, ...rest] = action.split(':');
  const v = rest.join(':');
  if (k === 'open') return v.startsWith('aura://') ? openInternal(v.slice(7).split('/')[0], v.split('/').slice(3).join('/')) : B.newTab({ url: v });
  if (k === 'save') return B.save(v);
  if (k === 'space') return B.switchSpace(v);
  if (k === 'ui') { const [key, val] = v.split(':'); return setUi({ [key]: val }); }
  if (k === 'undo-save') { B.library.remove(v); B.unflash(); B.broadcastInternal('library'); return; }
  if (k === 'dl-show') { const d = B.downloads.list().find(x => x.id === v); if (d) shell.showItemInFolder(d.path); return; }
  if (k === 'dl-open') { const d = B.downloads.list().find(x => x.id === v); if (d) shell.openPath(d.path); return; }
  if (k === 'cmd') {
    if (v === 'newtab') return B.newTab();
    if (v === 'panel' || v === 'inspect') return togglePanel('inspect');
    if (v === 'ask') return togglePanel('ask');
    if (v === 'split') return B.split() ? B.unsplit() : B.splitWith();
    if (v === 'extensions') return shellCmd('extensions');
    if (v === 'newfolder') return B.folderCreate();
    if (v === 'default') return makeDefault();
    if (v === 'newspace' || v === 'cmd') return shellCmd(v);
  }
}

// Development only: run steps written to a file, so the app can be tested headless.
function startDriver(file) {
  global.B = B; global.runAction = runAction; global.shellCmd = shellCmd; global.openInternal = openInternal;
  let pos = 0;
  setInterval(async () => {
    let txt = '';
    try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
    if (txt.length <= pos) return;
    const chunk = txt.slice(pos); pos = txt.length;
    for (const line of chunk.split('\n').filter(Boolean)) {
      try { const r = await eval('(async () => { return ' + line + ' })()'); fs.appendFileSync(file + '.out', JSON.stringify(r === undefined ? null : r).slice(0, 4000) + '\n'); }
      catch (e) { fs.appendFileSync(file + '.out', 'ERR ' + e.message + '\n'); }
    }
  }, 200);
}

module.exports = {};
