// Scripts that run inside a web page to read its look: colours, type and values.
// They return plain JSON and never change the page.

const READ_LOOK = `(() => {
  const toHex = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] < 0.5) return null;
    return '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const W = innerWidth, H = innerHeight;
  const bg = new Map(), fg = new Map(), accents = new Map(), fonts = new Map(), radii = new Map();
  const bump = (m, k, v) => { if (k) m.set(k, (m.get(k) || 0) + v); };
  let measure = 0, canvases = 0, webgl = false, videos = 0, anims = 0;

  // Page background first: html, then body.
  const rootBg = toHex(getComputedStyle(document.documentElement).backgroundColor) || toHex(getComputedStyle(document.body || document.documentElement).backgroundColor) || '#FFFFFF';
  bump(bg, rootBg, W * H);

  const all = document.body ? document.body.getElementsByTagName('*') : [];
  const limit = Math.min(all.length, 4000);
  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H * 2.5 || r.right < 0 || r.left > W) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
    const area = Math.min(r.width, W) * Math.min(r.height, H);
    const b = toHex(cs.backgroundColor);
    if (b) bump(bg, b, area);
    const tag = el.tagName;
    if (tag === 'CANVAS') { canvases++; try { if (el.getContext && (el.getContext('webgl2') || el.getContext('webgl'))) webgl = true; } catch (e) {} }
    if (tag === 'VIDEO') videos++;
    if (cs.animationName && cs.animationName !== 'none') anims++;
    const rad = parseFloat(cs.borderTopLeftRadius);
    if (rad > 0 && rad < 200 && area > 400) bump(radii, Math.round(rad), 1);
    if ((tag === 'A' || tag === 'BUTTON') && b) bump(accents, b, area * 2);
    if (tag === 'A' || tag === 'BUTTON') bump(accents, toHex(cs.color), 400);
    const bc = toHex(cs.borderTopColor);
    if (parseFloat(cs.borderTopWidth) > 0 && bc) bump(accents, bc, r.width);
    // Text: only elements that hold their own text.
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.trim();
    if (own.length > 1) {
      const len = Math.min(own.length, 400);
      bump(fg, toHex(cs.color), len);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const size = Math.round(parseFloat(cs.fontSize) * 2) / 2;
      const weight = cs.fontWeight;
      const key = fam;
      const f = fonts.get(key) || { family: fam, stack: cs.fontFamily, chars: 0, uses: {} };
      f.chars += len * (size / 14);
      const role = /^H[1-3]$/.test(tag) || size >= 24 ? 'Headings' : (/^(CODE|PRE|KBD|SAMP)$/.test(tag) || /mono/i.test(fam)) ? 'Code' : size <= 12.5 ? 'Labels' : 'Body';
      const uk = role + '|' + weight + '|' + size;
      f.uses[uk] = (f.uses[uk] || 0) + len;
      fonts.set(key, f);
      if (/^(P|LI)$/.test(tag) && own.length > 80) measure = Math.max(measure, Math.round(r.width));
    }
  }
  try { anims += document.getAnimations ? document.getAnimations().length : 0; } catch (e) {}

  // Where fonts come from.
  const sheets = [...document.querySelectorAll('link[rel=stylesheet],style')].map(s => s.href || s.textContent.slice(0, 4000)).join(' ');
  const google = /fonts\\.(googleapis|gstatic)\\.com/.test(sheets);
  const loaded = new Set();
  try { document.fonts.forEach(f => { if (f.status === 'loaded') loaded.add(f.family.replace(/["']/g, '')); }); } catch (e) {}
  const SYSTEM = /^(-apple-system|system-ui|BlinkMacSystemFont|Helvetica|Helvetica Neue|Arial|Times|Times New Roman|Georgia|Courier|Courier New|Menlo|Monaco|SF Pro|SF Pro Text|SF Pro Display|SF Mono|Segoe UI|Roboto|sans-serif|serif|monospace|Verdana|Tahoma|ui-sans-serif|ui-monospace|ui-serif)$/i;

  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const sat = (hex) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const light = (hex) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const near = (a, b) => { const p = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), q = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 24; };

  const colours = [];
  const add = (hex, role) => { if (hex && !colours.some(c => near(c.hex, hex))) colours.push({ hex, role }); };
  const bgs = sorted(bg);
  add(bgs[0] && bgs[0][0], 'Background');
  if (bgs[1]) add(bgs[1][0], 'Surface');
  const fgs = sorted(fg);
  add(fgs[0] && fgs[0][0], 'Text');
  if (fgs[1]) add(fgs[1][0], 'Muted text');
  const acc = sorted(accents).concat(bgs.slice(2)).concat(fgs.slice(2)).filter(([h]) => sat(h) > 0.25).sort((a, b) => (b[1] * (0.5 + sat(b[0]))) - (a[1] * (0.5 + sat(a[0]))));
  for (const [h] of acc) { if (colours.length >= 5) break; add(h, 'Accent'); }
  for (const [h] of bgs.slice(2)) { if (colours.length >= 5) break; add(h, 'Surface'); }
  for (const [h] of fgs.slice(2)) { if (colours.length >= 5) break; add(h, 'Text'); }

  const faces = [...fonts.values()].sort((a, b) => b.chars - a.chars).slice(0, 4).map(f => {
    const top = Object.entries(f.uses).sort((a, b) => b[1] - a[1])[0][0].split('|');
    const lic = SYSTEM.test(f.family) ? 'System' : (google ? 'Google Fonts, free' : (loaded.has(f.family) ? 'Web font' : 'Local'));
    return { family: f.family, stack: f.stack, role: top[0], weight: top[1], size: top[2] + 'px', licence: lic };
  });

  const vars = {};
  try {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules || []) {
        if (rule.selectorText === ':root' || rule.selectorText === 'html') {
          for (const p of rule.style) if (p.startsWith('--') && Object.keys(vars).length < 60) vars[p] = rule.style.getPropertyValue(p).trim();
        }
      }
    }
  } catch (e) {}

  const rs = sorted(radii).slice(0, 2).map(r => r[0]).sort((a, b) => a - b);
  const motion = webgl ? 'WebGL' : videos ? 'Video' : canvases ? 'Canvas' : anims ? 'CSS animation' : 'Still';
  const meta = (n) => (document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]') || {}).content || '';
  return {
    url: location.href, host: location.hostname.replace(/^www\\./, ''), title: document.title,
    description: meta('description') || meta('og:description'),
    colours, faces, vars,
    values: { radius: rs.length ? rs.join('/') + 'px' : '0', measure: measure ? measure + 'px' : 'Fluid', motion },
    dark: light(colours[0] ? colours[0].hex : '#FFFFFF') < 0.45
  };
})()`;

