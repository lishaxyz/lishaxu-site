/* Colour Mixer — lishaxu.com/colourmix/
   Ported from the Claude Design handoff ("Paint Colour Mixer.dc.html").
   The logic class is carried over verbatim as a React class component; the
   template is rendered with htm (no build step). The colour science lives in
   color-mixing.js and the paint catalogues in paint-data.js (both from the
   handoff, unmodified). Everything runs client-side; photos never leave the
   browser. Inventory / custom paints / shopping list persist in localStorage
   under paintmixer:* keys. */

import * as mixLib from './color-mixing.js';
import * as paintData from './paint-data.js';

const DEFAULT_MEDIUM = 'oil';
const MATCH_THRESHOLD = 99; // % below which buy suggestions appear
const MIX_FN = mixLib.kmMix; // realistic Kubelka-Munk mixing
const DEFAULT_PHOTO = 'assets/painting.webp';
const UPLOAD_MAX_SIDE = 1600; // uploads are downscaled so they fit localStorage

/* h() wraps React.createElement and converts string style attributes
   (kept verbatim from the design template) into React style objects. */
function cssToObj(css) {
  const o = {};
  css.split(';').forEach(decl => {
    const i = decl.indexOf(':');
    if (i < 0) return;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    o[prop.indexOf('--') === 0 ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
  });
  return o;
}
function h(type, props, ...children) {
  if (props && typeof props.style === 'string') {
    props = Object.assign({}, props, { style: cssToObj(props.style) });
  }
  return React.createElement(type, props, ...children);
}
const html = htm.bind(h);

class ColourMixer extends React.Component {
  state = {
    ready: false,
    medium: DEFAULT_MEDIUM,
    photoSrc: DEFAULT_PHOTO,
    recentPhotos: [DEFAULT_PHOTO],
    source: 'photo',
    targetHex: '#6F79BE',
    hasPick: false,
    pickPct: { x: 44, y: 74 },
    dabs: [],
    wheelHue: 235,
    wheelSat: 0.42,
    wheelLight: 0.5,
    inventory: { oil: [], acrylic: [], watercolour: [] },
    customPigments: [],
    shoppingList: [],
    showChangePhoto: false,
    showMyPaints: false,
    showPickList: false,
    showTypeName: false,
    pickListQuery: '',
    addNameValue: '',
    addHexValue: '#8a6d3b',
    pasteCodeValue: '',
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
    wheelDragging: false,
    confirmClear: false,
    toast: null
  };

  mix = mixLib;
  data = paintData;

  componentDidMount() {
    let savedInv = null, savedCustom = [], savedShopping = [], savedSess = null;
    try { savedInv = JSON.parse(localStorage.getItem('paintmixer:inventory') || 'null'); } catch (e) {}
    try { savedCustom = JSON.parse(localStorage.getItem('paintmixer:custom') || '[]'); } catch (e) {}
    try { savedShopping = JSON.parse(localStorage.getItem('paintmixer:shopping') || '[]'); } catch (e) {}
    try { savedSess = JSON.parse(localStorage.getItem('paintmixer:session') || 'null'); } catch (e) {}
    const next = {
      inventory: savedInv || JSON.parse(JSON.stringify(this.data.DEFAULT_INVENTORY)),
      customPigments: savedCustom || [],
      shoppingList: savedShopping || [],
      ready: true
    };
    if (savedSess && typeof savedSess === 'object') {
      if (this.data.MEDIUM_LABELS[savedSess.medium]) next.medium = savedSess.medium;
      if (savedSess.source === 'photo' || savedSess.source === 'wheel') next.source = savedSess.source;
      if (typeof savedSess.targetHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(savedSess.targetHex)) {
        next.targetHex = savedSess.targetHex;
        this._restoredTarget = true; // don't let dab extraction overwrite it
      }
      if (typeof savedSess.hasPick === 'boolean') next.hasPick = savedSess.hasPick;
      if (savedSess.pickPct && isFinite(savedSess.pickPct.x)) next.pickPct = savedSess.pickPct;
      if (isFinite(savedSess.wheelHue)) next.wheelHue = savedSess.wheelHue;
      if (isFinite(savedSess.wheelSat)) next.wheelSat = savedSess.wheelSat;
      if (isFinite(savedSess.wheelLight)) next.wheelLight = savedSess.wheelLight;
      if (typeof savedSess.photoSrc === 'string' && savedSess.photoSrc) next.photoSrc = savedSess.photoSrc;
      if (Array.isArray(savedSess.recentPhotos) && savedSess.recentPhotos.length) next.recentPhotos = savedSess.recentPhotos;
    }
    this.setState(next, () => { this._sessionLoaded = true; });
    this.maybeComputeDabs();
    this.onResize = () => this.setState({ viewportWidth: window.innerWidth });
    window.addEventListener('resize', this.onResize);
  }

  componentDidUpdate() {
    this.persistSession();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this._sessTimer);
    clearTimeout(this._toastTimer);
    clearTimeout(this._clearTimer);
  }

  persist() {
    try {
      localStorage.setItem('paintmixer:inventory', JSON.stringify(this.state.inventory));
      localStorage.setItem('paintmixer:custom', JSON.stringify(this.state.customPigments));
      localStorage.setItem('paintmixer:shopping', JSON.stringify(this.state.shoppingList));
    } catch (e) {}
  }

  // Debounced snapshot of the working state (medium, source, target, photos)
  // so a refresh or a fresh visit resumes where the user left off. Uploaded
  // photos are downscaled JPEG data URLs; if localStorage still overflows,
  // progressively drop the recents, then the photo itself.
  persistSession() {
    if (!this._sessionLoaded) return;
    clearTimeout(this._sessTimer);
    this._sessTimer = setTimeout(() => {
      const s = this.state;
      const sess = {
        medium: s.medium, source: s.source, targetHex: s.targetHex,
        hasPick: s.hasPick, pickPct: s.pickPct,
        wheelHue: s.wheelHue, wheelSat: s.wheelSat, wheelLight: s.wheelLight,
        photoSrc: s.photoSrc, recentPhotos: s.recentPhotos
      };
      const attempts = [
        sess,
        { ...sess, recentPhotos: [s.photoSrc] },
        { ...sess, photoSrc: DEFAULT_PHOTO, recentPhotos: [DEFAULT_PHOTO] }
      ];
      for (const attempt of attempts) {
        try { localStorage.setItem('paintmixer:session', JSON.stringify(attempt)); return; } catch (e) {}
      }
    }, 400);
  }

  showToast(text) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this.setState({ toast: text });
    this._toastTimer = setTimeout(() => this.setState({ toast: null }), 2600);
  }

  // ---------- image sampling ----------
  setImgRef = el => { this.imgEl = el; };
  setFileInputRef = el => { this.fileInputEl = el; };

  handleImgLoad = () => {
    if (!this.imgEl) return;
    const w = this.imgEl.naturalWidth, h = this.imgEl.naturalHeight;
    if (!w || !h) return;
    const scale = Math.min(1, 320 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(this.imgEl, 0, 0, canvas.width, canvas.height);
      this.sampleCanvas = canvas;
      this.dabsComputed = false;
      this.maybeComputeDabs();
    } catch (e) {}
  };

  maybeComputeDabs() {
    if (!this.sampleCanvas || this.dabsComputed) return;
    this.dabsComputed = true;
    const ctx = this.sampleCanvas.getContext('2d');
    const w = this.sampleCanvas.width, h = this.sampleCanvas.height;
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return; }
    const buckets = new Map();
    const step = 6;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const key = [Math.round(r / 28), Math.round(g / 28), Math.round(b / 28)].join(',');
        const cur = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        cur.r += r; cur.g += g; cur.b += b; cur.n += 1;
        buckets.set(key, cur);
      }
    }
    // Weight buckets by saturation, not just pixel count — otherwise photos of
    // paintings on a wall/table yield five dabs of wall-white and table-brown
    // while the colourful subject loses the vote. Near-black/near-white buckets
    // are further discounted, and picked dabs must differ visibly (ΔE) so the
    // five aren't all shades of the same dominant colour.
    const cands = [...buckets.values()].map(c => {
      const rgb = { r: c.r / c.n, g: c.g / c.n, b: c.b / c.n };
      const hsl = this.mix.rgbToHsl(rgb);
      const extreme = hsl.l < 0.08 || hsl.l > 0.94;
      return {
        rgb,
        lab: this.mix.rgbToLab(rgb),
        score: c.n * (0.15 + hsl.s) * (extreme ? 0.25 : 1)
      };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const cand of cands) {
      if (picked.length >= 5) break;
      if (picked.every(p => this.mix.deltaE(p.lab, cand.lab) > 14)) picked.push(cand);
    }
    for (const cand of cands) { // top up if the diversity filter left gaps
      if (picked.length >= 5) break;
      if (!picked.includes(cand)) picked.push(cand);
    }
    const dabs = picked.map(c => this.mix.rgbToHex(c.rgb));
    this.setState({ dabs });
    if (!this.state.hasPick && dabs.length && !this._restoredTarget) {
      this.setState({ targetHex: dabs[0] });
    }
  }

  samplePhotoPoint(e) {
    if (!this.imgEl || !this.sampleCanvas) return;
    const rect = this.imgEl.getBoundingClientRect();
    const Wd = rect.width, Hd = rect.height;
    const Wn = this.imgEl.naturalWidth, Hn = this.imgEl.naturalHeight;
    if (!Wd || !Hd || !Wn || !Hn) return;
    // Invert the object-fit:contain letterbox to map pointer coords -> natural
    // coords; drags that wander into the letterbox clamp to the nearest edge.
    const scale = Math.min(Wd / Wn, Hd / Hn);
    const dispW = Wn * scale, dispH = Hn * scale;
    const offX = (Wd - dispW) / 2, offY = (Hd - dispH) / 2;
    const x = Math.min(offX + dispW - 0.5, Math.max(offX, e.clientX - rect.left));
    const y = Math.min(offY + dispH - 0.5, Math.max(offY, e.clientY - rect.top));
    const imgX = (x - offX) / scale, imgY = (y - offY) / scale;
    const canvas = this.sampleCanvas;
    const cx = Math.min(canvas.width - 1, Math.max(0, Math.round(imgX * (canvas.width / Wn))));
    const cy = Math.min(canvas.height - 1, Math.max(0, Math.round(imgY * (canvas.height / Hn))));
    let d;
    try { d = canvas.getContext('2d').getImageData(cx, cy, 1, 1).data; } catch (err) { return; }
    const hex = this.mix.rgbToHex({ r: d[0], g: d[1], b: d[2] });
    this.setState({
      targetHex: hex,
      hasPick: true,
      pickPct: { x: (x / Wd) * 100, y: (y / Hd) * 100 }
    });
  }

  handlePhotoPointerDown = e => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    this._photoDragging = true;
    this.samplePhotoPoint(e);
  };
  handlePhotoPointerMove = e => {
    if (this._photoDragging) this.samplePhotoPoint(e);
  };
  handlePhotoPointerUp = () => { this._photoDragging = false; };

  selectDab = hex => {
    this.setState({ targetHex: hex, hasPick: false });
  };

  // ---------- change photo sheet ----------
  openChangePhoto = () => this.setState({ showChangePhoto: true });
  closeChangePhoto = () => this.setState({ showChangePhoto: false });
  stopPropagation = e => { if (e && e.stopPropagation) e.stopPropagation(); };
  preventDefault = e => { if (e && e.preventDefault) e.preventDefault(); };

  triggerFileInput = () => { if (this.fileInputEl) this.fileInputEl.click(); };

  loadPhotoFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      // Re-encode through a canvas: caps huge camera photos to a size that
      // fits localStorage (so the session survives refreshes) and strips the
      // photo's EXIF metadata as a side effect.
      const img = new Image();
      img.onload = () => {
        let src = ev.target.result;
        const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(img.width, img.height));
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          src = canvas.toDataURL('image/jpeg', 0.85);
        } catch (e) {}
        const recent = [src, ...this.state.recentPhotos.filter(p => p !== src)].slice(0, 5);
        this.dabsComputed = false;
        this.sampleCanvas = null;
        this._restoredTarget = false;
        this.setState({ photoSrc: src, recentPhotos: recent, source: 'photo', showChangePhoto: false, hasPick: false });
      };
      img.onerror = () => this.showToast('That file doesn’t look like an image');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleFileChange = e => {
    const file = e.target.files && e.target.files[0];
    this.loadPhotoFile(file);
  };

  handleDrop = e => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    this.loadPhotoFile(file);
  };

  selectRecentPhoto = src => {
    this.dabsComputed = false;
    this.sampleCanvas = null;
    this._restoredTarget = false;
    this.setState({ photoSrc: src, source: 'photo', showChangePhoto: false, hasPick: false });
  };

  handlePasteCodeChange = e => this.setState({ pasteCodeValue: e.target.value });
  submitPasteCode = () => {
    const v = this.state.pasteCodeValue.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(v) && !/^#?[0-9a-fA-F]{3}$/.test(v)) {
      this.showToast('That doesn’t look like a hex code — try #A0522D');
      return;
    }
    const hex = v.startsWith('#') ? v : '#' + v;
    this.setState({ targetHex: hex, hasPick: false, showChangePhoto: false, pasteCodeValue: '' });
  };

  openWheelFromSheet = () => {
    // Sync the wheel to whatever colour is currently targeted
    const hsl = this.mix.rgbToHsl(this.mix.hexToRgb(this.state.targetHex));
    this.setState({ source: 'wheel', showChangePhoto: false, wheelHue: hsl.h, wheelSat: hsl.s, wheelLight: hsl.l });
  };
  backToPhoto = () => this.setState({ source: 'photo' });

  // ---------- wheel ----------
  updateHueFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const hue = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    this.setState({ wheelHue: hue });
    this.recomputeTargetFromWheel(hue, this.state.wheelSat, this.state.wheelLight);
  }

  recomputeTargetFromWheel(hue, sat, light) {
    const rgb = this.mix.hslToRgb({ h: hue, s: sat, l: light });
    this.setState({ targetHex: this.mix.rgbToHex(rgb), hasPick: false });
  }

  handleWheelPointerDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId);
    this.setState({ wheelDragging: true });
    this.updateHueFromEvent(e);
  };
  handleWheelPointerMove = e => {
    if (!this.state.wheelDragging) return;
    this.updateHueFromEvent(e);
  };
  handleWheelPointerUp = () => this.setState({ wheelDragging: false });

  handleSatChange = e => {
    const v = Number(e.target.value) / 100;
    this.setState({ wheelSat: v });
    this.recomputeTargetFromWheel(this.state.wheelHue, v, this.state.wheelLight);
  };
  handleLightChange = e => {
    const v = Number(e.target.value) / 100;
    this.setState({ wheelLight: v });
    this.recomputeTargetFromWheel(this.state.wheelHue, this.state.wheelSat, v);
  };

  // ---------- medium ----------
  setMedium = m => this.setState({ medium: m });

  // ---------- pigments / inventory ----------
  getPigments(medium) {
    const base = this.data.CATALOGUES[medium] || [];
    const custom = this.state.customPigments.filter(p => p.medium === medium);
    return [...base, ...custom];
  }

  getInventoryPigments(medium) {
    const ids = this.state.inventory[medium] || [];
    return this.getPigments(medium).filter(p => ids.includes(p.id));
  }

  toggleInventory = id => {
    const medium = this.state.medium;
    const list = this.state.inventory[medium] || [];
    const has = list.includes(id);
    const newList = has ? list.filter(x => x !== id) : [...list, id];
    const inventory = { ...this.state.inventory, [medium]: newList };
    this.setState({ inventory }, () => this.persist());
  };

  openMyPaints = () => this.setState({ showMyPaints: true });
  closeMyPaints = () => this.setState({ showMyPaints: false, showPickList: false, showTypeName: false, confirmClear: false });

  togglePickList = () => this.setState({ showPickList: !this.state.showPickList, showTypeName: false });
  toggleTypeName = () => this.setState({ showTypeName: !this.state.showTypeName, showPickList: false });
  handlePickListQueryChange = e => this.setState({ pickListQuery: e.target.value });

  handleAddNameChange = e => this.setState({ addNameValue: e.target.value });
  handleAddHexChange = e => this.setState({ addHexValue: e.target.value });
  submitCustomPigment = () => {
    const name = this.state.addNameValue.trim();
    if (!name) { this.showToast('Give the paint a name first'); return; }
    const medium = this.state.medium;
    const id = 'custom-' + Date.now();
    const pigment = { id, brand: 'Custom', name, code: '', hex: this.state.addHexValue, medium };
    const customPigments = [...this.state.customPigments, pigment];
    const inventory = { ...this.state.inventory, [medium]: [...(this.state.inventory[medium] || []), id] };
    this.setState({ customPigments, inventory, addNameValue: '', addHexValue: '#8a6d3b', showTypeName: false }, () => this.persist());
    this.showToast(name + ' added to your shelf');
  };

  handlePhotographTubes = () => {
    this.setState({ showPickList: true, showTypeName: false });
    this.showToast('Photo detection is coming soon — pick your tubes below for now');
  };

  // Two-tap confirm (in the page's own style, no browser dialog): first tap
  // arms the link for 4s, second tap clears the shelf for the current medium.
  removeAllPaints = () => {
    const medium = this.state.medium;
    const count = (this.state.inventory[medium] || []).length;
    if (!count) return;
    if (!this.state.confirmClear) {
      clearTimeout(this._clearTimer);
      this.setState({ confirmClear: true });
      this._clearTimer = setTimeout(() => this.setState({ confirmClear: false }), 4000);
      return;
    }
    clearTimeout(this._clearTimer);
    const label = (this.data.MEDIUM_LABELS[medium] || medium).toLowerCase();
    const inventory = { ...this.state.inventory, [medium]: [] };
    this.setState({ inventory, confirmClear: false }, () => this.persist());
    this.showToast('Shelf cleared — recipes now draw on the full ' + label + ' range');
  };

  // ---------- shopping list ----------
  addPigmentToShoppingList = pigment => {
    if (this.state.shoppingList.find(s => s.pigmentId === pigment.id)) {
      this.showToast(pigment.name + ' is already on your list');
      return;
    }
    const item = { pigmentId: pigment.id, medium: this.state.medium, forName: this._targetName || 'this colour', forHex: this.state.targetHex };
    const shoppingList = [...this.state.shoppingList, item];
    this.setState({ shoppingList }, () => this.persist());
    this.showToast(pigment.name + ' added to your shopping list');
  };

  buyShoppingItem = item => {
    const medium = item.medium;
    const inventory = { ...this.state.inventory, [medium]: [...(this.state.inventory[medium] || []), item.pigmentId] };
    const shoppingList = this.state.shoppingList.filter(s => s !== item);
    this.setState({ inventory, shoppingList }, () => this.persist());
    this.showToast('Added to My Paints');
  };

  // ---------- recipe (memoized) ----------
  computeRecipe() {
    if (!this.state.ready) return null;
    const medium = this.state.medium;
    const inventoryPigments = this.getInventoryPigments(medium);
    const fullCatalog = this.getPigments(medium);
    const usingFull = inventoryPigments.length === 0;
    const pool = usingFull ? fullCatalog : inventoryPigments;
    const key = medium + '|' + this.state.targetHex + '|' + pool.map(p => p.id).join(',') + '|' + fullCatalog.length;
    if (this._recipeKey === key && this._recipeCache) return this._recipeCache;
    const recipe = this.mix.findRecipe(this.state.targetHex, pool, MIX_FN);
    if (!recipe) { this._recipeKey = key; this._recipeCache = null; return null; }

    let buy = null, ceiling = false, ceilingMatch = recipe.matchPercent;
    if (recipe.matchPercent < MATCH_THRESHOLD) {
      if (usingFull) {
        // Already drawing from every pigment we know — nothing left to buy.
        ceiling = true;
        ceilingMatch = recipe.matchPercent;
      } else {
        const ownedIds = new Set(inventoryPigments.map(p => p.id));
        // Don't suggest buying a near-twin of a tube already on the shelf
        // (e.g. Artists' Titanium White when Winton Titanium White is owned).
        const ownedLabs = inventoryPigments.map(p => this.mix.rgbToLab(this.mix.hexToRgb(p.hex)));
        const upgradePool = fullCatalog.filter(p =>
          ownedIds.has(p.id) ||
          ownedLabs.every(lab => this.mix.deltaE(lab, this.mix.rgbToLab(this.mix.hexToRgb(p.hex))) > 3)
        );
        const catalogBest = this.mix.findRecipe(this.state.targetHex, upgradePool, MIX_FN);
        const missing = catalogBest ? catalogBest.items.filter(it => !ownedIds.has(it.pigment.id)) : [];
        if (catalogBest && missing.length && catalogBest.matchPercent > recipe.matchPercent + 1) {
          buy = { items: missing, matchPercent: catalogBest.matchPercent };
        } else {
          ceiling = true;
          ceilingMatch = catalogBest ? Math.max(catalogBest.matchPercent, recipe.matchPercent) : recipe.matchPercent;
        }
      }
    }

    let ceilingTip = null;
    if (ceiling && medium !== 'acrylic') {
      const specialtyList = (this.data.CATALOGUES.acrylic || []).filter(p => p.special);
      if (specialtyList.length) {
        const targetHsl = this.mix.rgbToHsl(this.mix.hexToRgb(this.state.targetHex));
        let bestP = null, bestD = Infinity;
        specialtyList.forEach(p => {
          const h = this.mix.rgbToHsl(this.mix.hexToRgb(p.hex)).h;
          let d = Math.abs(h - targetHsl.h) % 360; d = d > 180 ? 360 - d : d;
          if (d < bestD) { bestD = d; bestP = p; }
        });
        ceilingTip = bestP;
      }
    }

    const result = { ...recipe, usingFull, buy, ceiling, ceilingMatch, ceilingTip };
    this._recipeKey = key; this._recipeCache = result;
    return result;
  }

  renderVals() {
    const isMobile = this.state.viewportWidth < 860;
    const medium = this.state.medium;
    const mediumLabel = this.data.MEDIUM_LABELS[medium] || 'Oil';

    const mediums = ['oil', 'acrylic', 'watercolour'].map(m => ({
      label: this.data.MEDIUM_LABELS[m] || m,
      onSelect: () => this.setMedium(m),
      pillStyle: {
        fontFamily: 'Newsreader,Georgia,serif', fontSize: '12.5px', fontWeight: m === medium ? 600 : 400,
        padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
        background: m === medium ? '#2b2620' : 'transparent',
        color: m === medium ? '#f4eee2' : '#6d6353'
      }
    }));

    const mix = this.mix;
    const targetHex = this.state.targetHex;
    const targetRgb = mix.hexToRgb(targetHex);
    const targetCmyk = mix.rgbToCmyk(targetRgb);
    const targetName = mix.nameColor(targetHex);
    this._targetName = targetName;

    const recipe = this.computeRecipe();
    let recipeItems = [], recipeLabel = '', mixedHex = targetHex, matchPercent = 0;
    let hasBuySuggestion = false, upgradeMatchPercent = 0, upgradeItems = [];
    let hasCeiling = false, ceilingMatch = 0, hasCeilingTip = false, ceilingTipName = '', ceilingTipHex = '';
    if (recipe) {
      const labels = mix.formatParts(recipe.items.map(i => i.weight));
      recipeItems = recipe.items.map((it, i) => ({
        hex: it.pigment.hex,
        label: labels[i],
        name: it.pigment.name,
        brandCode: [it.pigment.brand, it.pigment.code].filter(Boolean).join(' · ').toUpperCase()
      }));
      recipeLabel = recipe.usingFull ? ('MIXING CARD · FROM FULL ' + mediumLabel.toUpperCase() + ' RANGE') : 'MIXING CARD · BEST WITH YOUR SHELF';
      mixedHex = recipe.mixedHex;
      matchPercent = recipe.matchPercent;
      if (recipe.buy) {
        hasBuySuggestion = true;
        upgradeMatchPercent = recipe.buy.matchPercent;
        upgradeItems = recipe.buy.items.map(it => {
          const p = it.pigment;
          const already = this.state.shoppingList.find(s => s.pigmentId === p.id);
          return {
            hex: p.hex, name: p.name, code: p.code || '—', brand: p.brand.toUpperCase(),
            actionLabel: already ? 'On your list' : 'Add to shopping list',
            onAdd: () => this.addPigmentToShoppingList(p)
          };
        });
      } else if (recipe.ceiling) {
        hasCeiling = true;
        ceilingMatch = recipe.ceilingMatch;
        if (recipe.ceilingTip) {
          hasCeilingTip = true;
          ceilingTipName = recipe.ceilingTip.name;
          ceilingTipHex = recipe.ceilingTip.hex;
        }
      }
    }

    const inventoryPigments = this.getInventoryPigments(medium);
    const inventoryCount = inventoryPigments.length;
    const brandsSet = new Set(inventoryPigments.map(p => p.brand));

    // dabs
    const dabSwatches = (this.state.dabs || []).map(hex => ({
      hex,
      style: {
        width: 38, height: 38, borderRadius: '50%', background: hex, cursor: 'pointer',
        boxShadow: (hex === targetHex && !this.state.hasPick)
          ? '0 1px 3px rgba(43,38,32,.25), 0 0 0 2px #fffdf7, 0 0 0 3.5px #2b2620'
          : '0 1px 3px rgba(43,38,32,.25)'
      },
      onSelect: () => this.selectDab(hex)
    }));

    // grouped inventory for My Paints
    const groups = {};
    inventoryPigments.forEach(p => {
      if (!groups[p.brand]) groups[p.brand] = [];
      groups[p.brand].push(p);
    });
    const groupedInventory = Object.keys(groups).sort().map(brand => ({
      brand: brand.toUpperCase(),
      count: groups[brand].length,
      pigments: groups[brand].map(p => ({
        id: p.id, name: p.name, hex: p.hex,
        onRemove: () => this.toggleInventory(p.id)
      }))
    }));

    // pick list (search full catalogue, checkbox toggle)
    const ownedIds = new Set(this.state.inventory[medium] || []);
    const q = this.state.pickListQuery.trim().toLowerCase();
    const pickListResults = this.getPigments(medium)
      .filter(p => !q || (p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)))
      .slice(0, 200)
      .map(p => {
        const owned = ownedIds.has(p.id);
        return {
          id: p.id, name: p.name, brand: p.brand, hex: p.hex, code: p.code || '',
          onToggle: () => this.toggleInventory(p.id),
          checkboxStyle: {
            width: 15, height: 15, borderRadius: 3, flex: 'none',
            border: '1.5px solid ' + (owned ? '#2b2620' : '#b9ab8d'),
            background: owned ? '#2b2620' : 'transparent'
          }
        };
      });

    // shopping list
    const shoppingItems = this.state.shoppingList.map(s => {
      const p = this.getPigments(s.medium).find(pp => pp.id === s.pigmentId);
      if (!p) return null;
      return {
        id: p.id, name: p.name, hex: p.hex, code: p.code || '—',
        forName: mix.nameColor(s.forHex).toUpperCase(),
        onBuy: () => this.buyShoppingItem(s)
      };
    }).filter(Boolean);

    // recent photo thumbs
    const recentThumbs = this.state.recentPhotos.map(src => ({
      src,
      isCurrent: src === this.state.photoSrc,
      onSelect: () => this.selectRecentPhoto(src),
      wrapStyle: {
        position: 'relative', width: 92, height: 70, padding: 2,
        border: src === this.state.photoSrc ? '2px solid #2b2620' : '1px solid #d9d0bd',
        background: '#fffdf7', cursor: 'pointer', flex: 'none'
      }
    }));

    // wheel visuals
    const wheelSize = isMobile ? 250 : 300;
    const rad = (this.state.wheelHue * Math.PI) / 180;
    const dotR = wheelSize * 0.42;
    const dotX = wheelSize / 2 + dotR * Math.sin(rad) - 12;
    const dotY = wheelSize / 2 - dotR * Math.cos(rad) - 12;
    const innerSize = wheelSize * 0.66;
    const centerSize = wheelSize * 0.45;

    const satHex = mix.rgbToHex(mix.hslToRgb({ h: this.state.wheelHue, s: 1, l: 0.5 }));
    const satTrackStyle = { background: 'linear-gradient(90deg, #8a8a8a, ' + satHex + ')' };
    const lightMidHex = mix.rgbToHex(mix.hslToRgb({ h: this.state.wheelHue, s: this.state.wheelSat, l: 0.5 }));
    const lightTrackStyle = { background: 'linear-gradient(90deg, #f2eee2, ' + lightMidHex + ', #1a1712)' };

    return {
      isMobile,
      rootStyle: {
        fontFamily: "'Newsreader',Georgia,serif", color: '#2b2620', background: '#f4eee2',
        minHeight: '100vh', boxSizing: 'border-box', padding: isMobile ? '20px 16px 60px' : '32px 44px 60px',
        display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1180, margin: '0 auto'
      },
      headerStyle: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
      titleSize: isMobile ? '20px' : '24px',
      taglineMaxWidth: isMobile ? '520px' : 'none',
      taglineWhiteSpace: isMobile ? 'normal' : 'nowrap',
      contentGridStyle: {
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 22 : 32, alignItems: 'start'
      },
      mediums,
      isPhotoSource: this.state.source === 'photo',
      isWheelSource: this.state.source === 'wheel',
      photoSrc: this.state.photoSrc,
      // height:auto + max-height + contain shows the whole photo whatever its
      // aspect ratio (letterboxing only very tall images) instead of cropping;
      // touch-action:none lets a finger drag the picker without scrolling.
      photoImgStyle: { display: 'block', width: '100%', height: 'auto', maxHeight: isMobile ? 320 : 440, objectFit: 'contain', cursor: 'crosshair', touchAction: 'none' },
      hasPick: this.state.hasPick,
      pickMarkerStyle: {
        position: 'absolute', left: this.state.pickPct.x + '%', top: this.state.pickPct.y + '%',
        width: 20, height: 20, marginLeft: -10, marginTop: -10, border: '2px solid #fffdf7',
        borderRadius: '50%', boxShadow: '0 1px 4px rgba(43,38,32,.5)', pointerEvents: 'none'
      },
      dabSwatches,
      wheelSize,
      wheelInnerStyle: {
        position: 'absolute', left: (wheelSize - innerSize) / 2, top: (wheelSize - innerSize) / 2,
        width: innerSize, height: innerSize, borderRadius: '50%', background: '#f4eee2', pointerEvents: 'none'
      },
      wheelDotStyle: {
        position: 'absolute', left: dotX, top: dotY, width: 24, height: 24, borderRadius: '50%',
        background: satHex, border: '3px solid #fffdf7', boxShadow: '0 1px 5px rgba(43,38,32,.5)', pointerEvents: 'none'
      },
      wheelCenterStyle: {
        position: 'absolute', left: (wheelSize - centerSize) / 2, top: (wheelSize - centerSize) / 2,
        width: centerSize, height: centerSize, borderRadius: '50%', background: targetHex,
        boxShadow: 'inset 0 -8px 14px rgba(0,0,0,.28), 0 1px 4px rgba(43,38,32,.3)', pointerEvents: 'none'
      },
      wheelCenterLabelStyle: {
        position: 'absolute', left: (wheelSize - centerSize) / 2, top: wheelSize / 2 + centerSize / 2 - 20,
        width: centerSize, textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
        color: '#f4eee2', pointerEvents: 'none'
      },
      satSliderVal: Math.round(this.state.wheelSat * 100),
      lightSliderVal: Math.round(this.state.wheelLight * 100),
      satTrackStyle, lightTrackStyle,

      targetHex, targetName,
      targetRgbStr: Math.round(targetRgb.r) + ' ' + Math.round(targetRgb.g) + ' ' + Math.round(targetRgb.b),
      targetCmykStr: targetCmyk.c + ' ' + targetCmyk.m + ' ' + targetCmyk.y + ' ' + targetCmyk.k,

      hasRecipe: !!recipe,
      recipeLabel, recipeItems, mixedHex, matchPercent,
      inventoryCount,
      hasBuySuggestion, upgradeMatchPercent, upgradeItems,
      hasCeiling, ceilingMatch, mediumLabel, mediumLabelLower: mediumLabel.toLowerCase(),
      hasCeilingTip, ceilingTipName, ceilingTipHex,

      showChangePhoto: this.state.showChangePhoto,
      sheetAlign: isMobile ? 'flex-end' : 'center',
      sheetWidth: isMobile ? '100%' : '520px',
      sheetRadiusStyle: isMobile ? { borderRadius: '14px 14px 0 0' } : {},
      recentThumbs,
      pasteCodeValue: this.state.pasteCodeValue,

      showMyPaints: this.state.showMyPaints,
      myPaintsWidth: isMobile ? '100%' : '460px',
      brandCount: brandsSet.size,
      showPickList: this.state.showPickList,
      showTypeName: this.state.showTypeName,
      pickListQuery: this.state.pickListQuery,
      pickListResults,
      addHexValue: this.state.addHexValue,
      addNameValue: this.state.addNameValue,
      groupedInventory,
      hasShoppingList: shoppingItems.length > 0,
      shoppingItems,

      hasToast: !!this.state.toast,
      toastText: this.state.toast || ''
    };
  }

  render() {
    const v = this.renderVals();
    return html`
    <div style=${v.rootStyle}>

      <div style=${v.headerStyle}>
        <div style="display:flex;align-items:center;gap:14px">
          <a href="../tools/" title="Back to lishaxu.com" aria-label="Back to Tools" style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #d9d0bd;border-radius:3px;background:#fffdf7;color:#2b2620;text-decoration:none;font-size:16px;line-height:1">←</a>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: v.taglineMaxWidth }}>
            <span style=${{ fontFamily: "'Newsreader',Georgia,serif", fontSize: v.titleSize, fontWeight: 600, fontStyle: 'italic', color: '#2b2620' }}>The Colour You’re After</span>
            <span style=${{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 13, color: '#8a7f6d', lineHeight: 1.4, whiteSpace: v.taglineWhiteSpace }}>Pick a colour from a photo or colour wheel to get the exact mix from paints you already own.</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;background:#e9e0cd;border-radius:999px;padding:4px">
          ${v.mediums.map(m => html`
            <span key=${m.label} onClick=${m.onSelect} style=${m.pillStyle}>${m.label}</span>
          `)}
        </div>
      </div>

      <div style=${v.contentGridStyle}>

        <div style="display:flex;flex-direction:column;gap:14px">

          ${v.isPhotoSource && html`
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="position:relative;border:1px solid #d9d0bd;padding:8px;background:#fffdf7">
                <div style="position:relative">
                  <img src=${v.photoSrc} alt="Your reference photo" draggable=${false}
                       onLoad=${this.handleImgLoad} ref=${this.setImgRef} style=${v.photoImgStyle}
                       onPointerDown=${this.handlePhotoPointerDown} onPointerMove=${this.handlePhotoPointerMove}
                       onPointerUp=${this.handlePhotoPointerUp} onPointerCancel=${this.handlePhotoPointerUp} />
                  ${v.hasPick && html`<div style=${v.pickMarkerStyle}></div>`}
                </div>
                <span onClick=${this.openChangePhoto} style="position:absolute;right:16px;top:16px;font-family:'Newsreader',Georgia,serif;font-size:12px;background:rgba(255,253,247,.92);border:1px solid #d9d0bd;border-radius:3px;padding:6px 12px;cursor:pointer">Change source</span>
              </div>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                ${v.dabSwatches.map((dab, i) => html`
                  <div key=${i} onClick=${dab.onSelect} style=${dab.style}></div>
                `)}
              </div>
              <p style="margin:0;text-align:center;font-family:'Newsreader',Georgia,serif;font-size:13px;font-style:italic;color:#8a7f6d">Tap or drag anywhere on the photo to pick a colour — or choose one of the five dabs pulled from it.</p>
            </div>
          `}

          ${v.isWheelSource && html`
            <div style="display:flex;flex-direction:column;gap:16px;align-items:center">
              <div style=${{ position: 'relative', width: v.wheelSize, height: v.wheelSize, touchAction: 'none' }}
                   onPointerDown=${this.handleWheelPointerDown} onPointerMove=${this.handleWheelPointerMove} onPointerUp=${this.handleWheelPointerUp}>
                <div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg, #e33a2c, #e8722a, #f0b21f, #f2ce1b, #b3c02c, #5d9c3a, #2c8f78, #2a6fa8, #2b4a9e, #4b3a98, #7c3d9c, #b03580, #d13455, #e33a2c);box-shadow:0 2px 8px rgba(43,38,32,.25);pointer-events:none"></div>
                <div style=${v.wheelInnerStyle}></div>
                <div style=${v.wheelDotStyle}></div>
                <div style=${v.wheelCenterStyle}></div>
                <span style=${v.wheelCenterLabelStyle}>${v.targetHex}</span>
              </div>
              <div style="width:100%;max-width:380px;display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:#8a7f6d"><span>MUTED</span><span>VIVID</span></div>
                <input class="pm-slider" type="range" min="0" max="100" value=${v.satSliderVal} onChange=${this.handleSatChange} style=${v.satTrackStyle} />
                <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:#8a7f6d;margin-top:6px"><span>LIGHTER</span><span>DEEPER</span></div>
                <input class="pm-slider" type="range" min="0" max="100" value=${v.lightSliderVal} onChange=${this.handleLightChange} style=${v.lightTrackStyle} />
              </div>
              <p style="margin:0;text-align:center;font-family:'Newsreader',Georgia,serif;font-size:13px;font-style:italic;color:#8a7f6d">Drag around the ring for hue, then tune vividness and depth.</p>
              <span onClick=${this.backToPhoto} style="font-family:'Newsreader',Georgia,serif;font-size:13px;text-decoration:underline;cursor:pointer;color:#6d6353">Use a photo instead</span>
            </div>
          `}

        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="background:#fffdf7;border:1px solid #d9d0bd;padding:20px 22px;display:flex;flex-direction:column;gap:13px">
            <div style="display:flex;align-items:center;gap:14px">
              <div style=${{ width: 56, height: 56, borderRadius: '50%', background: v.targetHex, boxShadow: 'inset 0 -6px 10px rgba(0,0,0,.18)', flex: 'none' }}></div>
              <div style="display:flex;flex-direction:column">
                <span style="font-family:'Newsreader',Georgia,serif;font-size:17px;font-weight:600;color:#2b2620">${v.targetName}</span>
                <span style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#8a7f6d">${v.targetHex} · RGB ${v.targetRgbStr} · CMYK ${v.targetCmykStr}</span>
              </div>
            </div>
            <div style="height:1px;background:#e6ddc9"></div>

            ${v.hasRecipe && html`
              <div style="display:flex;flex-direction:column;gap:12px">
                <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">
                  <span style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;color:#8a7f6d">${v.recipeLabel}</span>
                  <span style="font-family:'Newsreader',Georgia,serif;font-size:12px;color:#6d6353;cursor:pointer" onClick=${this.openMyPaints}>using <span style="font-weight:600;text-decoration:underline">My Paints · ${v.inventoryCount}</span></span>
                </div>
                ${v.recipeItems.map((item, i) => html`
                  <div key=${i} style="display:flex;align-items:center;gap:12px">
                    <div style=${{ width: 30, height: 30, borderRadius: ['50% 46% 52% 48%', '47% 52% 46% 51%', '52% 48% 50% 46%'][i % 3], background: item.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08), 0 1px 3px rgba(43,38,32,.25)', flex: 'none' }}></div>
                    <div style="display:flex;flex-direction:column">
                      <span style="font-family:'Newsreader',Georgia,serif;font-size:15px;color:#2b2620"><strong style="font-weight:600">${item.label}</strong> ${item.name}</span>
                      <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:#8a7f6d">${item.brandCode}</span>
                    </div>
                  </div>
                `)}
                <div style="display:flex;align-items:center;gap:12px;background:#f4eee2;border-radius:3px;padding:9px 12px">
                  <div style="display:flex">
                    <div style=${{ width: 24, height: 24, borderRadius: '50%', background: v.targetHex, flex: 'none' }}></div>
                    <div style=${{ width: 24, height: 24, borderRadius: '50%', background: v.mixedHex, marginLeft: -8, boxShadow: '0 0 0 2px #fffdf7', flex: 'none' }}></div>
                  </div>
                  <span style="font-family:'Newsreader',Georgia,serif;font-size:13px;color:#2b2620"><strong style="font-weight:600">${v.matchPercent}% match</strong> — target beside your mix</span>
                </div>
              </div>

              ${v.hasBuySuggestion && html`
                <div style="border:1px dashed #b9ab8d;padding:12px 16px;display:flex;flex-direction:column;gap:10px;background:rgba(255,253,247,.6)">
                  <span style="font-family:'Newsreader',Georgia,serif;font-size:13px;color:#2b2620">For <strong style="font-weight:600">${v.upgradeMatchPercent}% match</strong>, add to your shelf:</span>
                  ${v.upgradeItems.map(u => html`
                    <div key=${u.name} style="display:flex;align-items:center;gap:11px">
                      <div style=${{ width: 24, height: 24, borderRadius: '50%', background: u.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', flex: 'none' }}></div>
                      <span style="font-family:'Newsreader',Georgia,serif;font-size:13px;color:#2b2620;flex:1"><strong style="font-weight:600">${u.name}</strong> <span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:#8a7f6d">${u.code} · ${u.brand}</span></span>
                      <span onClick=${u.onAdd} style="font-family:'Newsreader',Georgia,serif;font-size:11.5px;text-decoration:underline;cursor:pointer;color:#6d6353;white-space:nowrap;flex:none">${u.actionLabel}</span>
                    </div>
                  `)}
                </div>
              `}
              ${v.hasCeiling && html`
                <div style="border:1px dashed #b9ab8d;padding:12px 16px;display:flex;flex-direction:column;gap:10px;background:rgba(255,253,247,.6)">
                  <div style="display:flex;gap:12px;align-items:center">
                    <div style=${{ width: 26, height: 26, borderRadius: '50%', background: v.mixedHex, flex: 'none' }}></div>
                    <span style="font-family:'Newsreader',Georgia,serif;font-size:13px;line-height:1.5;color:#2b2620">Chroma ceiling reached — even the full ${v.mediumLabel} range tops out at <strong style="font-weight:600">${v.ceilingMatch}%</strong>. This shade likely needs a specialty or fluorescent pigment beyond standard ${v.mediumLabelLower} paints.</span>
                  </div>
                  ${v.hasCeilingTip && html`
                    <div style="display:flex;gap:12px;align-items:center;padding-top:6px;border-top:1px solid #e6ddc9">
                      <div style=${{ width: 22, height: 22, borderRadius: '50%', background: v.ceilingTipHex, boxShadow: '0 0 8px ' + v.ceilingTipHex, flex: 'none' }}></div>
                      <span style="font-family:'Newsreader',Georgia,serif;font-size:12.5px;line-height:1.5;color:#6d6353">True fluorescents are really an acrylic-only pigment — try <strong style="font-weight:600">${v.ceilingTipName}</strong> (Golden) as an accent over or alongside your ${v.mediumLabelLower}.</span>
                    </div>
                  `}
                </div>
              `}
            `}
          </div>
        </div>

      </div>

      ${v.showChangePhoto && html`
        <div style=${{ position: 'fixed', inset: 0, background: 'rgba(43,38,32,.35)', zIndex: 40, display: 'flex', alignItems: v.sheetAlign, justifyContent: 'center' }} onClick=${this.closeChangePhoto}>
          <div style=${Object.assign({ background: '#fffdf7', border: '1px solid #d9d0bd', boxShadow: '0 18px 50px rgba(43,38,32,.35)', padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 16, width: v.sheetWidth, maxWidth: '92vw' }, v.sheetRadiusStyle)} onClick=${this.stopPropagation}>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-family:'Newsreader',Georgia,serif;font-size:19px;font-weight:600;font-style:italic;color:#2b2620">Change your colour source</span>
              <span onClick=${this.closeChangePhoto} style="font-size:16px;color:#8a7f6d;cursor:pointer">✕</span>
            </div>
            <div onDragOver=${this.preventDefault} onDrop=${this.handleDrop} style="border:1.5px dashed #b9ab8d;background:#f4eee2;display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 20px;text-align:center">
              <div style="width:48px;height:48px;border-radius:50%;background:repeating-linear-gradient(45deg,#e6ddc9 0 7px,#f4eee2 7px 14px)"></div>
              <span style="font-family:'Newsreader',Georgia,serif;font-size:15px;font-weight:600;color:#2b2620">Drop a new photograph here</span>
              <span onClick=${this.triggerFileInput} style="font-family:'Newsreader',Georgia,serif;font-size:13px;background:#2b2620;color:#f4eee2;border-radius:3px;padding:9px 20px;cursor:pointer">Browse files…</span>
              <input type="file" accept="image/*" ref=${this.setFileInputRef} onChange=${this.handleFileChange} style="display:none" />
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:#8a7f6d">RECENT</span>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${v.recentThumbs.map((thumb, i) => html`
                  <div key=${i} onClick=${thumb.onSelect} style=${thumb.wrapStyle}>
                    <img src=${thumb.src} alt="Recent photo" style="display:block;width:100%;height:100%;object-fit:cover" />
                    ${thumb.isCurrent && html`
                      <span style="position:absolute;left:4px;bottom:4px;font-family:'IBM Plex Mono',monospace;font-size:8px;background:rgba(255,253,247,.9);padding:1px 5px">NOW</span>
                    `}
                  </div>
                `)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="flex:1;height:1px;background:#e6ddc9"></div>
              <span style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:#a99c85">OR</span>
              <div style="flex:1;height:1px;background:#e6ddc9"></div>
            </div>
            <div style="display:flex;gap:8px">
              <input value=${v.pasteCodeValue} onChange=${this.handlePasteCodeChange} placeholder="Paste a code — #A0522D…" style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:12.5px;background:#f4eee2;border:1px solid #d9d0bd;border-radius:3px;padding:10px 13px;color:#2b2620" />
              <span onClick=${this.submitPasteCode} style="font-family:'Newsreader',Georgia,serif;font-size:12.5px;border:1px solid #2b2620;border-radius:3px;padding:10px 15px;display:flex;align-items:center;cursor:pointer;color:#2b2620">Go</span>
            </div>
            <span onClick=${this.openWheelFromSheet} style="font-family:'Newsreader',Georgia,serif;font-size:13px;text-align:center;color:#6d6353;border-top:1px solid #e6ddc9;padding-top:13px;cursor:pointer">Rather mix from scratch? <span style="font-weight:600;text-decoration:underline">Open the colour wheel</span></span>
          </div>
        </div>
      `}

      ${v.showMyPaints && html`
        <div style="position:fixed;inset:0;background:rgba(43,38,32,.35);z-index:50;display:flex;justify-content:flex-end" onClick=${this.closeMyPaints}>
          <div style=${{ background: '#f4eee2', width: v.myPaintsWidth, maxWidth: '100vw', height: '100%', overflowY: 'auto', padding: '24px 26px 40px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '-12px 0 40px rgba(43,38,32,.25)' }} onClick=${this.stopPropagation}>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:baseline;gap:12px">
                <span onClick=${this.closeMyPaints} style="font-family:'Newsreader',Georgia,serif;font-size:14px;color:#6d6353;cursor:pointer">✕ Close</span>
                <span style="font-family:'Newsreader',Georgia,serif;font-size:20px;font-weight:600;font-style:italic;color:#2b2620">My Paints</span>
              </div>
              <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.06em;color:#8a7f6d">${v.inventoryCount} TUBES · ${v.brandCount} MAKERS · ${v.mediumLabel.toUpperCase()}</span>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <span onClick=${this.handlePhotographTubes} style="flex:1;min-width:140px;text-align:center;font-family:'Newsreader',Georgia,serif;font-size:13px;background:#2b2620;color:#f4eee2;border-radius:3px;padding:9px 0;cursor:pointer">Photograph tubes</span>
              <span onClick=${this.togglePickList} style="flex:1;min-width:140px;text-align:center;font-family:'Newsreader',Georgia,serif;font-size:13px;border:1px solid #b9ab8d;border-radius:3px;color:#6d6353;padding:8px 0;cursor:pointer">Pick from a list</span>
              <span onClick=${this.toggleTypeName} style="flex:1;min-width:140px;text-align:center;font-family:'Newsreader',Georgia,serif;font-size:13px;border:1px solid #b9ab8d;border-radius:3px;color:#6d6353;padding:8px 0;cursor:pointer">Type a name…</span>
            </div>

            ${v.inventoryCount > 0 && html`
              <span onClick=${this.removeAllPaints} style=${{ alignSelf: 'flex-end', marginTop: -10, fontFamily: "'Newsreader',Georgia,serif", fontSize: 12, textDecoration: 'underline', color: this.state.confirmClear ? '#2b2620' : '#6d6353', fontWeight: this.state.confirmClear ? 600 : 400, cursor: 'pointer' }}>${this.state.confirmClear ? 'Tap again to clear all ' + v.inventoryCount + ' tubes' : 'Remove all ' + v.inventoryCount + ' tubes'}</span>
            `}

            ${v.showPickList && html`
              <div style="display:flex;flex-direction:column;gap:8px;background:#fffdf7;border:1px solid #d9d0bd;padding:14px 16px">
                <input value=${v.pickListQuery} onChange=${this.handlePickListQueryChange} placeholder=${'Search the full ' + v.mediumLabel + ' range…'} style="font-family:'Newsreader',Georgia,serif;font-size:13px;border:1px solid #d9d0bd;border-radius:3px;padding:8px 11px;color:#2b2620" />
                <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto">
                  ${v.pickListResults.map(p => html`
                    <div key=${p.id} onClick=${p.onToggle} style="display:flex;align-items:center;gap:10px;padding:6px 4px;cursor:pointer">
                      <span style=${p.checkboxStyle}></span>
                      <span style=${{ width: 18, height: 18, borderRadius: '50%', background: p.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', flex: 'none' }}></span>
                      <div style="display:flex;flex-direction:column;min-width:0">
                        <span style="font-family:'Newsreader',Georgia,serif;font-size:13px;color:#2b2620">${p.name}</span>
                        <span style="font-family:'IBM Plex Mono',monospace;font-size:8.5px;letter-spacing:.06em;color:#a99c85;text-transform:uppercase">${p.brand}</span>
                      </div>
                      <span style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#8a7f6d;margin-left:auto;flex:none">${p.code}</span>
                    </div>
                  `)}
                </div>
              </div>
            `}

            ${v.showTypeName && html`
              <div style="display:flex;gap:8px;align-items:center;background:#fffdf7;border:1px solid #d9d0bd;padding:14px 16px">
                <input type="color" value=${v.addHexValue} onChange=${this.handleAddHexChange} style="width:36px;height:36px;border:none;border-radius:4px;padding:0;background:none;flex:none;cursor:pointer" />
                <input value=${v.addNameValue} onChange=${this.handleAddNameChange} placeholder="Paint name — e.g. Naples Yellow" style="flex:1;font-family:'Newsreader',Georgia,serif;font-size:13px;border:1px solid #d9d0bd;border-radius:3px;padding:8px 11px;color:#2b2620" />
                <span onClick=${this.submitCustomPigment} style="font-family:'Newsreader',Georgia,serif;font-size:12.5px;border:1px solid #2b2620;border-radius:3px;padding:8px 14px;cursor:pointer;color:#2b2620">Add</span>
              </div>
            `}

            ${v.groupedInventory.map(group => html`
              <div key=${group.brand} style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;align-items:baseline;gap:8px"><span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:#8a7f6d">${group.brand}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#a99c85">${group.count}</span></div>
                <div style="display:flex;flex-wrap:wrap;gap:7px">
                  ${group.pigments.map(p => html`
                    <span key=${p.id} style="display:flex;align-items:center;gap:7px;background:#fffdf7;border:1px solid #d9d0bd;border-radius:999px;padding:5px 9px 5px 7px;font-family:'Newsreader',Georgia,serif;font-size:12px;color:#2b2620">
                      <span style=${{ width: 18, height: 18, borderRadius: '50%', background: p.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)', flex: 'none' }}></span>${p.name}
                      <span onClick=${p.onRemove} style="color:#a99c85;cursor:pointer;font-size:11px;padding-left:2px">✕</span>
                    </span>
                  `)}
                </div>
              </div>
            `)}

            ${v.hasShoppingList && html`
              <div style="display:flex;flex-direction:column;gap:8px">
                <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:#8a7f6d">SHOPPING LIST</span>
                ${v.shoppingItems.map(s => html`
                  <div key=${s.id} style="display:flex;justify-content:space-between;align-items:center;background:#fffdf7;border:1px solid #d9d0bd;padding:10px 12px;gap:10px">
                    <span style="display:flex;align-items:center;gap:10px;font-family:'Newsreader',Georgia,serif;font-size:13px;color:#2b2620"><span style=${{ width: 21, height: 21, borderRadius: '50%', background: s.hex, flex: 'none' }}></span>${s.name} <span style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#8a7f6d">${s.code}</span></span>
                    <div style="display:flex;gap:6px;align-items:center;flex:none">
                      <span style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:#8a7f6d;white-space:nowrap">FOR ${s.forName}</span>
                      <span onClick=${s.onBuy} style="font-family:'Newsreader',Georgia,serif;font-size:11.5px;border:1px solid #2b2620;border-radius:3px;padding:5px 9px;cursor:pointer;color:#2b2620;white-space:nowrap">Got it</span>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>
        </div>
      `}

      ${v.hasToast && html`
        <div style="position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#2b2620;color:#f4eee2;font-family:'Newsreader',Georgia,serif;font-size:13px;padding:12px 20px;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:60;animation:pm-toast-in .25s ease-out">${v.toastText}</div>
      `}

    </div>`;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ColourMixer));
