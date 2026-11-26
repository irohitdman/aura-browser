// Runs in every tab. Aura's own pages (aura://) get the Aura API.
// Websites get only the password bridge, which the main process checks against the frame's real origin.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'aura:') {
  contextBridge.exposeInMainWorld('aura', {
    call: (type, arg) => ipcRenderer.invoke('aura', type, arg),
    on: (fn) => ipcRenderer.on('aura:changed', (_e, what) => fn(what))
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
}
