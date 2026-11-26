// The Aura window: one shell view (sidebar, toolbar, panels) and one view per live tab.
const path = require('path');
const fs = require('fs');
const { BaseWindow, WebContentsView, session, ipcMain, Menu, clipboard, shell, screen, dialog, app, nativeImage } = require('electron');
const { uid, emptySpace, toUrl, SEARCH } = require('./state');
const { tokens, SPACE_COLOURS, SPACE_ICONS } = require('./theme');
const { READ_LOOK, PICK_TYPE, PICK_AREA, PICK_COLOUR } = require('./extract');
const { lookToCss, KINDS } = require('./library');
const { READ_TEXT, PRESETS } = require('./ai');
const { storeId } = require('./webstore');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(__dirname, '..');
const SIDEBAR_W = 252, STRIP_W = 56, BAR_H = 40, PANEL_W = 340, GAP = 10;
const NEWTAB = 'aura://newtab/';
const INTERNAL_TITLES = { newtab: 'Daily', library: 'Library', history: 'History', downloads: 'Downloads', settings: 'Settings', welcome: 'Welcome to Aura', error: 'Page didn’t load' };
const ease = (t) => 1 - Math.pow(1 - t, 3);

class Browser {
  constructor(ctx) {
    Object.assign(this, ctx); // state, library, history, downloads, passwords
    this.d = this.state.data;
    this.tabs = new Map();       // item id -> { view, space, loading, audible, look, find }
    this.sessions = new Map();   // space id -> session
    this.rt = { overlay: false, revealSide: false, flash: null, downloadsActive: 0, focusAddress: 0 };
    this.shown = null; // frame currently on screen, for animated changes
    this.pushTimer = null;
    this.win = null;
  }

