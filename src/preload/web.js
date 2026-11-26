// Runs in every tab. Aura's own pages (aura://) get the Aura API.
// Websites get only the password bridge, which the main process checks against the frame's real origin.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'aura:') {
  contextBridge.exposeInMainWorld('aura', {
    call: (type, arg) => ipcRenderer.invoke('aura', type, arg),
    on: (fn) => ipcRenderer.on('aura:changed', (_e, what, data) => fn(what, data))
  });
} else if (location.protocol === 'https:' || location.protocol === 'http:') {
  // ---- Passwords: offer to save on sign-in, fill when we know the site ----
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const userField = (pw) => {
    const scope = pw.form || document;
    const inputs = [...scope.querySelectorAll('input')].filter(i => visible(i) && /^(text|email|tel|)$/.test(i.type) && i !== pw);
    const before = inputs.filter(i => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    const pick = before.find(i => /user|email|login|name|account/i.test(i.name + i.id + i.autocomplete)) || before[before.length - 1] || inputs[0];
    return pick || null;
  };
  let lastUser = '';
  const offer = (pw) => {
    if (!pw || !pw.value || pw.value.length < 3 || /new-password/.test(pw.autocomplete || '') && false) return;
    const u = userField(pw);
    const username = (u && u.value) || lastUser || '';
    ipcRenderer.send('web:pw-offer', { username, password: pw.value });
  };
  const findPw = (root) => [...(root || document).querySelectorAll('input[type=password]')].filter(visible);
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.tagName === 'INPUT' && t.type !== 'password' && /user|email|login/i.test(t.name + t.id + t.autocomplete + t.type)) lastUser = t.value; }, true);
  document.addEventListener('submit', (e) => { const pw = findPw(e.target)[0]; if (pw) offer(pw); }, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button,input[type=submit],[role=button]');
    if (!b) return;
    const pw = findPw(b.form || document).find(p => p.value);
    if (pw) setTimeout(() => offer(pw), 0);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.type === 'password') offer(e.target); }, true);

  const setVal = (el, v) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let creds = null, filled = false;
  const tryFill = async () => {
    if (filled || location.protocol !== 'https:') return;
    const pw = findPw()[0];
    if (!pw) return;
    if (!creds) creds = await ipcRenderer.invoke('web:pw-get');
    if (!creds || !creds.length) return;
    const c = creds[0];
    const u = userField(pw);
    if (u && !u.value && c.username) setVal(u, c.username);
    if (!pw.value) setVal(pw, c.password);
    filled = true;
  };
  addEventListener('DOMContentLoaded', () => {
    setTimeout(tryFill, 300);
    new MutationObserver(() => { if (!filled) { clearTimeout(window.__auraFill); window.__auraFill = setTimeout(tryFill, 250); } }).observe(document.documentElement, { childList: true, subtree: true });
  });

  // ---- Selection: Explain, Summarise, Translate ----
  let host = null, root = null, pillAt = 0, seq = 0, lastSel = '';
  const css = `
    :host { all: initial; }
    .pill, .card { position: fixed; z-index: 2147483647; font: 500 12.5px/1.45 -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; color: #F2F2F2; -webkit-font-smoothing: antialiased; }
    .pill { display: flex; gap: 2px; padding: 3px; background: #161616; border: 1px solid #2A2A2A; border-radius: 11px; box-shadow: 0 10px 30px rgba(0,0,0,.35); animation: in .16s cubic-bezier(.22,.8,.24,1); }
    .pill button { all: unset; height: 26px; padding: 0 10px; border-radius: 8px; color: #D6D6D6; cursor: default; display: flex; align-items: center; gap: 6px; }
    .pill button:hover { background: #262626; color: #F2F2F2; }
    .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: #9EB8D9; margin: 0 2px 0 6px; align-self: center; }
    .card { width: 360px; max-height: 340px; display: flex; flex-direction: column; background: #161616; border: 1px solid #2A2A2A; border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.45); animation: in .18s cubic-bezier(.22,.8,.24,1); overflow: hidden; }
    .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; }
    .hd b { font-weight: 600; font-size: 13px; }
    .hd span { color: #8A8A8A; font: 500 11px ui-monospace, 'SF Mono', monospace; }
    .hd button { all: unset; margin-left: auto; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; color: #8A8A8A; }
    .hd button:hover { background: #262626; color: #F2F2F2; }
    .tx { padding: 8px 14px 12px; overflow: auto; white-space: pre-wrap; color: #E4E4E4; font-weight: 400; font-size: 13px; line-height: 1.55; }
    .tx.wait { color: #8A8A8A; }
    .ft { display: flex; gap: 4px; padding: 0 8px 8px; }
    .ft button { all: unset; height: 26px; padding: 0 10px; border-radius: 8px; color: #BDBDBD; background: #222; }
    .ft button:hover { background: #2E2E2E; color: #F2F2F2; }
    @keyframes in { from { opacity: 0; transform: translateY(4px); } }
    @media (prefers-reduced-motion: reduce) { .pill, .card { animation: none; } }`;
  const ensure = () => {
    if (host && host.isConnected) return;
    host = document.createElement('aura-selection');
    root = host.attachShadow({ mode: 'closed' });
    const st = document.createElement('style'); st.textContent = css; root.appendChild(st);
    document.documentElement.appendChild(host);
  };
  const clear = () => { if (root) [...root.querySelectorAll('.pill,.card')].forEach(n => n.remove()); };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const place = (n, r, w, h) => {
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.top > h + 16 ? r.top - h - 8 : Math.min(innerHeight - h - 8, r.bottom + 8);
    n.style.left = x + 'px'; n.style.top = y + 'px';
  };
  const showPill = async (text, rect) => {
    const st = await ipcRenderer.invoke('web:ai-ready').catch(() => null);
    if (!st || !st.ready) return;
    ensure(); clear();
    const pill = el('div', 'pill');
    pill.appendChild(el('span', 'dot'));
    for (const [k, label] of [['explain', 'Explain'], ['summarize', 'Summarise'], ['translate', 'Translate']]) {
      const b = el('button', '', label);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { if (!e.isTrusted) return; e.preventDefault(); e.stopPropagation(); run(k, text, rect, k === 'translate' ? 'Translate to ' + st.lang : label); });
      pill.appendChild(b);
    }
    root.appendChild(pill);
    place(pill, rect, 280, 34);
    pillAt = Date.now();
  };
  const run = async (action, text, rect, label) => {
    clear();
    const n = ++seq;
    const card = el('div', 'card');
    const hd = el('div', 'hd'); hd.appendChild(el('b', '', label)); const meta = el('span', '', ''); hd.appendChild(meta);
    const x = el('button', '', '✕'); x.addEventListener('click', (e) => { if (e.isTrusted) clear(); }); hd.appendChild(x);
    const tx = el('div', 'tx wait', 'Thinking…');
    const ft = el('div', 'ft');
    const copy = el('button', '', 'Copy'); copy.addEventListener('click', (e) => { if (!e.isTrusted) return; navigator.clipboard.writeText(tx.textContent).catch(() => {}); copy.textContent = 'Copied'; });
    const more = el('button', '', 'Ask more in the panel'); more.addEventListener('click', (e) => { if (!e.isTrusted) return; ipcRenderer.send('web:ai-panel', { text }); clear(); });
    ft.append(copy, more);
    card.append(hd, tx, ft);
    root.appendChild(card);
    place(card, rect, 360, 180);
    let got = '';
    const on = (_e, id, piece) => { if (id !== n) return; got += piece; tx.classList.remove('wait'); tx.textContent = got; };
    ipcRenderer.on('web:ai-chunk', on);
    const r = await ipcRenderer.invoke('web:ai', { action, text, n }).catch(err => ({ error: err.message }));
    ipcRenderer.removeListener('web:ai-chunk', on);
    if (r.model) meta.textContent = r.model.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2');
    if (r.error) { tx.classList.add('wait'); tx.textContent = r.error === 'nokey' ? 'Add your Anthropic API key in Aura › Settings › Aura Farming to use this.' : r.error; }
    else tx.textContent = r.text || got;
  };
  document.addEventListener('mouseup', (e) => {
    if (!e.isTrusted || e.button !== 0) return;
    if (host && e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = getSelection();
      const text = sel && String(sel).trim();
      const a = document.activeElement;
      if (!text || text.length < 3 || text.length > 12000 || (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))) { if (Date.now() - pillAt > 150 && root && root.querySelector('.pill')) clear(); return; }
      if (text === lastSel && root && root.querySelector('.pill')) return;
      lastSel = text;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      showPill(text, r);
    }, 10);
  }, true);
  document.addEventListener('mousedown', (e) => { if (host && !e.composedPath().includes(host) && root && root.querySelector('.pill')) { clear(); lastSel = ''; } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root) clear(); }, true);
  addEventListener('scroll', () => { if (root && root.querySelector('.pill')) { clear(); lastSel = ''; } }, { passive: true, capture: true });
  addEventListener('resize', () => { if (root && root.querySelector('.pill')) { clear(); lastSel = ''; } });
}
