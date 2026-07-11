// Pigment mixing + color-space helpers.
// Mixing uses a single-constant Kubelka-Munk approximation applied per RGB
// channel (treating R/G/B as three reflectance bands). This produces
// subtractive-feeling mixes (e.g. yellow+blue -> green, complements -> mud)
// which plain linear RGB averaging does not.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

export function rgbToCmyk({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100) };
}

function xyzFromRgb({ r, g, b }) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  return {
    x: R * 0.4124 + G * 0.3576 + B * 0.1805,
    y: R * 0.2126 + G * 0.7152 + B * 0.0722,
    z: R * 0.0193 + G * 0.1192 + B * 0.9505
  };
}

export function rgbToLab(rgb) {
  const { x, y, z } = xyzFromRgb(rgb);
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE(lab1, lab2) {
  return Math.sqrt((lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
}

// --- Kubelka-Munk-ish mixing ---
function toKS(r) {
  r = Math.min(0.995, Math.max(0.005, r));
  return (1 - r) ** 2 / (2 * r);
}
function fromKS(ks) {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}

// hexes: array of hex strings, weights: array of fractions (sum ~1)
export function kmMix(hexes, weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const norm = weights.map(w => w / total);
  let R = 0, G = 0, B = 0;
  hexes.forEach((hex, i) => {
    const rgb = hexToRgb(hex);
    R += toKS(rgb.r / 255) * norm[i];
    G += toKS(rgb.g / 255) * norm[i];
    B += toKS(rgb.b / 255) * norm[i];
  });
  return rgbToHex({ r: fromKS(R) * 255, g: fromKS(G) * 255, b: fromKS(B) * 255 });
}

// Naive linear (arithmetic) RGB average — the non-realistic comparison mode.
export function linearMix(hexes, weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const norm = weights.map(w => w / total);
  let R = 0, G = 0, B = 0;
  hexes.forEach((hex, i) => {
    const rgb = hexToRgb(hex);
    R += rgb.r * norm[i]; G += rgb.g * norm[i]; B += rgb.b * norm[i];
  });
  return rgbToHex({ r: R, g: G, b: B });
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Build weight-simplex points for N components at a given step (0-1)
function simplexPoints(n, step) {
  const pts = [];
  const steps = Math.round(1 / step);
  if (n === 1) return [[1]];
  if (n === 2) {
    for (let i = 0; i <= steps; i++) pts.push([i / steps, 1 - i / steps]);
    return pts;
  }
  // n === 3
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps - i; j++) {
      const a = i / steps, b = j / steps, c = 1 - a - b;
      if (c >= -1e-9) pts.push([a, b, Math.max(0, c)]);
    }
  }
  return pts;
}

function combinations(arr, k) {
  const res = [];
  const rec = (start, chosen) => {
    if (chosen.length === k) { res.push(chosen.slice()); return; }
    for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  return res;
}

function matchPercentFromDeltaE(de) {
  return Math.max(0, Math.min(100, Math.round(100 - de * 2.1)));
}

// Returns shortlist of pigment objects most relevant to target (hue-based + always-include neutrals)
function buildShortlist(targetHex, pigments) {
  const targetHsl = rgbToHsl(hexToRgb(targetHex));
  const chromatic = pigments.filter(p => !p.white && !p.water);
  const whites = pigments.filter(p => p.white || p.water);
  const sorted = chromatic
    .map(p => ({ p, d: hueDist(rgbToHsl(hexToRgb(p.hex)).h, targetHsl.h) }))
    .sort((a, b) => a.d - b.d)
    .map(x => x.p);
  const darkest = chromatic.slice().sort((a, b) => rgbToHsl(hexToRgb(a.hex)).l - rgbToHsl(hexToRgb(b.hex)).l)[0];
  const shortlist = [];
  const add = p => { if (p && !shortlist.find(s => s.id === p.id)) shortlist.push(p); };
  // Guarantee the neutrals (white/water tint agent + darkest shade) always survive
  // any downstream truncation — they're added first, before hue-nearest fill.
  whites.slice(0, 1).forEach(add);
  add(darkest);
  sorted.forEach(p => { if (shortlist.length < 8) add(p); });
  return shortlist.slice(0, 8);
}

function bestFromCandidates(targetHex, candidates, mixFn) {
  mixFn = mixFn || kmMix;
  const targetLab = rgbToLab(hexToRgb(targetHex));
  let best = null;
  for (let size = 1; size <= 3; size++) {
    if (candidates.length < size) continue;
    const combos = combinations(candidates, size);
    const step = size === 3 ? 0.1 : 0.05;
    const pts = simplexPoints(size, step);
    for (const combo of combos) {
      const hexes = combo.map(c => c.hex);
      for (const weights of pts) {
        if (weights.some(w => w > 0 && w < 0.05)) continue; // skip negligible-but-nonzero noise
        const mixedHex = mixFn(hexes, weights);
        const de = deltaE(rgbToLab(hexToRgb(mixedHex)), targetLab);
        if (!best || de < best.deltaE) {
          best = { combo, weights, mixedHex, deltaE: de };
        }
      }
    }
  }
  return best;
}

export function findRecipe(targetHex, availablePigments, mixFn) {
  if (!availablePigments.length) return null;
  const shortlist = buildShortlist(targetHex, availablePigments);
  const best = bestFromCandidates(targetHex, shortlist, mixFn);
  if (!best) return null;
  // drop near-zero components, renormalize
  const kept = best.combo.map((p, i) => ({ pigment: p, weight: best.weights[i] })).filter(x => x.weight > 0.03);
  const sum = kept.reduce((a, x) => a + x.weight, 0);
  kept.forEach(x => x.weight = x.weight / sum);
  kept.sort((a, b) => b.weight - a.weight);
  return {
    items: kept,
    mixedHex: best.mixedHex,
    deltaE: best.deltaE,
    matchPercent: matchPercentFromDeltaE(best.deltaE)
  };
}

// Find the single non-owned catalogue pigment that most improves the match
// when combined with the top of the shortlist.
export function findUpgrade(targetHex, ownedPigments, fullCatalog, currentMatchPercent, threshold, mixFn) {
  threshold = threshold || 99;
  if (currentMatchPercent >= threshold) return null;
  const ownedIds = new Set(ownedPigments.map(p => p.id));
  const candidates = fullCatalog.filter(p => !ownedIds.has(p.id));
  if (!candidates.length) return null;
  const shortlistOwned = buildShortlist(targetHex, ownedPigments).slice(0, 4);
  let bestUpgrade = null;
  for (const cand of candidates) {
    const pool = [cand, ...shortlistOwned];
    const result = bestFromCandidates(targetHex, pool, mixFn);
    if (!result) continue;
    const usesCandidate = result.combo.some(p => p.id === cand.id);
    if (!usesCandidate) continue;
    const pct = matchPercentFromDeltaE(result.deltaE);
    if (!bestUpgrade || pct > bestUpgrade.matchPercent) {
      bestUpgrade = { pigment: cand, matchPercent: pct };
    }
  }
  if (bestUpgrade && bestUpgrade.matchPercent > currentMatchPercent + 1) return bestUpgrade;
  return null;
}

export function formatParts(weights) {
  const TOUCH = 0.12;
  const nonTouch = weights.filter(w => w >= TOUCH);
  const unit = Math.min(...(nonTouch.length ? nonTouch : weights));
  return weights.map(w => {
    if (w < TOUCH) return 'a touch of';
    const ratio = w / unit;
    const rounded = Math.round(ratio * 2) / 2;
    if (Math.abs(rounded - 1) < 0.01) return '1 part';
    const numStr = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return numStr + ' parts';
  });
}

const HUE_NAMES = [
  [15, 'Red'], [45, 'Orange'], [70, 'Yellow'], [100, 'Chartreuse'],
  [150, 'Green'], [185, 'Teal'], [210, 'Cyan'], [255, 'Blue'],
  [290, 'Violet'], [325, 'Magenta'], [345, 'Pink'], [361, 'Red']
];

export function nameColor(hex) {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  // Very dark colours read as black to the eye even when their hue-saturation
  // is technically nonzero (e.g. #1a1716) — don't call them "Deep Orange".
  if (l < 0.13 && s < 0.5) return 'Near Black';
  if (s < 0.08) {
    if (l > 0.85) return 'Off-White';
    if (l < 0.15) return 'Near Black';
    return 'Warm Grey';
  }
  let hueName = 'Red';
  for (const [max, name] of HUE_NAMES) { if (h < max) { hueName = name; break; } }
  let modifier = '';
  if (l > 0.8) modifier = 'Pale ';
  else if (l < 0.28) modifier = 'Deep ';
  else if (s > 0.65) modifier = 'Vivid ';
  else if (s < 0.3) modifier = 'Muted ';
  return (modifier + hueName).trim();
}