  // ---------- spaces and sessions ----------
  space(id = this.d.active) { return this.d.spaces.find(s => s.id === id); }
  sp(id = this.d.active) { if (!this.d.sp[id]) this.d.sp[id] = emptySpace(); return this.d.sp[id]; }
  theme(spaceId = this.d.active) {
    const mode = this.d.ui.theme === 'system' ? (require('electron').nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : this.d.ui.theme;
    return tokens(this.space(spaceId) || this.d.spaces[0], mode);
  }

  sessionFor(spaceId) {
    if (this.sessions.has(spaceId)) return this.sessions.get(spaceId);
    const ses = session.fromPartition('persist:space-' + spaceId);
    this.setupSession(ses, spaceId);
    this.sessions.set(spaceId, ses);
    return ses;
  }

  setupSession(ses, spaceId) {
    ses.setUserAgent(app.userAgentFallback);
    this.protocolHandler(ses);
    ses.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads');
      let name = item.getFilename();
      let target = path.join(dir, name);
      const ext = path.extname(name), base = path.basename(name, ext);
      for (let i = 1; fs.existsSync(target) && i < 500; i++) target = path.join(dir, `${base} (${i})${ext}`);
      item.setSavePath(target);
      this.rt.downloadsActive++;
      const rec = this.downloads.track(item, (r, done) => {
        if (done) {
          this.rt.downloadsActive = Math.max(0, this.rt.downloadsActive - 1);
          if (r.state === 'completed') {
            this.flash({ icon: 'download', title: 'Downloaded', text: path.basename(r.path), actions: [['Show in Finder', 'dl-show:' + r.id], ['Open', 'dl-open:' + r.id]] }, 8000);
            if (process.platform === 'darwin') app.dock.downloadFinished(r.path);
          }
        }
        this.broadcastInternal('downloads');
        this.push();
      });
      this.flash({ icon: 'download', title: 'Downloading', text: rec.name, actions: [['Downloads', 'open:aura://downloads/']] }, 4000);
    });
    // Extensions: from the Chrome Web Store or unpacked folders, each limited to the Spaces chosen for it.
    for (const x of this.d.settings.extensions || []) if (this.extIn(x, spaceId)) this.loadExt(ses, x);
  }
  extIn(x, spaceId) { return x.on !== false && (x.spaces === 'all' || (Array.isArray(x.spaces) && x.spaces.includes(spaceId))); }
  loadExt(ses, x) {
    const api = ses.extensions || ses;
    if (api.getAllExtensions().some(l => l.path === x.path)) return Promise.resolve();
    return api.loadExtension(x.path, { allowFileAccess: true }).then(l => { if (l && l.id && !x.extId) { x.extId = l.id; this.state.save(); } }).catch(e => console.warn('extension failed', x.path, e.message));
  }
  // Re-apply which Spaces each extension runs in.
  syncExtensions() {
    for (const [spaceId, ses] of this.sessions) {
      const api = ses.extensions || ses;
      for (const x of this.d.settings.extensions) {
        const loaded = api.getAllExtensions().find(l => l.path === x.path);
        if (this.extIn(x, spaceId) && !loaded) this.loadExt(ses, x);
        if (!this.extIn(x, spaceId) && loaded) api.removeExtension(loaded.id);
      }
      for (const l of api.getAllExtensions()) if (!this.d.settings.extensions.some(x => x.path === l.path)) api.removeExtension(l.id);
    }
    this.push();
  }

  protocolHandler(ses) {
    if (ses.protocol.isProtocolHandled('aura')) return;
    ses.protocol.handle('aura', (req) => {
      const u = new URL(req.url);
      let file;
      const p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') file = path.join(SRC, 'pages', (u.host === 'newtab' ? 'daily' : INTERNAL_TITLES[u.host] ? u.host : 'error') + '.html');
      else if (p.startsWith('/fonts/')) file = path.join(ROOT, 'assets', 'fonts', path.basename(p));
      else if (p.startsWith('/daily-img/')) {
        const name = path.basename(p);
        if (!/^[a-z0-9-]+\.jpg$/i.test(name)) return new Response('no', { status: 404 });
        file = path.join(this.daily.dir, name);
      }
      else if (p.startsWith('/shot/')) {
        const [, , id, name] = p.split('/');
        if (!/^[a-z0-9]+$/i.test(id) || !/^(shot\.png|thumb\.jpg)$/.test(name)) return new Response('no', { status: 404 });
        file = this.library.file(id, name);
      } else file = path.join(SRC, 'pages', path.normalize(p).replace(/^([/\\])+/, ''));
      if (!file.startsWith(SRC) && !file.startsWith(ROOT) && !file.startsWith(this.library.root) && !file.startsWith(this.daily.dir)) return new Response('no', { status: 403 });
      try {
        const body = fs.readFileSync(file);
        const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
        return new Response(body, { headers: { 'content-type': type, 'cache-control': p.startsWith('/daily-img/') ? 'max-age=86400' : 'no-cache' } });
      } catch (e) {
        return new Response('Not found', { status: 404 });
      }
    });
  }

  // ---------- window ----------
  open() {
    const b = this.d.bounds || {};
    const area = screen.getPrimaryDisplay().workArea;
    const t = this.theme();
    this.win = new BaseWindow({
      width: b.width || Math.min(1440, area.width), height: b.height || Math.min(900, area.height),
      x: b.x, y: b.y, minWidth: 760, minHeight: 480,
      titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 14 },
      backgroundColor: t.body, title: 'Aura', show: false
    });
    if (process.platform !== 'darwin') this.win.setMenuBarVisibility(false);
    this.shell = new WebContentsView({
      webPreferences: { preload: path.join(SRC, 'preload', 'shell.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    this.shell.setBackgroundColor(t.body);
    this.win.contentView.addChildView(this.shell);
    this.shell.webContents.loadFile(path.join(SRC, 'shell', 'index.html'));
    this.shell.webContents.on('did-finish-load', () => { this.push(true); this.win.show(); });
    if (process.argv.includes('--dev')) this.shell.webContents.openDevTools({ mode: 'detach' });

    const saveBounds = () => { if (!this.win.isFullScreen() && !this.win.isMaximized()) { this.d.bounds = this.win.getBounds(); this.state.save(); } };
    this.win.on('resize', () => { this.layout(); saveBounds(); });
    this.win.on('move', saveBounds);
    this.win.on('enter-full-screen', () => this.layout());
    this.win.on('leave-full-screen', () => this.layout());
    this.win.on('focus', () => this.push());
    this.win.on('closed', () => { this.win = null; this.tabs.clear(); clearInterval(this.edgeTimer); });

    // Restore: the current tab of the current Space comes back live, the rest wait asleep.
    const cur = this.sp();
    if (!cur.activeId || !this.locate(cur.activeId)) this.newTab({ focus: false });
    else this.activate(cur.activeId);
    this.layout();
    this.startEdgeWatch();
  }

  // Where the page sits. Panels push the page aside; nothing covers it at rest.
  // The toolbar always shows. The sidebar can be full, icons, or hidden (point at the left edge).
  frame() {
    const [W, H] = this.win.getContentSize();
    const ui = this.d.ui;
    const full = this.win.isFullScreen() && this.rt.htmlFull;
    if (full) return { x: 0, y: 0, width: W, height: H, r: 0, sideW: 0, barH: 0, panelW: 0, W, H, panes: null };
    const sideW = ui.sidebar === 'full' ? SIDEBAR_W : ui.sidebar === 'icons' ? STRIP_W : 0;
    const barH = BAR_H;
    const panelW = ui.panel ? PANEL_W : 0;
    const x = sideW ? sideW + 2 : GAP;
    const y = barH;
    const f = { x, y, width: Math.max(100, W - x - GAP - (panelW ? panelW : 0)), height: Math.max(100, H - y - GAP), r: 12, sideW, barH, panelW, W, H, panes: null };
    const sp = this.split();
    if (sp) {
      const ratio = sp.ratio || 0.5;
      const w1 = Math.round((f.width - 8) * ratio);
      f.panes = [{ id: sp.a, x: f.x, y: f.y, width: w1, height: f.height }, { id: sp.b, x: f.x + w1 + 8, y: f.y, width: f.width - w1 - 8, height: f.height }];
    }
    return f;
  }

  // Split view: two tabs side by side. Lives on the Space; shows when either tab is the current one.
  split(spaceId = this.d.active) {
    const s = this.sp(spaceId).split;
    if (!s) return null;
    const cur = this.sp(spaceId).activeId;
    if (!this.locate(s.a, spaceId) || !this.locate(s.b, spaceId)) { this.sp(spaceId).split = null; return null; }
    return cur === s.a || cur === s.b ? s : null;
  }
  splitWith(otherId) {
    const cur = this.current();
    if (!cur) return;
    if (!otherId) {
      const sp = this.sp();
      const other = [...sp.today, ...sp.pins].filter(i => i.id !== cur.id).sort((a, b) => b.ts - a.ts)[0];
      otherId = other ? other.id : this.newTab({ background: true }).id;
    }
    if (otherId === cur.id) return;
    this.ensureView(this.locate(otherId).item, this.d.active);
    this.sp().split = { a: cur.id, b: otherId, ratio: 0.5 };
    this.state.save();
    this.layout(true);
  }
  unsplit() { this.sp().split = null; this.state.save(); this.layout(true); }
  swapSplit() { const s = this.sp().split; if (s) { [s.a, s.b] = [s.b, s.a]; this.state.save(); this.layout(true); } }

  layout(animate) {
    if (!this.win) return;
    const [W, H] = this.win.getContentSize();
    this.shell.setBounds({ x: 0, y: 0, width: W, height: H });
    const target = this.frame();
    const from = this.shown;
    clearInterval(this.animTimer);
    const reduce = require('electron').systemPreferences.getAnimationSettings ? require('electron').systemPreferences.getAnimationSettings().prefersReducedMotion : false;
    if (animate && from && !reduce && !this.rt.overlay && !!from.panes === !!target.panes) {
      const t0 = Date.now(), dur = 200;
      const lerp = (p, q, k) => Math.round(p + (q - p) * k);
      const mix = (k) => {
        const f = Object.assign({}, target, { x: lerp(from.x, target.x, k), y: lerp(from.y, target.y, k), width: lerp(from.width, target.width, k), height: lerp(from.height, target.height, k) });
        if (target.panes) f.panes = target.panes.map((p, i) => ({ id: p.id, x: lerp(from.panes[i].x, p.x, k), y: lerp(from.panes[i].y, p.y, k), width: lerp(from.panes[i].width, p.width, k), height: lerp(from.panes[i].height, p.height, k) }));
        return f;
      };
      this.place(mix(0));
      this.push(true);
      this.animTimer = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / dur);
        const f = mix(ease(k));
        this.place(f);
        if (this.shell && !this.shell.webContents.isDestroyed()) this.shell.webContents.send('frame', f);
        if (k >= 1) { clearInterval(this.animTimer); this.push(); }
      }, 16);
    } else {
      this.place(target);
      this.push();
    }
    if (process.platform === 'darwin') {
      const ui = this.d.ui;
      this.win.setWindowButtonVisibility(!this.win.isFullScreen());
      this.win.setWindowButtonPosition(ui.sidebar === 'full' ? { x: 18, y: 14 } : { x: 16, y: 14 });
    }
  }

  // Put the live views where the frame says.
  place(f) {
    this.shown = f;
    const cur = this.current();
    const i = f.r ? 1 : 0;
    const rect = (b) => ({ x: b.x + i, y: b.y + i, width: Math.max(10, b.width - 2 * i), height: Math.max(10, b.height - 2 * i) });
    for (const [id, t] of this.tabs) {
      let box = null;
      if (!this.rt.overlay && !this.rt.peek) {
        if (f.panes) { const p = f.panes.find(x => x.id === id); if (p) box = p; }
        else if (cur && id === cur.id) box = f;
      }
      t.view.setVisible(!!box);
      if (box) { t.view.setBounds(rect(box)); t.view.setBorderRadius(Math.max(0, f.r - i)); }
    }
  }

  // Hide mode: point at the left edge and the sidebar slides over the page.
  startEdgeWatch() {
    let leftAt = 0;
    this.edgeTimer = setInterval(() => {
      if (!this.win || !this.win.isFocused()) return;
      const ui = this.d.ui;
      if (ui.sidebar !== 'hidden') { if (this.rt.revealSide) { this.rt.revealSide = false; this.push(); } return; }
      const p = screen.getCursorScreenPoint();
      const b = this.win.getContentBounds();
      const inside = p.x >= b.x - 2 && p.x <= b.x + b.width && p.y >= b.y - 2 && p.y <= b.y + b.height;
      const x = p.x - b.x, y = p.y - b.y;
      let side = this.rt.revealSide;
      if (inside && x <= 4 && y > BAR_H) side = true;
      else if (side && (x > SIDEBAR_W + 24 || !inside)) { if (!leftAt) leftAt = Date.now(); if (Date.now() - leftAt > 220) side = false; }
      else leftAt = 0;
      if (this.rt.overlay && !side) return;
      if (side !== this.rt.revealSide) {
        this.rt.revealSide = side;
        // The sidebar floats over the page while peeking, so the page never reflows.
        this.peekView(side);
        this.push(true);
      }
    }, 70);
  }
  // While the sidebar peeks in hide mode, the page underneath is shown as a still so the shell can draw on top.
  async peekView(on) {
    if (on) {
      const t = this.currentTab();
      try { this.rt.peekStill = t ? (await t.view.webContents.capturePage()).toDataURL() : null; } catch (e) { this.rt.peekStill = null; }
      if (!this.rt.revealSide) return;
      this.rt.peek = true;
      for (const [, x] of this.tabs) x.view.setVisible(false);
      this.push(true);
    } else {
      this.rt.peek = false; this.rt.peekStill = null;
      this.place(this.frame());
      this.push(true);
    }
  }

  // ---------- items: pins, folders, Today ----------
  locate(id, spaceId) {
    const spaces = spaceId ? [spaceId] : Object.keys(this.d.sp);
    for (const s of spaces) {
      const sp = this.d.sp[s];
      if (!sp) continue;
      let i = sp.pins.findIndex(x => x.id === id);
      if (i >= 0) return { space: s, list: sp.pins, index: i, item: sp.pins[i], where: 'pins' };
      i = sp.today.findIndex(x => x.id === id);
      if (i >= 0) return { space: s, list: sp.today, index: i, item: sp.today[i], where: 'today' };
      for (const f of sp.folders) {
        i = f.items.findIndex(x => x.id === id);
        if (i >= 0) return { space: s, list: f.items, index: i, item: f.items[i], where: 'folder', folder: f };
      }
    }
    return null;
  }
  current() { const id = this.sp().activeId; const l = id && this.locate(id, this.d.active); return l ? l.item : null; }
  currentTab() { const c = this.current(); return c ? this.tabs.get(c.id) : null; }
  orderedItems(spaceId = this.d.active) {
    const sp = this.sp(spaceId);
    const out = [...sp.pins];
    sp.folders.forEach(f => out.push(...f.items));
    out.push(...sp.today);
    return out;
  }

  newTab({ url, focus = true, after, background } = {}) {
    const item = { id: uid('t'), url: url || NEWTAB, title: url ? url.replace(/^https?:\/\/(www\.)?/, '') : 'Daily', fav: null, ts: Date.now() };
    const sp = this.sp();
    if (after) {
      const l = this.locate(after, this.d.active);
      if (l && l.where === 'today') sp.today.splice(l.index + 1, 0, item); else sp.today.push(item);
    } else sp.today.push(item);
    if (background) this.ensureView(item, this.d.active);
    else this.activate(item.id);
    if (focus && !url) this.rt.focusDaily = Date.now();
    this.state.save();
    return item;
  }

  ensureView(item, spaceId) {
    let t = this.tabs.get(item.id);
    if (t) return t;
    const view = new WebContentsView({
      webPreferences: {
        session: this.sessionFor(spaceId), preload: path.join(SRC, 'preload', 'web.js'),
        contextIsolation: true, sandbox: true, nodeIntegration: false, scrollBounce: true, spellcheck: true
      }
    });
    view.setBackgroundColor(/^aura:/.test(item.url) ? this.theme(spaceId).body : '#FFFFFF');
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    t = { view, id: item.id, space: spaceId, loading: false, audible: false, look: null, find: null };
    this.tabs.set(item.id, t);
    this.wire(t);
    view.webContents.loadURL(item.url).catch(() => {});
    return t;
  }

  wire(t) {
    const wc = t.view.webContents;
    const item = () => { const l = this.locate(t.id); return l && l.item; };
    const isCur = () => { const c = this.current(); return c && c.id === t.id; };
    wc.on('page-title-updated', (_e, title) => { const it = item(); if (it) { it.title = title; this.history.title(wc.getURL(), title); this.state.save(); this.push(); } });
    wc.on('page-favicon-updated', (_e, favs) => { const it = item(); if (it && favs && favs.length) { it.fav = favs.find(f => /\.(png|svg|ico)/i.test(f)) || favs[0]; this.state.save(); this.push(); } });
    wc.on('did-start-loading', () => { t.loading = true; this.push(); });
    wc.on('did-stop-loading', () => { t.loading = false; this.push(); });
    const nav = (_e, url) => {
      const it = item();
      if (it) {
        it.url = url;
        const internal = url.match(/^aura:\/\/([a-z]+)/);
        if (internal) { it.title = INTERNAL_TITLES[internal[1]] || it.title; it.fav = null; }
        this.state.save();
      }
      t.look = null; t.find = null; t.ai = null;
      if (this.d.settings.keepHistory) this.history.add({ url, title: wc.getTitle(), space: t.space });
      this.push();
    };
    wc.on('did-navigate', nav);
    wc.on('did-navigate-in-page', (e, url, isMain) => { if (isMain) { const it = item(); if (it) { it.url = url; this.state.save(); } this.push(); } });
    wc.on('did-finish-load', () => {
      const url = wc.getURL();
      if (/^(https?|file):/.test(url)) setTimeout(() => this.readLook(t).catch(() => {}), 700);
      if (this.d.ui.panel === 'ask' && this.currentTab() === t) this.pageText(t).catch(() => {});
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3 || code === -27) return;
      wc.loadURL('aura://error/?code=' + code + '&desc=' + encodeURIComponent(desc) + '&url=' + encodeURIComponent(url)).catch(() => {});
    });
    wc.on('audio-state-changed', (e) => { t.audible = e.audible; this.push(); });
    wc.on('found-in-page', (_e, r) => { if (t.find) { t.find.matches = r.matches; t.find.active = r.activeMatchOrdinal; this.push(); } });
    wc.on('render-process-gone', () => { t.crashed = true; this.push(); });
    wc.on('enter-html-full-screen', () => { this.rt.htmlFull = true; setTimeout(() => this.layout(), 50); });
    wc.on('leave-html-full-screen', () => { this.rt.htmlFull = false; setTimeout(() => this.layout(), 50); });
    // In split view, clicking into the other pane makes it the current tab.
    wc.on('focus', () => {
      const s = this.split();
      if (s && (s.a === t.id || s.b === t.id) && this.sp().activeId !== t.id) { this.sp().activeId = t.id; this.state.save(); this.push(); }
    });
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      if (disposition === 'new-window' && features) {
        // Sign-in popups and the like keep their opener.
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: '#FFFFFF' } };
      }
      if (/^(https?|aura):/.test(url)) this.newTab({ url, after: t.id, background: disposition === 'background-tab' });
      return { action: 'deny' };
    });
    wc.on('context-menu', (_e, p) => this.pageMenu(t, p));
    wc.on('zoom-changed', (_e, dir) => { const z = wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5); wc.setZoomLevel(Math.max(-5, Math.min(5, z))); this.push(); });
  }

  activate(id) {
    const l = this.locate(id);
    if (!l) return;
    if (l.space !== this.d.active) this.d.active = l.space;
    const sp = this.sp(l.space);
    sp.activeId = id;
    l.item.ts = Date.now();
    const t = this.ensureView(l.item, l.space);
    this.rt.flashTab = null;
    this.layout();
    if (!this.rt.overlay) t.view.webContents.focus();
    this.state.save();
  }

  closeTab(id) {
    id = id || (this.current() && this.current().id);
    const l = this.locate(id);
    if (!l) return;
    const t = this.tabs.get(id);
    const wasCurrent = this.sp(l.space).activeId === id;
    if (t) { this.win.contentView.removeChildView(t.view); t.view.webContents.close(); this.tabs.delete(id); }
    const spl = this.sp(l.space).split;
    let partner = null;
    if (spl && (spl.a === id || spl.b === id)) { this.sp(l.space).split = null; partner = spl.a === id ? spl.b : spl.a; }
    if (l.where === 'today') {
      l.list.splice(l.index, 1);
      if (!/^aura:\/\/newtab/.test(l.item.url)) { this.d.closed.unshift({ ...l.item, space: l.space }); this.d.closed.length = Math.min(this.d.closed.length, 30); }
    }
    if (wasCurrent) {
      const sp = this.sp(l.space);
      let next = partner ? this.locate(partner, l.space) && this.locate(partner, l.space).item : null;
      if (!next && l.where === 'today') next = sp.today[Math.min(l.index, sp.today.length - 1)];
      if (!next) next = [...sp.today].sort((a, b) => b.ts - a.ts)[0];
      if (!next) next = this.orderedItems(l.space).find(i => this.tabs.has(i.id));
      sp.activeId = null;
      if (next) this.activate(next.id); else this.newTab({ focus: false });
    }
    this.state.save();
    this.layout();
  }

  reopenClosed() {
    const it = this.d.closed.shift();
    if (!it) return;
    if (it.space && it.space !== this.d.active && this.space(it.space)) this.switchSpace(it.space);
    this.newTab({ url: it.url });
  }

  sleep(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    const wasCur = this.current() && this.current().id === id;
    this.win.contentView.removeChildView(t.view); t.view.webContents.close(); this.tabs.delete(id);
    if (wasCur) {
      const sp = this.sp();
      const next = [...sp.today].sort((a, b) => b.ts - a.ts).find(i => i.id !== id);
      sp.activeId = null;
      if (next) this.activate(next.id); else this.newTab({ focus: false });
    }
    this.layout();
  }

  move(id, to) {
    // to: { where: 'pins'|'today'|'folder', folderId, index }
    const l = this.locate(id, this.d.active);
    if (!l) return;
    l.list.splice(l.index, 1);
    const sp = this.sp();
    let list = to.where === 'pins' ? sp.pins : to.where === 'folder' ? (sp.folders.find(f => f.id === to.folderId) || {}).items : sp.today;
    if (!list) list = sp.today;
    let i = to.index == null ? list.length : to.index;
    if (list === l.list && to.index != null && l.index < to.index) i--;
    i = Math.max(0, Math.min(list.length, i));
    list.splice(i, 0, l.item);
    if (to.where === 'folder') { const f = sp.folders.find(x => x.id === to.folderId); if (f) f.open = true; }
    this.state.save(); this.push();
  }

  moveToSpace(id, spaceId) {
    const l = this.locate(id);
    if (!l || l.space === spaceId) return;
    const t = this.tabs.get(id);
    if (t) { this.win.contentView.removeChildView(t.view); t.view.webContents.close(); this.tabs.delete(id); }
    l.list.splice(l.index, 1);
    this.sp(spaceId).today.push(l.item);
    if (this.sp(l.space).activeId === id) { this.sp(l.space).activeId = null; }
    this.switchSpace(spaceId);
    this.activate(id);
  }

  switchSpace(id) {
    if (!this.space(id)) return;
    this.d.active = id;
    const sp = this.sp(id);
    if (sp.activeId && this.locate(sp.activeId, id)) this.activate(sp.activeId);
    else { sp.activeId = null; this.newTab({ focus: false }); }
    const t = this.theme();
    this.win.setBackgroundColor(t.body);
    this.shell.setBackgroundColor(t.body);
    this.broadcastInternal('theme');
    this.state.save();
    this.layout();
  }

  // ---------- navigation ----------
  navigate(input, opts = {}) {
    const url = toUrl(input, this.d.settings.search);
    if (!url) return;
    const cur = this.current();
    if (opts.newTab || !cur) return this.newTab({ url });
    const t = this.ensureView(cur, this.d.active);
    cur.url = url;
    t.view.webContents.loadURL(url).catch(() => {});
    t.view.webContents.focus();
    this.push();
  }
  wc() { const t = this.currentTab(); return t && t.view.webContents; }

  // ---------- page look ----------
  async readLook(t) {
    const wc = t.view.webContents;
    if (wc.isDestroyed() || !/^(https?|file):/.test(wc.getURL())) return null;
    const look = await wc.executeJavaScript(READ_LOOK, false);
    if (!/^(https?|file):/.test(wc.getURL())) return null;
    t.look = look;
    if (this.currentTab() === t) this.push();
    return look;
  }

  async save(kind) {
    const t = this.currentTab();
    const cur = this.current();
    if (!t || !cur) return;
    const wc = t.view.webContents;
    const url = wc.getURL();
    if (!/^https?:/.test(url)) { this.flash({ icon: 'info', title: 'Nothing to save here', text: 'Open a website first.' }, 3000); return; }
    const sp = this.space();
    const base = { url, title: wc.getTitle() || cur.title, host: new URL(url).hostname.replace(/^www\./, ''), spaceId: sp.id, spaceName: sp.name, fav: cur.fav };
    try {
      if (kind === 'page' || kind === 'look') {
        const look = await this.readLook(t).catch(() => t.look);
        const image = await wc.capturePage();
        const rec = this.library.add(Object.assign(base, { kind, look }), image);
        if (kind === 'look' && !this.d.ui.panel) { this.d.ui.panel = true; this.layout(); }
        this.flashSaved(rec);
      } else if (kind === 'area') {
        this.flash({ icon: 'area', title: 'Drag over the page', text: 'Esc to stop' }, 0);
        wc.focus();
        const rect = await wc.executeJavaScript(PICK_AREA, true);
        this.unflash();
        if (!rect) return;
        await new Promise(r => setTimeout(r, 60));
        const image = await wc.capturePage({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
        const look = t.look || await this.readLook(t).catch(() => null);
        const rec = this.library.add(Object.assign(base, { kind: 'area', look, rect }), image);
        this.flashSaved(rec);
      } else if (kind === 'type') {
        this.flash({ icon: 'type', title: 'Click any text', text: 'to save its typeface. Esc to stop' }, 0);
        wc.focus();
        const type = await wc.executeJavaScript(PICK_TYPE, true);
        this.unflash();
        if (!type) return;
        const r = type.rect;
        const image = await wc.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(10, Math.round(r.width)), height: Math.max(10, Math.round(r.height)) });
        const look = t.look || await this.readLook(t).catch(() => null);
        const rec = this.library.add(Object.assign(base, { kind: 'type', type, title: type.family + ' ' + type.weight, look }), image);
        this.flashSaved(rec);
      } else if (kind === 'colour') {
        wc.focus();
        const hex = await wc.executeJavaScript(PICK_COLOUR, true);
        if (!hex) return;
        const up = hex.toUpperCase();
        clipboard.writeText(up);
        const img = nativeImage.createFromBuffer(solidPng(up));
        const rec = this.library.add(Object.assign(base, { kind: 'colour', colour: up, title: up + ' from ' + base.host }), img);
        this.flashSaved(rec, 'Copied ' + up);
      }
    } catch (e) {
      console.error('save failed', e);
      this.flash({ icon: 'info', title: 'Couldn’t save', text: e.message.slice(0, 80) }, 4000);
    }
    this.broadcastInternal('library');
  }

  flashSaved(rec, extra) {
    const what = { page: 'Page saved', look: 'This look saved', area: 'Area saved', type: 'Typeface saved', colour: 'Colour saved' }[rec.kind];
    const look = rec.look || {};
    const { describeColour } = require('./library');
    const bits = [];
    if (look.colours && look.colours.length) {
      bits.push(look.dark ? 'dark' : 'light');
      const acc = look.colours.find(c => c.role === 'Accent');
      if (acc) bits.push(describeColour(acc.hex).filter(w => !['light', 'dark', 'bright', 'vivid', 'deep', 'pastel'].includes(w))[0] + ' accent');
    }
    if (rec.type) bits.push(rec.type.family + ' ' + rec.type.weight);
    else if (look.faces && look.faces[0]) bits.push(look.faces[0].family);
    if (look.values && look.values.motion && look.values.motion !== 'Still') bits.push(look.values.motion);
    bits.push(rec.host);
    const words = bits.filter(Boolean).join(', ');
    this.flash({ icon: 'check', title: what, text: extra || words, actions: [['Find it later ⌘K', 'cmd'], ['Undo', 'undo-save:' + rec.id]], saved: true }, 7000);
  }
  flash(f, ms) {
    clearTimeout(this.flashTimer);
    this.rt.flash = Object.assign({ at: Date.now() }, f);
    if (ms) this.flashTimer = setTimeout(() => { this.rt.flash = null; this.push(); }, ms);
    this.push();
  }
  unflash() { clearTimeout(this.flashTimer); this.rt.flash = null; this.push(); }

  // ---------- menus ----------
  tabMenu(id) {
    const l = this.locate(id, this.d.active);
    if (!l) return;
    const sp = this.sp();
    const live = this.tabs.has(id);
    const tmpl = [
      { label: l.where === 'pins' ? 'Unpin' : 'Pin', click: () => this.move(id, { where: l.where === 'pins' ? 'today' : 'pins' }) },
      { label: 'Move to folder', submenu: sp.folders.length ? sp.folders.map(f => ({ label: f.name, click: () => this.move(id, { where: 'folder', folderId: f.id }) })).concat([{ type: 'separator' }, { label: 'New folder…', click: () => { const f = this.folderCreate(); this.move(id, { where: 'folder', folderId: f.id }); } }]) : [{ label: 'New folder', click: () => { const f = this.folderCreate(); this.move(id, { where: 'folder', folderId: f.id }); } }] },
      { label: 'Move to Space', submenu: this.d.spaces.filter(s => s.id !== this.d.active).map(s => ({ label: s.name, click: () => this.moveToSpace(id, s.id) })) },
      { type: 'separator' },
      { label: this.split() && (this.split().a === id || this.split().b === id) ? 'Close split view' : 'Open in split view', enabled: !!this.current() && (this.current().id !== id || !!this.split()), click: () => { const s = this.split(); if (s && (s.a === id || s.b === id)) this.unsplit(); else this.splitWith(id); } },
      { type: 'separator' },
      { label: 'Copy address', click: () => clipboard.writeText(l.item.url) },
      { label: 'Duplicate', click: () => this.newTab({ url: l.item.url, after: id }) },
      { label: 'Reload', enabled: live, click: () => this.tabs.get(id) && this.tabs.get(id).view.webContents.reload() },
      { type: 'separator' },
      l.where === 'today' ? { label: 'Close tab', click: () => this.closeTab(id) } : { label: 'Put to sleep', enabled: live, click: () => this.sleep(id) },
      l.where !== 'today' ? { label: 'Remove', click: () => { this.sleep(id); const k = this.locate(id); if (k) { k.list.splice(k.index, 1); this.state.save(); this.push(); } } } : null,
      l.where === 'today' ? { label: 'Close tabs below', click: () => { const ids = sp.today.slice(l.index + 1).map(i => i.id); ids.forEach(x => this.closeTab(x)); } } : null
    ].filter(Boolean);
    Menu.buildFromTemplate(tmpl).popup({ window: this.win });
  }

  pageMenu(t, p) {
    const wc = t.view.webContents;
    const items = [];
    if (p.linkURL) {
      items.push({ label: 'Open link in new tab', click: () => this.newTab({ url: p.linkURL, after: t.id, background: true }) });
      const others = this.d.spaces.filter(s => s.id !== t.space);
      if (others.length) items.push({ label: 'Open link in Space', submenu: others.map(s => ({ label: s.name, click: () => { this.switchSpace(s.id); this.newTab({ url: p.linkURL }); } })) });
      items.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    }
    if (p.hasImageContents && p.srcURL) {
      items.push({ label: 'Open image in new tab', click: () => this.newTab({ url: p.srcURL, after: t.id }) });
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ label: 'Save image…', click: () => wc.downloadURL(p.srcURL) }, { type: 'separator' });
    }
    if (p.selectionText) {
      const q = p.selectionText.trim().slice(0, 200);
      items.push({ label: 'Copy', role: 'copy' });
      items.push({ label: `Search for “${q.length > 30 ? q.slice(0, 30) + '…' : q}”`, click: () => this.newTab({ url: toUrl(q, this.d.settings.search), after: t.id }) }, { type: 'separator' });
    }
    if (p.isEditable) {
      if (p.misspelledWord && p.dictionarySuggestions.length) {
        p.dictionarySuggestions.slice(0, 4).forEach(s => items.push({ label: s, click: () => wc.replaceMisspelling(s) }));
        items.push({ type: 'separator' });
      }
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' });
    }
    if (!p.linkURL && !p.selectionText && !p.isEditable) {
      items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
      items.push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
      items.push({ label: 'Reload', click: () => wc.reload() }, { type: 'separator' });
      items.push({ label: 'Save whole view', accelerator: 'CmdOrCtrl+S', click: () => this.save('page') });
      items.push({ label: 'Save this look', accelerator: 'CmdOrCtrl+Shift+S', click: () => this.save('look') });
      items.push({ label: 'Save an area', click: () => this.save('area') });
      items.push({ label: 'Save a typeface', click: () => this.save('type') }, { type: 'separator' });
    }
    items.push({ label: 'Inspect', click: () => { wc.inspectElement(p.x, p.y); } });
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  folderCreate(name) {
    const f = { id: uid('f'), name: name || 'New folder', open: true, items: [] };
    this.sp().folders.push(f);
    this.rt.renameFolder = f.id;
    this.state.save(); this.push();
    return f;
  }

  // ---------- popovers ----------
  // Popovers sit over the page. While one is open the page shows as a still image underneath.
  async overlay(on) {
    if (on === this.rt.overlay) return;
    const t = this.currentTab();
    const f = this.shown || this.frame();
    this.rt.stills = [];
    if (on) {
      const boxes = f.panes ? f.panes : (t ? [{ id: t.id, x: f.x, y: f.y, width: f.width, height: f.height }] : []);
      for (const b of boxes) {
        const x = this.tabs.get(b.id);
        try { if (x) this.rt.stills.push({ x: b.x, y: b.y, width: b.width, height: b.height, src: (await x.view.webContents.capturePage()).toDataURL() }); } catch (e) {}
      }
    }
    this.rt.overlay = on;
    this.push(true);
    setTimeout(() => {
      this.layout();
      if (on) this.shell.webContents.focus(); else if (t) t.view.webContents.focus();
    }, on ? 30 : 0);
    if (!on) this.rt.stills = [];
  }

  // ---------- state to the shell ----------
  push(now) {
    if (!this.win || !this.shell) return;
    clearTimeout(this.pushTimer);
    const send = () => { if (this.shell && !this.shell.webContents.isDestroyed()) this.shell.webContents.send('state', this.snapshot()); };
    if (now) send(); else this.pushTimer = setTimeout(send, 16);
  }

  snapshot() {
    const sp = this.sp();
    const cur = this.current();
    const ct = this.currentTab();
    const wc = ct && ct.view.webContents;
    const dec = (it) => {
      const t = this.tabs.get(it.id);
      return { id: it.id, url: it.url, title: it.title || it.url, fav: it.fav, live: !!t, loading: !!(t && t.loading), audible: !!(t && t.audible), on: cur && cur.id === it.id };
    };
    const f = this.win ? this.frame() : null;
    return {
      platform: process.platform,
      spaces: this.d.spaces, active: this.d.active,
      pins: sp.pins.map(dec), folders: sp.folders.map(x => ({ id: x.id, name: x.name, open: x.open, items: x.items.map(dec) })), today: sp.today.map(dec),
      ui: this.d.ui, settings: { search: this.d.settings.search, searchName: (SEARCH[this.d.settings.search] || SEARCH.google).name },
      theme: this.theme(), frame: f, full: this.win && this.win.isFullScreen(),
      rt: { overlay: this.rt.overlay, stills: this.rt.overlay ? this.rt.stills : [], peek: this.rt.peek, peekStill: this.rt.peek ? this.rt.peekStill : null, revealSide: this.rt.revealSide, flash: this.rt.flash, downloads: this.rt.downloadsActive, renameFolder: this.rt.renameFolder, focusDaily: this.rt.focusDaily, install: this.rt.install || null },
      split: f && f.panes ? { a: f.panes[0].id, b: f.panes[1].id, active: cur && cur.id } : null,
      ai: ct && ct.ai ? { turns: ct.ai.turns, busy: ct.ai.busy, words: ct.ai.words, article: ct.ai.article, needKey: ct.ai.needKey } : null, aiReady: this.ai.hasKey(),
      exts: (this.d.settings.extensions || []).map(x => ({ path: x.path, name: x.name, icon: x.icon, on: x.on !== false, here: this.extIn(x, this.d.active), popup: !!x.popup, spaces: x.spaces, store: !!x.storeId })),
      page: cur ? {
        id: cur.id, url: wc ? wc.getURL() || cur.url : cur.url, title: cur.title,
        back: !!(wc && wc.navigationHistory.canGoBack()), fwd: !!(wc && wc.navigationHistory.canGoForward()),
        loading: !!(ct && ct.loading), look: ct && ct.look ? (this.d.ui.panel === 'inspect' ? ct.look : Object.assign({}, ct.look, { svgs: [], images: [], vars: {} })) : null, find: ct ? ct.find : null,
        store: wc ? storeId(wc.getURL()) : null, storeInstalled: wc && storeId(wc.getURL()) ? (this.d.settings.extensions || []).some(x => x.storeId === storeId(wc.getURL())) : false,
        zoom: wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100, crashed: !!(ct && ct.crashed),
        secure: /^https:/.test(cur.url),
        savedLook: !!(wc && this.library.all().some(x => x.kind === 'look' && x.url === wc.getURL()))
      } : null,
      icons: SPACE_ICONS, colours: Object.keys(SPACE_COLOURS), saves: this.library.all().length
    };
  }

  broadcastInternal(what) {
    for (const t of this.tabs.values()) {
      const wc = t.view.webContents;
      if (!wc.isDestroyed() && /^aura:/.test(wc.getURL())) wc.send('aura:changed', what);
    }
  }

  // ---------- Aura Farming: ask about this page ----------
  async pageText(t) {
    const wc = t.view.webContents;
    if (!/^https?:|^file:/.test(wc.getURL())) return null;
    const r = await wc.executeJavaScript(READ_TEXT, false);
    t.ai = t.ai || { turns: [], messages: [] };
    t.ai.words = r.words; t.ai.article = r.article; t.ai.url = wc.getURL();
    t.pageTextCache = r.text;
    this.push();
    return r;
  }
  async ask({ q, preset }) {
    const t = this.currentTab();
    if (!t) return;
    if (this.d.ui.panel !== 'ask') { this.d.ui.panel = 'ask'; this.state.save(); this.layout(true); }
    if (!this.ai.hasKey()) { t.ai = t.ai || { turns: [], messages: [] }; t.ai.needKey = true; this.push(); return; }
    if (t.ai && t.ai.busy) return;
    const wc = t.view.webContents;
    if (!/^https?:|^file:/.test(wc.getURL())) { t.ai = { turns: [{ q: q || '', error: 'Open a website first, then ask about it.' }], messages: [] }; this.push(); return; }
    if (!t.pageTextCache || !t.ai || t.ai.url !== wc.getURL()) await this.pageText(t).catch(() => {});
    const ai = t.ai;
    const label = preset ? { summary: 'Summarise in 3 bullets', takeaways: 'Key takeaways and actions', design: 'Describe the design', csv: 'Tables and data as CSV', faq: 'Generate an FAQ' }[preset] : q;
    const turn = { q: label, text: '', busy: true };
    ai.turns.push(turn); ai.busy = true; ai.needKey = false;
    this.push();
    const ctrl = new AbortController();
    t.aiAbort = ctrl;
    // Follow-ups reuse the conversation; the page goes in with the first question only.
    const first = !ai.messages.length;
    const res = first
      ? await this.ai.ask({ question: q, preset, page: { url: wc.getURL(), title: wc.getTitle(), text: t.pageTextCache || '' }, look: t.look }, (piece) => { turn.text += piece; this.push(); }, ctrl.signal)
      : await this.ai.ask({ question: q, preset, page: { url: wc.getURL(), title: wc.getTitle(), text: '(The page was shared earlier in this conversation.)' }, look: null, history: ai.messages }, (piece) => { turn.text += piece; this.push(); }, ctrl.signal);
    turn.busy = false; ai.busy = false;
    if (res.error === 'nokey') ai.needKey = true;
    else if (res.error) turn.error = res.error;
    if (res.messages) ai.messages = res.messages.slice(-12);
    this.push();
  }
  stopAsk() { const t = this.currentTab(); if (t && t.aiAbort) t.aiAbort.abort(); }
  clearAsk() { const t = this.currentTab(); if (t) { if (t.aiAbort) t.aiAbort.abort(); t.ai = { turns: [], messages: [], words: t.ai && t.ai.words, url: t.ai && t.ai.url }; this.push(); } }

  // ---------- command bar search ----------
  async commandResults(q) {
    const s = String(q || '').trim();
    const low = s.toLowerCase();
    const out = [];
    if (s) {
      const url = toUrl(s, this.d.settings.search);
      const isSearch = url && url.startsWith((SEARCH[this.d.settings.search] || SEARCH.google).url.split('%s')[0]);
      out.push({ group: 'Go', kind: isSearch ? 'search' : 'url', title: isSearch ? s : url.replace(/^https?:\/\//, ''), sub: isSearch ? 'Search ' + (SEARCH[this.d.settings.search] || SEARCH.google).name : 'Open address', url });
    }
    // On this page: lines of the page that contain what was typed. Picking one finds it.
    const ct = this.currentTab();
    if (s.length >= 2 && ct && /^https?:|^file:/.test(ct.view.webContents.getURL())) {
      try {
        const hits = await Promise.race([ct.view.webContents.executeJavaScript(`(() => {
          const q = ${JSON.stringify(low)}; const out = []; const seen = new Set();
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n, total = 0;
          while ((n = w.nextNode()) && out.length < 4) {
            const t = n.textContent; const i = t.toLowerCase().indexOf(q);
            if (i < 0) continue;
            const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
            const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
            total++;
            const a = Math.max(0, i - 40), snip = (a ? '…' : '') + t.slice(a, i + q.length + 60).replace(/\\s+/g, ' ').trim();
            if (seen.has(snip)) continue; seen.add(snip); out.push(snip);
          }
          return out;
        })()`, false), new Promise(r => setTimeout(() => r([]), 400))]);
        (hits || []).forEach((h, i) => out.push({ group: 'On this page', kind: 'find', title: h, sub: i === 0 ? 'Find in page' : '', text: s, key: i === 0 ? '⌘F' : '' }));
      } catch (e) {}
    }
    // Open tabs in this Space
    const tabs = this.orderedItems().filter(it => !low || (it.title || '').toLowerCase().includes(low) || (it.url || '').toLowerCase().includes(low)).slice(0, s ? 5 : 6);
    tabs.forEach(it => out.push({ group: 'Tabs', kind: 'tab', id: it.id, title: it.title || it.url, sub: (it.url || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 70), fav: it.fav }));
    // Saves, described in words
    const saves = s ? this.library.search(s).slice(0, 5) : this.library.all().slice(0, 3);
    saves.forEach(x => out.push({ group: 'Saves', kind: 'save', id: x.id, title: x.title, sub: (KINDS[x.kind] || x.kind).replace(/s$/, '') + ' from ' + (x.host || '') + ', ' + ago(x.created), thumb: x.hasShot ? `aura://library/shot/${x.id}/thumb.jpg` : null, colour: x.colour }));
    if (s) this.history.suggest(s, 5).forEach(h => { if (!out.some(o => o.url === h.url)) out.push({ group: 'History', kind: 'url', title: h.title || h.url, sub: h.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70), url: h.url }); });
    // Commands
    const cmds = [
      ['New tab', 'cmd:newtab', '⌘T'], ['Library', 'open:aura://library/', '⌘⇧O'], ['History', 'open:aura://history/', '⌘Y'], ['Downloads', 'open:aura://downloads/', '⌥⌘L'],
      ['Settings', 'open:aura://settings/', '⌘,'], ['Save whole view', 'save:page', '⌘S'], ['Save this look', 'save:look', '⌘⇧S'], ['Save a typeface', 'save:type', ''], ['Save a colour', 'save:colour', '⌘⇧C'], ['Save an area', 'save:area', '⌘⇧A'],
      ['Inspect this page', 'cmd:inspect', '⌘I'], ['Ask about this page', 'cmd:ask', '⌘J'], ['Split view', 'cmd:split', '⌘⇧\\'], ['Extensions', 'cmd:extensions', ''], ['Import bookmarks and find my taste', 'open:aura://welcome/', ''], ['Sidebar: always show', 'ui:sidebar:full', '⌘⇧1'], ['Sidebar: collapse to icons', 'ui:sidebar:icons', '⌘⇧2'], ['Sidebar: hide', 'ui:sidebar:hidden', '⌘⇧3'],
      ['Light chrome', 'ui:theme:light', ''], ['Dark chrome', 'ui:theme:dark', ''], ['New Space', 'cmd:newspace', '⌘⇧N'], ['New folder', 'cmd:newfolder', ''], ['Make Aura the default browser', 'cmd:default', '']
    ].concat(this.d.spaces.map((sp, i) => ['Switch to ' + sp.name, 'space:' + sp.id, i < 4 ? '⌃' + (i + 1) : '']));
    cmds.filter(c => !low || c[0].toLowerCase().includes(low)).slice(0, s ? 4 : 0).forEach(c => out.push({ group: 'Commands', kind: 'cmd', title: c[0], action: c[1], key: c[2] }));
    // Ask Aura about the page: ⌘⏎ from anywhere in the list.
    if (s.length > 3 && ct && /^https?:/.test(ct.view.webContents.getURL())) out.push({ group: 'Ask Aura', kind: 'ask', title: s, sub: 'Ask about ' + (ct.view.webContents.getTitle() || 'this page').slice(0, 60), key: '⌘⏎' });
    if (!s && ct && /^https?:/.test(ct.view.webContents.getURL())) [['summary', 'Summarise this page'], ['design', 'Describe the design of this page']].forEach(([p, t]) => out.push({ group: 'Ask Aura', kind: 'ask', preset: p, title: t, sub: this.ai.hasKey() ? 'Opens the Ask panel' : 'Add your Anthropic key in Settings first' }));
    return out;
  }
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return 'today';
  const d = new Date(ts);
  return d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' });
}

// A tiny solid PNG for colour saves.
function solidPng(hex) {
  const zlib = require('zlib');
  const w = 240, h = 160;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array(h).fill(row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return crc ^ 0xFFFFFFFF;
}

module.exports = { Browser, lookToCss, NEWTAB };