// Hold the pointer over text and click to pick its typeface. Resolves with the element's type.
const PICK_TYPE = `new Promise((resolve) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #9EB8D9;border-radius:4px;box-shadow:0 0 0 4px rgba(158,184,217,.25);transition:all .06s';
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#161616;color:#F2F2F2;font:500 12px -apple-system,system-ui,sans-serif;padding:6px 9px;border-radius:8px;border:1px solid #2A2A2A;white-space:nowrap';
  document.documentElement.append(box, tip);
  let cur = null;
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box) return;
    cur = el; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    Object.assign(box.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
    tip.textContent = cs.fontFamily.split(',')[0].replace(/["']/g, '') + '  ' + cs.fontWeight + '  ' + Math.round(parseFloat(cs.fontSize)) + 'px  · click to save, Esc to stop';
    tip.style.left = Math.min(r.left, innerWidth - 360) + 'px'; tip.style.top = (r.top > 40 ? r.top - 34 : r.bottom + 8) + 'px';
  };
  const done = (val) => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true); box.remove(); tip.remove(); resolve(val); };
  const click = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = cur || e.target; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const sample = (el.innerText || el.textContent || '').trim().slice(0, 140);
    done({ family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), stack: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize,
      lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, style: cs.fontStyle, color: cs.color, sample,
      rect: { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: Math.min(r.width + 24, innerWidth), height: Math.min(r.height + 24, innerHeight) } });
  };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true);
})`;

// Drag over part of the page. Resolves with the rectangle in CSS pixels.
const PICK_AREA = `new Promise((resolve) => {
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,.18)';
  const sel = document.createElement('div');
  sel.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:1.5px solid #9EB8D9;background:rgba(158,184,217,.12);display:none;border-radius:3px';
  const hint = document.createElement('div');
  hint.textContent = 'Drag over the part you want to keep. Esc to stop';
  hint.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#161616;color:#F2F2F2;font:500 12.5px -apple-system,system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:1px solid #2A2A2A';
  document.documentElement.append(veil, sel, hint);
  let x0 = 0, y0 = 0, on = false;
  const end = (v) => { veil.remove(); sel.remove(); hint.remove(); removeEventListener('keydown', key, true); resolve(v); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); end(null); } };
  veil.addEventListener('mousedown', (e) => { on = true; x0 = e.clientX; y0 = e.clientY; sel.style.display = 'block'; });
  veil.addEventListener('mousemove', (e) => { if (!on) return; const x = Math.min(x0, e.clientX), y = Math.min(y0, e.clientY); Object.assign(sel.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - x0) + 'px', height: Math.abs(e.clientY - y0) + 'px' }); });
  veil.addEventListener('mouseup', (e) => {
    const r = { x: Math.min(x0, e.clientX), y: Math.min(y0, e.clientY), width: Math.abs(e.clientX - x0), height: Math.abs(e.clientY - y0) };
    if (r.width < 8 || r.height < 8) { on = false; sel.style.display = 'none'; return; }
    veil.style.background = 'transparent'; sel.style.display = 'none'; hint.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => end(r)));
  });
  addEventListener('keydown', key, true);
})`;

// The page's own eyedropper. Needs a user gesture, which executeJavaScript can supply.
const PICK_COLOUR = `(async () => {
  if (!window.EyeDropper) return null;
  try { const r = await new EyeDropper().open(); return r.sRGBHex; } catch (e) { return null; }
})()`;

module.exports = { READ_LOOK, PICK_TYPE, PICK_AREA, PICK_COLOUR };
