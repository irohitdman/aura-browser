// Small JSON stores in the user data folder. Writes are debounced and atomic.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const dir = () => app.getPath('userData');

class JsonStore {
  constructor(name, defaults) {
    this.file = path.join(dir(), name + '.json');
    this.data = defaults;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = Object.assign({}, defaults, raw);
    } catch (_) { /* first run */ }
    this.timer = null;
  }
  save(now) {
    clearTimeout(this.timer);
    const write = () => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);
      } catch (e) { console.error('store write failed', this.file, e); }
    };
    if (now) write(); else this.timer = setTimeout(write, 400);
  }
}

module.exports = { JsonStore, dir };
