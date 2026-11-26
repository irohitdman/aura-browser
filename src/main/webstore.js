// Install extensions from the Chrome Web Store: download the .crx, unpack it, load it into Spaces.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { app, net } = require('electron');

const STORE = /^https:\/\/(chromewebstore\.google\.com\/detail\/(?:[^/]+\/)?|chrome\.google\.com\/webstore\/detail\/(?:[^/]+\/)?)([a-p]{32})/;
function storeId(url) { const m = STORE.exec(url || ''); return m ? m[2] : null; }

// .crx = small header + a zip. CRX3: "Cr24", version 3, header length, header. CRX2: keys and signature lengths.
function crxToZip(buf) {
  if (buf.slice(0, 4).toString() !== 'Cr24') {
    if (buf.readUInt32LE(0) === 0x04034b50) return buf; // already a zip
    throw new Error('Not a Chrome extension file');
  }
  const v = buf.readUInt32LE(4);
  if (v === 3) return buf.slice(12 + buf.readUInt32LE(8));
  if (v === 2) return buf.slice(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error('Unknown extension format ' + v);
}

// A small zip reader: central directory, stored and deflated entries.
function unzip(buf, dest) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Damaged extension archive');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged extension archive');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    const out = path.resolve(root, name);
    if (!out.startsWith(root + path.sep) && out !== root) continue; // no escaping the folder
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    const lnl = buf.readUInt16LE(local + 26), lel = buf.readUInt16LE(local + 28);
    const data = buf.slice(local + 30 + lnl + lel, local + 30 + lnl + lel + csize);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 8 ? zlib.inflateRawSync(data) : data);
  }
}

// Turn the manifest's permissions into the plain sentences the install card shows.
function describe(manifest) {
  const perms = [].concat(manifest.permissions || [], manifest.optional_permissions || []);
  const hosts = [].concat(manifest.host_permissions || [], perms.filter(p => /[:*]/.test(p)), ...(manifest.content_scripts || []).map(c => c.matches || []));
  const all = hosts.some(h => /<all_urls>|^\*:\/\/\*\/|^https?:\/\/\*\//.test(h));
  const lines = [];
  if (all) lines.push({ warn: true, t: 'Read and change everything on every site', s: 'Including pages where you’re signed in, like mail and banking.' });
  else if (hosts.length) lines.push({ warn: false, t: 'Read and change data on ' + [...new Set(hosts.map(h => h.replace(/^\*:\/\/|^https?:\/\//, '').replace(/\/.*$/, '')))].slice(0, 3).join(', '), s: '' });
  if (perms.includes('tabs') || perms.includes('tabGroups')) lines.push({ t: 'See and rearrange your open tabs' });
  if (perms.includes('history')) lines.push({ warn: true, t: 'Read your browsing history' });
  if (perms.includes('cookies')) lines.push({ warn: true, t: 'Read and change cookies' });
  if (perms.includes('clipboardRead')) lines.push({ t: 'Read what you copy' });
  if (perms.includes('downloads')) lines.push({ t: 'Manage your downloads' });
  if (perms.includes('storage') || perms.includes('unlimitedStorage')) lines.push({ t: 'Store its settings on this Mac' });
  if (!lines.length) lines.push({ t: 'Nothing beyond its own pages' });
  return lines;
}

function localised(dir, manifest, value) {
  const m = /^__MSG_(.+)__$/.exec(value || '');
  if (!m) return value;
  const loc = manifest.default_locale || 'en';
  for (const l of [loc, 'en', 'en_US']) {
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', l, 'messages.json'), 'utf8'));
      const k = Object.keys(msgs).find(x => x.toLowerCase() === m[1].toLowerCase());
      if (k) return msgs[k].message;
    } catch (e) {}
  }
  return value;
}

function iconOf(dir, manifest) {
  const icons = manifest.icons || (manifest.action && manifest.action.default_icon) || (manifest.browser_action && manifest.browser_action.default_icon) || {};
  if (typeof icons === 'string') return path.join(dir, icons);
  const best = Object.keys(icons).map(Number).sort((a, b) => b - a)[0];
  return best ? path.join(dir, icons[best]) : null;
}

// Download and unpack. Returns what the install card needs; nothing is loaded yet.
async function fetchExtension(id) {
  const prod = process.versions.chrome;
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${prod}&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  const res = await net.fetch(url);
  if (!res.ok) throw new Error('The Web Store returned ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = crxToZip(buf);
  const base = path.join(app.getPath('userData'), 'extensions', id);
  const tmp = base + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  unzip(zip, tmp);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  delete manifest.key; delete manifest.update_url;
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.rmSync(base, { recursive: true, force: true });
  fs.renameSync(tmp, base);
  const icon = iconOf(base, manifest);
  let iconData = null;
  try { if (icon) iconData = 'data:image/png;base64,' + fs.readFileSync(icon).toString('base64'); } catch (e) {}
  return {
    id, path: base, name: localised(base, manifest, manifest.name), version: manifest.version,
    description: localised(base, manifest, manifest.description || ''), mv: manifest.manifest_version,
    perms: describe(manifest), icon: iconData,
    popup: (manifest.action && manifest.action.default_popup) || (manifest.browser_action && manifest.browser_action.default_popup) || null
  };
}

module.exports = { storeId, fetchExtension, crxToZip, unzip, describe, localised, iconOf };
