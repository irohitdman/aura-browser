// Space colours and chrome tokens, from the Aura v3.4 design language (26 Nov 2026).
const SPACE_COLOURS = {
  graphite: '#9EB8D9',
  red: '#E5534B',
  orange: '#F0883E',
  yellow: '#E3B341',
  green: '#3FB950',
  teal: '#39C5BB',
  blue: '#6CA6F5',
  slate: '#8B9BB4'
};

const SPACE_ICONS = ['home', 'briefcase', 'compass', 'book', 'star', 'heart', 'bolt', 'leaf', 'camera', 'music', 'code', 'pen', 'flask', 'globe', 'coffee', 'moon', 'sun', 'flag'];

function hexToRgb(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r) {
  return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function add(hex, n) { return rgbToHex(hexToRgb(hex).map(v => v + n)); }
function lum(hex) {
  const c = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Tint 0 to 100 mixes up to 20% of the colour into the background (16% on light).
// The accent is lifted until it reaches 3:1 on that background.
function tokens(space, mode) {
  const colour = SPACE_COLOURS[space.color] || SPACE_COLOURS.graphite;
  const tint = space.color === 'graphite' ? 0 : (space.tint ?? 24);
  if (mode === 'light') {
    const body = mix('#F4F4F2', colour, 0.16 * tint / 100);
    let accent = space.color === 'graphite' ? '#3D6BA8' : colour;
    let guard = 0;
    while (contrast(accent, body) < 3 && guard++ < 30) accent = mix(accent, '#000000', 0.08);
    return {
      body, plate: '#FFFFFF', key: add(body, -14), keylit: add(body, -22), keyhov: 'rgba(0,0,0,0.045)',
      well: mix(body, '#FFFFFF', 0.6), alu: '#555555', ink: '#141414', mute: '#6B6B6B', line: add(body, -20),
      accent, accent30: hexA(accent, 0.3), onaccent: '#FFFFFF',
      pop: '0 24px 60px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)',
      savebg: 'linear-gradient(#2A2A2A,#141414)', savefg: '#FFFFFF', savehi: 'inset 0 1px 0 rgba(255,255,255,.12)',
      colour, light: true
    };
  }
  const body = mix('#0B0B0B', colour, 0.2 * tint / 100);
  let accent = colour;
  let guard = 0;
  while (contrast(accent, body) < 3 && guard++ < 30) accent = mix(accent, '#FFFFFF', 0.08);
  return {
    body, plate: add(body, 11), key: add(body, 27), keylit: add(body, 37), keyhov: 'rgba(38,38,38,0.6)',
    well: add(body, 4), alu: '#BBBBBB', ink: '#F2F2F2', mute: '#9A9A9A', line: add(body, 24),
    accent, accent30: hexA(accent, 0.3), onaccent: '#0B0B0B',
    pop: '0 24px 60px rgba(0,0,0,.6)',
    savebg: 'linear-gradient(#5A5A5A,#3E3E3E)', savefg: '#FFFFFF', savehi: 'inset 0 1px 0 rgba(255,255,255,.15)',
    colour, light: false
  };
}
function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

module.exports = { SPACE_COLOURS, SPACE_ICONS, tokens, contrast, mix };
