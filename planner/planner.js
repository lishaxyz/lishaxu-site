/* Gallery Wall Planner — lishaxu.com/planner/
   Ported from the Claude Design handoff ("Gallery Wall Planner (Lisha Xu site).dc.html").
   The planner logic (canvas math, perspective calibration, IndexedDB persistence,
   PNG export) is carried over verbatim as a React class component; the template is
   rendered with htm (no build step). Theme is locked to the site palette ("modern"). */
(function () {
  'use strict';

  /* h() wraps React.createElement and converts string style attributes
     (kept verbatim from the design template) into React style objects. */
  function cssToObj(css) {
    var o = {};
    css.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var prop = decl.slice(0, i).trim();
      var val = decl.slice(i + 1).trim();
      o[prop.indexOf('--') === 0 ? prop : prop.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = val;
    });
    return o;
  }
  function h(type, props) {
    if (props && typeof props.style === 'string') {
      props = Object.assign({}, props, { style: cssToObj(props.style) });
    }
    var args = [type, props];
    for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
    return React.createElement.apply(React, args);
  }
  var html = htm.bind(h);

  class Planner extends React.Component {
    constructor(props) {
      super(props);
      this.state = this.defaultState();
      this._mv = this.onMove.bind(this);
      this._up = this.onUp.bind(this);
      this._ts = this.onTouchStart.bind(this);
      this._tm = this.onTouchMove.bind(this);
      this._te = this.onTouchEnd.bind(this);
      this._cpd = this.onCanvasPointerDown.bind(this);
      this._gs = this.onGripTouchStart.bind(this);
      this._gm = this.onGripTouchMove.bind(this);
      this._ge = this.onGripTouchEnd.bind(this);
      this.pinching = false; this.pinch = null; this.calibTouch = null;
      this._H = null; this._photoRect = null;
    }

    defaultState() {
      return {
        pieces: [], selectedId: null, panelView: 'list',
        wallW: '144', wallH: '96', refW: '30', refH: '40',
        mode: 'flat', calibrating: false,
        calPoints: [[0.36, 0.30], [0.64, 0.30], [0.64, 0.72], [0.36, 0.72]],
        wallUrl: null, hasWall: false, wallNatW: 1600, wallNatH: 1200,
        canvasW: 0, canvasH: 0, confirmReset: false,
        zoom: 1, panX: 0, panY: 0, menuOpen: false, manualCanvasH: null,
        saveStatus: 'saved', showSaveNote: false
      };
    }

    /* =====================================================================
       SHOP CATALOG — admin-editable. This is the ONLY place to manage prints.
       Edit this list, then re-publish. There is no in-app editor, so visitors
       cannot change it.
         title     : print name shown on the card
         artist    : artist / collection line
         price     : regular price string, e.g. '$48'. Leave '' to show
                     "See price on Etsy" (card links to the live listing,
                     which always shows the current / sale price).
         salePrice : optional. When set, the card shows the regular `price`
                     struck-through next to this sale price. Clear it ('')
                     when the sale ends to revert to the regular price.
         w / h     : real print size in INCHES (drives wall size)
         img       : optional image URL ('' shows a placeholder swatch)
         buyUrl    : your full affiliate link, INCLUDING your ref/affiliate ID
         tint      : [light, dark] swatch colors used when there is no img
       ===================================================================== */
    seedShop() {
      return [
        { title: 'Elegant Sandhill Cranes in Flight', artist: 'KoolyArt', price: '', salePrice: '', w: '32', h: '48', img: '../prints/sandhill-cranes.webp', buyUrl: 'https://www.etsy.com/ca/listing/1823465781/elegant-sandhill-cranes-in-flight-on?ref=hp_recent_activity_hub-2&pro=1&sts=1&logging_key=a9b023cf79b2643aa83aecf55934650712855f7d%3A1823465781', tint: ['#cdd6db', '#bcc8cf'] },
        { title: 'Sardines', artist: 'Julia Stankevych', price: '', salePrice: '', w: '12', h: '12', img: '../prints/sardines.webp', buyUrl: 'https://www.etsy.com/ca/listing/1475457718/fish-painting-seafood-painting-sardine?ref=user_profile&frs=1', tint: ['#d3d8da', '#c2c9cc'] },
        { title: 'Allen Gardens', artist: 'Lisha Xu', price: '$35 CAD', salePrice: '', w: '11', h: '14', img: '../prints/allen-gardens.webp', buyUrl: 'https://www.etsy.com/ca/listing/964310159/allan-gardens-toronto-art-print?ref=shop_home_active_3&frs=1&logging_key=d7c15b912e0c1a2437bd79a634f488deb73c8d01%3A964310159', tint: ['#cdd8c5', '#bdcbb3'] },
        { title: 'Tiny ROM', artist: 'Lisha Xu', price: '$35 CAD', salePrice: '', w: '11', h: '14', img: '../prints/tiny-rom.webp', buyUrl: 'https://www.etsy.com/ca/listing/962450581/tiny-rom-toronto-art-print', tint: ['#cfe3ee', '#bdd6e6'] },
        { title: 'Tiny CN Tower & Skydome', artist: 'Lisha Xu', price: '$35 CAD', salePrice: '', w: '11', h: '14', img: '../prints/tiny-cn-tower.webp', buyUrl: 'https://www.etsy.com/ca/listing/962457659/tiny-cn-tower-skydome-toronto-art-print', tint: ['#f3d9cf', '#e9c8bc'] },
        { title: 'Four Kings', artist: 'Landon Nordeman', price: '$2,650 USD', salePrice: '', w: '40', h: '30', img: '../prints/four-kings.webp', buyUrl: 'https://20x200.com/products/landon-nordeman-four-kings-from-the-almost?variant=364371927', tint: ['#d6cdc0', '#c7bdac'] }
      ];
    }

    num(s, fb) { const v = parseFloat(s); return isFinite(v) ? v : fb; }

    /* ---------- lifecycle ---------- */
    componentDidMount() {
      this.applyTheme();
      this.initDB().then(() => this.loadAll());
      this._rs = () => this.measure();
      window.addEventListener('resize', this._rs);
      requestAnimationFrame(() => this.measure());
      try { if (!localStorage.getItem('gwp_seen_save_note')) this.setState({ showSaveNote: true }); } catch (e) {}
      // Re-render once the hidden catalog <img> tags are in the DOM (and again as
      // each finishes loading) so resolveImg() can swap to their resolved src.
      requestAnimationFrame(() => { this.forceUpdate(); try { (this.rootEl || document).querySelectorAll('img[data-catsrc]').forEach(im => { if (!im.complete) im.addEventListener('load', () => this.forceUpdate(), { once: true }); }); } catch (e) {} });
    }
    componentDidUpdate() { this.applyTheme(); }
    componentWillUnmount() { if (this.ro) this.ro.disconnect(); window.removeEventListener('resize', this._rs); }

    applyTheme() {
      if (!this.rootEl) return;
      const t = this.tokens();
      for (const k in t) this.rootEl.style.setProperty('--' + k, t[k]);
    }
    tokens() {
      const th = this.props.theme || 'modern';
      const base = ({
        warm: { bg: '#ece5db', surface: '#fbf7f1', text: '#2c261f', sub: '#8c8275', border: '#e6ddcf', accent: '#c0603a', accentText: '#ffffff', canvas: '#d9d2c6' },
        minimal: { bg: '#f4f4f3', surface: '#ffffff', text: '#1b1b1a', sub: '#a0a09c', border: '#e8e8e6', accent: '#1a1a1a', accentText: '#ffffff', canvas: '#e7e7e5' },
        modern: { bg: '#e9ecf1', surface: '#ffffff', text: '#1a2230', sub: '#8a95a6', border: '#dde2ea', accent: '#2f5e8c', accentText: '#ffffff', canvas: '#dfe3ea' }
      })[th] || {};
      const acc = (this.props.accent && this.props.accent.trim()) ? this.props.accent.trim() : base.accent;
      return Object.assign({}, base, { accent: acc });
    }
    showMeas() { return this.props.showMeasurements !== false; }

    measure() {
      if (!this.canvasEl || !this.rootEl) return;
      const w = this.canvasEl.getBoundingClientRect().width;
      const colH = this.rootEl.clientHeight || (window.innerHeight || 800);
      const tb = this.toolbarEl ? this.toolbarEl.offsetHeight : 60;
      const availH = Math.max(colH - tb, 220);
      const ar = (this.state.wallNatH || 1200) / (this.state.wallNatW || 1600);
      const desired = w * ar;                              // height that fills full width
      const minPanel = Math.max(Math.min(availH * 0.32, 300), 200);
      let canvasH;
      if (this.state.manualCanvasH != null) {              // user dragged the divider
        canvasH = this.clampN(this.state.manualCanvasH, 130, availH - 130);
      } else {
        canvasH = Math.max(Math.min(desired, availH - minPanel), 150);
      }
      if (Math.abs((this._appliedCanvasH || 0) - canvasH) > 0.5) { this.canvasEl.style.height = canvasH + 'px'; this._appliedCanvasH = canvasH; }
      if (Math.abs(w - this.state.canvasW) > 0.5 || Math.abs(canvasH - this.state.canvasH) > 0.5)
        this.setState({ canvasW: w, canvasH: canvasH });
    }

    /* ---------- IndexedDB ---------- */
    initDB() { return new Promise((res) => { try {
      const rq = indexedDB.open('gwp_db', 1);
      rq.onupgradeneeded = e => { e.target.result.createObjectStore('images'); };
      rq.onsuccess = e => { this.db = e.target.result; res(); };
      rq.onerror = () => res();
    } catch (e) { res(); } }); }
    idbSet(k, v) { return new Promise((res) => { if (!this.db) return res(); try { const tx = this.db.transaction('images', 'readwrite'); tx.objectStore('images').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } }); }
    idbGet(k) { return new Promise((res) => { if (!this.db) return res(null); try { const tx = this.db.transaction('images', 'readonly'); const rq = tx.objectStore('images').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } }); }
    idbDel(k) { return new Promise((res) => { if (!this.db) return res(); try { const tx = this.db.transaction('images', 'readwrite'); tx.objectStore('images').delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } }); }
    idbClear() { return new Promise((res) => { if (!this.db) return res(); try { const tx = this.db.transaction('images', 'readwrite'); tx.objectStore('images').clear(); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } }); }

    /* ---------- load / save ---------- */
    async loadAll() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('gwp_state')); } catch (e) {}
      if (saved && saved.v) {
        const st = Object.assign(this.defaultState(), saved, {
          confirmReset: false, calibrating: false, wallUrl: null,
          canvasW: this.state.canvasW, canvasH: this.state.canvasH
        });
        if (st.mode === 'perspective' && st.panelView === 'wall') st.calibrating = true;
        if (saved.hasWall) { const b = await this.idbGet('wall'); if (b) st.wallUrl = URL.createObjectURL(b); }
        for (const p of st.pieces) { if (p.hasImage) { const b = await this.idbGet('piece_' + p.id); if (b) { p.url = URL.createObjectURL(b); } else if (p.srcUrl) { p.url = p.srcUrl; } else { p.url = null; p.hasImage = false; } } }
        this.setState(st, () => { st.wallUrl ? this.loadWallNat(st.wallUrl) : this.useDefaultWall(true); });
      } else {
        this.useDefaultWall(true);
      }
    }
    loadWallNat(url) { const im = new Image(); im.onload = () => this.setState({ wallNatW: im.naturalWidth || 1600, wallNatH: im.naturalHeight || 1200, manualCanvasH: null }, () => this.measure()); im.src = url; }
    useDefaultWall(silent) { const data = this.makeDefaultWall(); this.setState({ wallUrl: data, hasWall: false, wallNatW: 1600, wallNatH: 1200, manualCanvasH: null }, () => { this.measure(); if (!silent) this.persist(); }); }

    persist() { if (this.state.saveStatus !== 'saving') this.setState({ saveStatus: 'saving' }); clearTimeout(this._pt); this._pt = setTimeout(() => { this.saveState(); clearTimeout(this._st); this._st = setTimeout(() => this.setState({ saveStatus: 'saved' }), 250); }, 300); }
    dismissSaveNote() { try { localStorage.setItem('gwp_seen_save_note', '1'); } catch (e) {} this.setState({ showSaveNote: false }); }
    saveState() { try {
      const s = this.state;
      const payload = { v: 1, wallW: s.wallW, wallH: s.wallH, refW: s.refW, refH: s.refH, mode: s.mode,
        calPoints: s.calPoints, hasWall: s.hasWall, panelView: s.panelView, selectedId: s.selectedId,
        pieces: s.pieces.map(p => { const q = Object.assign({}, p); delete q.url; return q; }) };
      localStorage.setItem('gwp_state', JSON.stringify(payload));
    } catch (e) {} }

    makeDefaultWall() {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d');
      let g = x.createLinearGradient(0, 0, 0, 1200); g.addColorStop(0, '#f3eee6'); g.addColorStop(0.6, '#ece5da'); g.addColorStop(0.86, '#e6ded1'); x.fillStyle = g; x.fillRect(0, 0, 1600, 1200);
      let r = x.createRadialGradient(540, 360, 80, 540, 360, 1150); r.addColorStop(0, 'rgba(255,255,255,0.32)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 1600, 1200);
      x.fillStyle = 'rgba(0,0,0,0.045)'; x.fillRect(0, 1016, 1600, 7);
      x.fillStyle = '#efe9df'; x.fillRect(0, 1023, 1600, 72);
      x.fillStyle = 'rgba(0,0,0,0.04)'; x.fillRect(0, 1023, 1600, 3);
      let fg = x.createLinearGradient(0, 1095, 0, 1200); fg.addColorStop(0, '#d8cebd'); fg.addColorStop(1, '#cdc2af'); x.fillStyle = fg; x.fillRect(0, 1095, 1600, 105);
      let v = x.createRadialGradient(800, 560, 420, 800, 560, 1050); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,50,40,0.085)'); x.fillStyle = v; x.fillRect(0, 0, 1600, 1200);
      return c.toDataURL('image/jpeg', 0.9);
    }

    /* ---------- geometry / homography ---------- */
    containRect(cw, ch, nw, nh) { const s = Math.min(cw / nw, ch / nh); const w = nw * s, h = nh * s; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }; }
    basisToQuad(q) {
      const x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
      const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
      let a, b, c, d, e, f, g, h2;
      if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h2 = 0; }
      else { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h2 = (dx1 * dy3 - dx3 * dy1) / den; a = x1 - x0 + g * x1; b = x3 - x0 + h2 * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h2 * y3; f = y0; }
      return [[a, b, c], [d, e, f], [g, h2, 1]];
    }
    multiply(A, B) { const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = 0; k < 3; k++) s += A[r][k] * B[k][c]; R[r][c] = s; } return R; }
    inverse3(m) {
      const a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h2 = m[2][1], i = m[2][2];
      const A = e * i - f * h2, B = -(d * i - f * g), C = d * h2 - e * g, D = -(b * i - c * h2), E = a * i - c * g, F = -(a * h2 - b * g), G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
      const det = a * A + b * B + c * C, inv = 1 / det;
      return [[A * inv, D * inv, G * inv], [B * inv, E * inv, Hh * inv], [C * inv, F * inv, I * inv]];
    }
    general(src, dst) { return this.multiply(this.basisToQuad(dst), this.inverse3(this.basisToQuad(src))); }
    applyH(M, x, y) { const X = M[0][0] * x + M[0][1] * y + M[0][2], Y = M[1][0] * x + M[1][1] * y + M[1][2], W = M[2][0] * x + M[2][1] * y + M[2][2]; return [X / W, Y / W]; }
    matVec(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }
    cssMatrix(M) { const i = M[2][2] || 1; const a = M[0][0] / i, b = M[0][1] / i, c = M[0][2] / i, d = M[1][0] / i, e = M[1][1] / i, f = M[1][2] / i, g = M[2][0] / i, h2 = M[2][1] / i; return 'matrix3d(' + a + ',' + d + ',0,' + g + ',' + b + ',' + e + ',0,' + h2 + ',0,0,1,0,' + c + ',' + f + ',0,1)'; }

    getH(mode, pr) {
      if (mode === 'perspective') {
        const rw = this.num(this.state.refW, 30), rh = this.num(this.state.refH, 40);
        const src = [[0, 0], [rw, 0], [rw, rh], [0, rh]];
        const dst = this.state.calPoints.map(c => [pr.x + c[0] * pr.w, pr.y + c[1] * pr.h]);
        return this.general(src, dst);
      } else {
        const ww = this.num(this.state.wallW, 144), wh = this.num(this.state.wallH, 96);
        // Uniform scale (anchored to photo width) so artwork keeps true proportions
        // even when the photo's aspect ratio differs from the wall's. Center vertically.
        const scale = pr.w / ww, wallPxH = wh * scale, offY = pr.y + (pr.h - wallPxH) / 2;
        const src = [[0, 0], [ww, 0], [ww, wh], [0, wh]];
        const dst = [[pr.x, offY], [pr.x + pr.w, offY], [pr.x + pr.w, offY + wallPxH], [pr.x, offY + wallPxH]];
        return this.general(src, dst);
      }
    }
    pieceQuad(p, H) { const w = this.num(p.w, 1), h2 = this.num(p.h, 1), x = p.x, y = p.y; return [this.applyH(H, x, y), this.applyH(H, x + w, y), this.applyH(H, x + w, y + h2), this.applyH(H, x, y + h2)]; }

    /* ---------- pointer interaction ---------- */
    pxToInch(e) { const r = this.canvasEl.getBoundingClientRect(); const z = this.state.zoom || 1; const sx = (e.clientX - r.left - this.state.panX) / z, sy = (e.clientY - r.top - this.state.panY) / z; return this.applyH(this.inverse3(this._H), sx, sy); }
    clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
    tdist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    bindDrag(e) { try { if (e && e.currentTarget && e.pointerId != null && e.currentTarget.setPointerCapture) { e.currentTarget.setPointerCapture(e.pointerId); this._capEl = e.currentTarget; this._capId = e.pointerId; } } catch (x) {} window.addEventListener('pointermove', this._mv, { passive: false }); window.addEventListener('pointerup', this._up); window.addEventListener('pointercancel', this._up); }
    releaseCap() { try { if (this._capEl && this._capId != null && this._capEl.releasePointerCapture) this._capEl.releasePointerCapture(this._capId); } catch (x) {} this._capEl = null; this._capId = null; }

    startBodyDrag(id, e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      e.stopPropagation(); try { e.preventDefault(); } catch (x) {}
      this.setState({ selectedId: id, panelView: 'piece' });
      const p = this.getPiece(id); if (!p || !this._H) return;
      const inch = this.pxToInch(e);
      this.drag = { type: 'move', id, offX: inch[0] - p.x, offY: inch[1] - p.y };
      this.bindDrag(e);
    }
    startResize(id, corner, e) {
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      e.stopPropagation(); try { e.preventDefault(); } catch (x) {}
      const p = this.getPiece(id); if (!p || !this._H) return;
      const w = this.num(p.w, 1), h2 = this.num(p.h, 1);
      const map = { tl: [p.x + w, p.y + h2], tr: [p.x, p.y + h2], br: [p.x, p.y], bl: [p.x + w, p.y] };
      const a = map[corner];
      this.drag = { type: 'resize', id, ax: a[0], ay: a[1], w0: w, h0: h2 };
      this.bindDrag(e);
    }
    startCalib(i, e) { e.stopPropagation(); if (e.pointerType === 'mouse' && e.button !== 0) return; try { e.preventDefault(); } catch (x) {} this.drag = { type: 'calib', idx: i }; this.bindDrag(e); }
    startSplit(e) { if (e.pointerType === 'touch') return; if (e.pointerType === 'mouse' && e.button !== 0) return; e.stopPropagation(); try { e.preventDefault(); } catch (x) {} const cur = this._appliedCanvasH || this.state.canvasH || 300; this.drag = { type: 'split', startY: e.clientY, startH: cur }; this.bindDrag(e); }
    splitTo(clientY, startY, startH) {
      const colH = this.rootEl ? this.rootEl.clientHeight : (window.innerHeight || 800);
      const tb = this.toolbarEl ? this.toolbarEl.offsetHeight : 60;
      const availH = Math.max(colH - tb, 220);
      const h2 = this.clampN(startH + (clientY - startY), 130, availH - 130);
      if (this.canvasEl) { this.canvasEl.style.height = h2 + 'px'; this._appliedCanvasH = h2; }
      this.setState({ manualCanvasH: h2, canvasH: h2 });
    }
    onGripTouchStart(e) { if (e.touches.length !== 1) return; const cur = this._appliedCanvasH || this.state.canvasH || 300; this.splitTouch = { startY: e.touches[0].clientY, startH: cur }; try { e.preventDefault(); } catch (x) {} }
    onGripTouchMove(e) { if (!this.splitTouch || !e.touches.length) return; try { e.preventDefault(); } catch (x) {} this.splitTo(e.touches[0].clientY, this.splitTouch.startY, this.splitTouch.startH); }
    onGripTouchEnd(e) { if (this.splitTouch) { this.splitTouch = null; } }

    onMove(e) {
      if (!this.drag || this.pinching) return;
      try { e.preventDefault(); } catch (x) {}
      const d = this.drag;
      if (d.type === 'pan') {
        const cw = this.state.canvasW, ch = this.state.canvasH, z = this.state.zoom;
        const px = this.clampN(d.px0 + (e.clientX - d.sx), cw * (1 - z), 0), py = this.clampN(d.py0 + (e.clientY - d.sy), ch * (1 - z), 0);
        this.setState({ panX: px, panY: py });
        return;
      }
      if (d.type === 'split') {
        const colH = this.rootEl ? this.rootEl.clientHeight : (window.innerHeight || 800);
        const tb = this.toolbarEl ? this.toolbarEl.offsetHeight : 60;
        const availH = Math.max(colH - tb, 220);
        const h2 = this.clampN(d.startH + (e.clientY - d.startY), 130, availH - 130);
        if (this.canvasEl) { this.canvasEl.style.height = h2 + 'px'; this._appliedCanvasH = h2; }
        this.setState({ manualCanvasH: h2, canvasH: h2 });
        return;
      }
      if (d.type === 'calib') {
        const pr = this._photoRect; if (!pr) return;
        const r = this.canvasEl.getBoundingClientRect();
        const z = this.state.zoom || 1;
        const stageX = (e.clientX - r.left - this.state.panX) / z, stageY = (e.clientY - r.top - this.state.panY) / z;
        let u = (stageX - pr.x) / pr.w, v = (stageY - pr.y) / pr.h;
        u = Math.max(0, Math.min(1, u)); v = Math.max(0, Math.min(1, v));
        this.setState(s => { const cp = s.calPoints.map(a => a.slice()); cp[d.idx] = [u, v]; return { calPoints: cp }; });
        return;
      }
      if (!this._H) return;
      const inch = this.pxToInch(e);
      if (d.type === 'move') {
        const nx = inch[0] - d.offX, ny = inch[1] - d.offY;
        this.setState(s => ({ pieces: s.pieces.map(p => p.id === d.id ? Object.assign({}, p, { x: nx, y: ny }) : p) }));
      } else if (d.type === 'resize') {
        // Uniform scale from anchored opposite corner — keeps artwork aspect ratio locked.
        const dx = inch[0] - d.ax, dy = inch[1] - d.ay;
        let s = Math.max(Math.abs(dx) / d.w0, Math.abs(dy) / d.h0);
        s = Math.max(s, 0.5 / Math.min(d.w0, d.h0));
        const nw = d.w0 * s, nh = d.h0 * s;
        const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
        const fx = d.ax + sx * nw, fy = d.ay + sy * nh;
        const nx = Math.min(d.ax, fx), ny = Math.min(d.ay, fy);
        const wS = (Math.round(nw * 10) / 10).toString(), hS = (Math.round(nh * 10) / 10).toString();
        this.setState(st => ({ pieces: st.pieces.map(p => p.id === d.id ? Object.assign({}, p, { x: nx, y: ny, w: wS, h: hS }) : p) }));
      }
    }
    onUp() { if (!this.drag) return; this.drag = null; this.releaseCap(); window.removeEventListener('pointermove', this._mv); window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up); this.persist(); }

    // All drag starts route through this single NATIVE pointerdown listener on the
    // canvas — native delegation is the reliable path for mouse AND touch here
    // (per the design handoff: do not rely on React synthetic events for these).
    onCanvasPointerDown(e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-caldot],[data-resize],[data-piece]') : null;
      if (t) {
        if (t.hasAttribute('data-caldot')) { this.startCalib(+t.getAttribute('data-caldot'), e); return; }
        if (t.hasAttribute('data-resize')) { this.startResize(t.getAttribute('data-resize-id'), t.getAttribute('data-resize'), e); return; }
        if (t.hasAttribute('data-piece')) { this.startBodyDrag(t.getAttribute('data-piece'), e); return; }
      }
      this.bgDown(e);
    }

    bgDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      if (this.state.zoom > 1.001) { try { e.preventDefault(); } catch (x) {} this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, px0: this.state.panX, py0: this.state.panY }; this.bindDrag(e); }
      else { this.setState(s => ({ selectedId: null, panelView: s.panelView === 'piece' ? 'list' : s.panelView })); }
    }

    hitCalibDot(cx, cy) {
      const pr = this._photoRect; if (!pr || !this.canvasEl) return -1;
      const r = this.canvasEl.getBoundingClientRect(), z = this.state.zoom || 1;
      let best = -1, bestD = 36; // generous touch radius (px)
      for (let i = 0; i < this.state.calPoints.length; i++) {
        const c = this.state.calPoints[i];
        const sx = (pr.x + c[0] * pr.w) * z + this.state.panX + r.left;
        const sy = (pr.y + c[1] * pr.h) * z + this.state.panY + r.top;
        const d = Math.hypot(cx - sx, cy - sy);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    calibFromPoint(cx, cy) {
      const pr = this._photoRect; if (!pr) return;
      const r = this.canvasEl.getBoundingClientRect(), z = this.state.zoom || 1;
      const stageX = (cx - r.left - this.state.panX) / z, stageY = (cy - r.top - this.state.panY) / z;
      let u = Math.max(-0.3, Math.min(1.3, (stageX - pr.x) / pr.w)), v = Math.max(-0.3, Math.min(1.3, (stageY - pr.y) / pr.h));
      this.setState(s => { const cp = s.calPoints.map(a => a.slice()); cp[this.calibTouch] = [u, v]; return { calPoints: cp }; });
    }
    onTouchStart(e) {
      if (e.touches.length === 2) {
        this.calibTouch = null;
        if (this.drag) { this.drag = null; this.releaseCap(); window.removeEventListener('pointermove', this._mv); window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up); }
        this.pinching = true;
        const r = this.canvasEl.getBoundingClientRect();
        const a = e.touches[0], b = e.touches[1];
        this.pinch = { d0: this.tdist(a, b) || 1, z0: this.state.zoom, px0: this.state.panX, py0: this.state.panY, fx: (a.clientX + b.clientX) / 2 - r.left, fy: (a.clientY + b.clientY) / 2 - r.top };
        try { e.preventDefault(); } catch (x) {}
      }
    }
    onTouchMove(e) {
      if (!this.pinching || e.touches.length < 2) return;
      try { e.preventDefault(); } catch (x) {}
      const r = this.canvasEl.getBoundingClientRect();
      const a = e.touches[0], b = e.touches[1];
      let z = this.clampN(this.pinch.z0 * (this.tdist(a, b) / this.pinch.d0), 1, 4);
      const fxNow = (a.clientX + b.clientX) / 2 - r.left, fyNow = (a.clientY + b.clientY) / 2 - r.top;
      const sx = (this.pinch.fx - this.pinch.px0) / this.pinch.z0, sy = (this.pinch.fy - this.pinch.py0) / this.pinch.z0;
      let px = fxNow - sx * z, py = fyNow - sy * z;
      const cw = this.state.canvasW, ch = this.state.canvasH;
      if (z <= 1) { z = 1; px = 0; py = 0; } else { px = this.clampN(px, cw * (1 - z), 0); py = this.clampN(py, ch * (1 - z), 0); }
      this.setState({ zoom: z, panX: px, panY: py });
    }
    onTouchEnd(e) { if (e.touches.length < 2) { this.pinching = false; this.pinch = null; } if (e.touches.length === 0) { this.calibTouch = null; } }
    resetZoom() { this.setState({ zoom: 1, panX: 0, panY: 0 }); }
    onWheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return; // trackpad pinch / ctrl+wheel only
      e.preventDefault();
      const r = this.canvasEl.getBoundingClientRect();
      const z0 = this.state.zoom, z = this.clampN(z0 * (1 - e.deltaY * 0.01), 1, 4);
      const fx = e.clientX - r.left, fy = e.clientY - r.top;
      const sx = (fx - this.state.panX) / z0, sy = (fy - this.state.panY) / z0;
      let px = fx - sx * z, py = fy - sy * z;
      const cw = this.state.canvasW, ch = this.state.canvasH;
      if (z <= 1) { px = 0; py = 0; } else { px = this.clampN(px, cw * (1 - z), 0); py = this.clampN(py, ch * (1 - z), 0); }
      this.setState({ zoom: z, panX: px, panY: py });
    }

    /* ---------- piece ops ---------- */
    getPiece(id) { return this.state.pieces.find(p => p.id === id); }
    newId() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }

    // Effective image for a placed piece: its own image if it has one, else
    // (for buyable/featured pieces) fall back to the current catalog image.
    // This self-heals prints that were placed before their image was added.
    resolveImg(path) {
      if (!path) return '';
      if (/^(data:|blob:|https?:)/.test(path)) return path;
      try {
        const root = this.rootEl || document;
        const el = root.querySelector('img[data-catsrc="' + path + '"]');
        if (el && el.src) return el.src;
      } catch (e) {}
      return path;
    }
    catalogImageFor(p) {
      if (!p) return null;
      const cat = this.seedShop();
      let m = null;
      if (p.buyUrl) m = cat.find(c => c.buyUrl === p.buyUrl);
      if (!m && p.shopTitle) m = cat.find(c => c.title === p.shopTitle);
      if (!m && p.name) m = cat.find(c => c.title === p.name);
      return (m && m.img && ('' + m.img).trim()) ? ('' + m.img).trim() : null;
    }
    effImg(p) { if (!p) return null; if (p.featured) { const c = this.catalogImageFor(p); if (c) return this.resolveImg(c); } if (p.url) return this.resolveImg(p.url); return null; }

    addPiece() {
      const id = this.newId(); const w = 16, h2 = 20; let cx = 0, cy = 0;
      if (this._H && this._photoRect) { const c = this.applyH(this.inverse3(this._H), this._photoRect.x + this._photoRect.w / 2, this._photoRect.y + this._photoRect.h / 2); cx = c[0]; cy = c[1]; }
      const piece = { id, name: 'Untitled', w: '16', h: '20', frameColor: '#2c261f', frameThickness: '1.5', mat: false, matWidth: '2', matColor: '#ffffff', x: cx - w / 2, y: cy - h2 / 2, hasImage: false, url: null };
      this.setState(s => ({ pieces: [...s.pieces, piece], selectedId: id, panelView: 'piece' }), () => this.persist());
    }

    addFeatured(item) {
      const id = this.newId(); const w = this.num(item.w, 16), h2 = this.num(item.h, 20); let cx = 0, cy = 0;
      if (this._H && this._photoRect) { const c = this.applyH(this.inverse3(this._H), this._photoRect.x + this._photoRect.w / 2, this._photoRect.y + this._photoRect.h / 2); cx = c[0]; cy = c[1]; }
      const hasImg = !!(item.img && item.img.trim());
      const dispPrice = (item.salePrice || '').trim() || (item.price || '').trim() || '';
      const piece = { id, name: item.title, w: item.w, h: item.h, frameColor: '#2c261f', frameThickness: '1.5', mat: false, matWidth: '2', matColor: '#ffffff', x: cx - w / 2, y: cy - h2 / 2,
        hasImage: hasImg, url: hasImg ? item.img.trim() : null, srcUrl: hasImg ? item.img.trim() : null,
        featured: true, shopTitle: item.title, shopArtist: item.artist, shopPrice: dispPrice, buyUrl: item.buyUrl, tint: item.tint };
      this.setState(s => ({ pieces: [...s.pieces, piece], selectedId: id, panelView: 'piece' }), () => this.persist());
    }
    selectPiece(id) { this.setState({ selectedId: id, panelView: 'piece', calibrating: false }); }
    updatePiece(id, patch) { this.setState(s => ({ pieces: s.pieces.map(p => p.id === id ? Object.assign({}, p, patch) : p) }), () => this.persist()); }
    async duplicatePiece(id) {
      const p = this.getPiece(id); if (!p) return; const nid = this.newId();
      const np = Object.assign({}, p, { id: nid, name: p.name ? p.name + ' copy' : 'copy', x: p.x + 3, y: p.y + 3 });
      if (p.hasImage) { const b = await this.idbGet('piece_' + id); if (b) { await this.idbSet('piece_' + nid, b); np.url = URL.createObjectURL(b); } else if (p.srcUrl) { np.url = p.srcUrl; } }
      this.setState(s => ({ pieces: [...s.pieces, np], selectedId: nid, panelView: 'piece' }), () => this.persist());
    }
    deletePiece(id) { this.idbDel('piece_' + id); this.setState(s => ({ pieces: s.pieces.filter(p => p.id !== id), selectedId: s.selectedId === id ? null : s.selectedId, panelView: s.selectedId === id ? 'list' : s.panelView }), () => this.persist()); }
    bringFront(id) { this.setState(s => { const p = s.pieces.find(q => q.id === id); if (!p) return {}; return { pieces: [...s.pieces.filter(q => q.id !== id), p] }; }, () => this.persist()); }
    sendBack(id) { this.setState(s => { const p = s.pieces.find(q => q.id === id); if (!p) return {}; return { pieces: [p, ...s.pieces.filter(q => q.id !== id)] }; }, () => this.persist()); }
    swapWH(id) { const p = this.getPiece(id); if (p) this.updatePiece(id, { w: p.h, h: p.w }); }
    toggleMat(id) { const p = this.getPiece(id); if (p) this.updatePiece(id, { mat: !p.mat }); }

    /* ---------- uploads ---------- */
    onWallFile(e) { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; const url = URL.createObjectURL(f); this.idbSet('wall', f).then(() => { this.setState({ wallUrl: url, hasWall: true }, () => { this.loadWallNat(url); this.persist(); }); }); }
    onPieceFile(e) { const f = e.target.files && e.target.files[0]; e.target.value = ''; const id = this.state.selectedId; if (!f || !id) return; const url = URL.createObjectURL(f); this.idbSet('piece_' + id, f).then(() => { this.updatePiece(id, { hasImage: true, url }); }); }
    removePhoto(id) { this.idbDel('piece_' + id); this.updatePiece(id, { hasImage: false, url: null }); }

    /* ---------- perspective ---------- */
    reproject(pieces, oldH, newH) { const invNew = this.inverse3(newH); return pieces.map(p => { const w = this.num(p.w, 1), h2 = this.num(p.h, 1); const cpx = this.applyH(oldH, p.x + w / 2, p.y + h2 / 2); const ci = this.applyH(invNew, cpx[0], cpx[1]); return Object.assign({}, p, { x: ci[0] - w / 2, y: ci[1] - h2 / 2 }); }); }
    enablePersp() {
      if (this._H && this._photoRect) { const oldH = this._H; const newH = this.getH('perspective', this._photoRect); const pieces = this.reproject(this.state.pieces, oldH, newH); this.setState({ mode: 'perspective', calibrating: true, panelView: 'wall', pieces }, () => this.persist()); }
      else this.setState({ mode: 'perspective', calibrating: true, panelView: 'wall' }, () => this.persist());
    }
    disablePersp() {
      if (this._H && this._photoRect) { const oldH = this._H; const newH = this.getH('flat', this._photoRect); const pieces = this.reproject(this.state.pieces, oldH, newH); this.setState({ mode: 'flat', calibrating: false, pieces }, () => this.persist()); }
      else this.setState({ mode: 'flat', calibrating: false }, () => this.persist());
    }
    togglePersp() { this.state.mode === 'perspective' ? this.disablePersp() : this.enablePersp(); }
    toggleCalib() { this.setState(s => { const on = !s.calibrating; const cp = on ? s.calPoints.map(p => [this.clampN(p[0], 0, 1), this.clampN(p[1], 0, 1)]) : s.calPoints; return { calibrating: on, mode: 'perspective', calPoints: cp }; }, () => this.persist()); }

    /* ---------- reset ---------- */
    doReset() { localStorage.removeItem('gwp_state'); this.idbClear(); const ns = this.defaultState(); ns.canvasW = this.state.canvasW; ns.canvasH = this.state.canvasH; this.setState(ns, () => this.useDefaultWall(true)); }

    /* ---------- export ---------- */
    loadImg(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }); }
    coverDraw(ctx, img, x, y, w, h2) { const ir = img.width / img.height, tr = w / h2; let sw, sh, sx, sy; if (ir > tr) { sh = img.height; sw = sh * tr; sx = (img.width - sw) / 2; sy = 0; } else { sw = img.width; sh = sw / tr; sx = 0; sy = (img.height - sh) / 2; } ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h2); }
    expandTri(d0, d1, d2, px) { const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3; const f = v => { const dx = v[0] - cx, dy = v[1] - cy, len = Math.hypot(dx, dy) || 1; return [v[0] + dx / len * px, v[1] + dy / len * px]; }; return [f(d0), f(d1), f(d2)]; }
    texTri(ctx, img, s0, s1, s2, d0, d1, d2) {
      const A = [[s0[0], s0[1], 1], [s1[0], s1[1], 1], [s2[0], s2[1], 1]];
      let invA; try { invA = this.inverse3(A); } catch (e) { return; }
      const cx = this.matVec(invA, [d0[0], d1[0], d2[0]]), cy = this.matVec(invA, [d0[1], d1[1], d2[1]]);
      const ex = this.expandTri(d0, d1, d2, 0.7);
      ctx.save(); ctx.beginPath(); ctx.moveTo(ex[0][0], ex[0][1]); ctx.lineTo(ex[1][0], ex[1][1]); ctx.lineTo(ex[2][0], ex[2][1]); ctx.closePath(); ctx.clip();
      ctx.transform(cx[0], cy[0], cx[1], cy[1], cx[2], cy[2]); ctx.drawImage(img, 0, 0); ctx.restore();
    }
    warpRaster(ctx, src, M, ow, oh) { const N = 14; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x0 = ow * i / N, x1 = ow * (i + 1) / N, y0 = oh * j / N, y1 = oh * (j + 1) / N; const d00 = this.applyH(M, x0, y0), d10 = this.applyH(M, x1, y0), d11 = this.applyH(M, x1, y1), d01 = this.applyH(M, x0, y1); this.texTri(ctx, src, [x0, y0], [x1, y0], [x1, y1], d00, d10, d11); this.texTri(ctx, src, [x0, y0], [x1, y1], [x0, y1], d00, d11, d01); } }
    async drawPieceExport(ctx, p, Hm) {
      const sc = 10; const w = this.num(p.w, 1), h2 = this.num(p.h, 1);
      const ow = Math.max(Math.round(w * sc), 4), oh = Math.max(Math.round(h2 * sc), 4);
      const pc = document.createElement('canvas'); pc.width = ow; pc.height = oh; const px = pc.getContext('2d');
      const ft = Math.max(this.num(p.frameThickness, 0), 0) * sc, mt = p.mat ? Math.max(this.num(p.matWidth, 0), 0) * sc : 0;
      px.fillStyle = p.frameColor; px.fillRect(0, 0, ow, oh);
      px.fillStyle = p.mat ? p.matColor : '#cfc7ba'; px.fillRect(ft, ft, ow - 2 * ft, oh - 2 * ft);
      const ax = ft + mt, ay = ft + mt, aw = ow - 2 * (ft + mt), ah = oh - 2 * (ft + mt);
      const eUrl = this.effImg(p);
      if (eUrl) { try { const im = await this.loadImg(eUrl); this.coverDraw(px, im, ax, ay, aw, ah); } catch (e) { px.fillStyle = '#e7e1d6'; px.fillRect(ax, ay, aw, ah); } }
      else { px.fillStyle = '#e7e1d6'; px.fillRect(ax, ay, aw, ah); }
      const local = [[0, 0], [ow, 0], [ow, oh], [0, oh]];
      const quad = [this.applyH(Hm, p.x, p.y), this.applyH(Hm, p.x + w, p.y), this.applyH(Hm, p.x + w, p.y + h2), this.applyH(Hm, p.x, p.y + h2)];
      const M = this.general(local, quad);
      this.warpRaster(ctx, pc, M, ow, oh);
    }
    async exportPng() {
      try {
        const s = this.state; if (!s.wallUrl) return;
        const wall = await this.loadImg(s.wallUrl);
        const W = wall.naturalWidth || s.wallNatW, Hh = wall.naturalHeight || s.wallNatH;
        const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = Hh; const ctx = cnv.getContext('2d');
        ctx.drawImage(wall, 0, 0, W, Hh);
        let Hm;
        if (s.mode === 'perspective') { const rw = this.num(s.refW, 30), rh = this.num(s.refH, 40); Hm = this.general([[0, 0], [rw, 0], [rw, rh], [0, rh]], s.calPoints.map(c => [c[0] * W, c[1] * Hh])); }
        else { const ww = this.num(s.wallW, 144), wh = this.num(s.wallH, 96); const scale = W / ww, wallPxH = wh * scale, offY = (Hh - wallPxH) / 2; Hm = this.general([[0, 0], [ww, 0], [ww, wh], [0, wh]], [[0, offY], [W, offY], [W, offY + wallPxH], [0, offY + wallPxH]]); }
        for (const p of s.pieces) await this.drawPieceExport(ctx, p, Hm);
        cnv.toBlob(b => { const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'gallery-wall.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }, 'image/png');
      } catch (e) { console.error('export failed', e); }
    }

    /* ---------- render ---------- */
    setStr(key) { return (e) => { const v = e.target.value; this.setState({ [key]: v }, () => this.persist()); }; }

    renderVals() {
      const S = this.state;
      const cw = S.canvasW, ch = S.canvasH;
      let photoRect = null, H = null;
      if (cw > 0 && ch > 0) { photoRect = this.containRect(cw, ch, S.wallNatW, S.wallNatH); this._photoRect = photoRect; H = this.getH(S.mode, photoRect); this._H = H; }
      const sel = S.pieces.find(p => p.id === S.selectedId) || null;
      const fmtIn = v => (Math.round(v * 10) / 10) + '″';

      // pieces
      const pieces = [];
      if (H && photoRect) { for (const p of S.pieces) {
        const w = this.num(p.w, 1), h2 = this.num(p.h, 1), scl = 4;
        const lw = Math.max(w * scl, 4), lh = Math.max(h2 * scl, 4);
        const quad = this.pieceQuad(p, H);
        const M = this.general([[0, 0], [lw, 0], [lw, lh], [0, lh]], quad);
        const ft = Math.max(this.num(p.frameThickness, 0), 0) * scl, mt = p.mat ? Math.max(this.num(p.matWidth, 0), 0) * scl : 0;
        const eUrl = this.effImg(p);
        pieces.push({
          id: p.id, hasImage: !!eUrl, noImage: !eUrl, url: eUrl || '',
          containerStyle: { position: 'absolute', left: 0, top: 0, width: lw + 'px', height: lh + 'px', transformOrigin: '0 0', transform: this.cssMatrix(M), boxSizing: 'border-box', border: ft + 'px solid ' + p.frameColor, background: p.frameColor, backfaceVisibility: 'hidden', cursor: 'move', touchAction: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.22)', willChange: 'transform' },
          matStyle: { width: '100%', height: '100%', boxSizing: 'border-box', background: p.mat ? p.matColor : '#cfc7ba', padding: mt + 'px' },
          imgStyle: { width: '100%', height: '100%', backgroundImage: eUrl ? ('url("' + eUrl + '")') : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', pointerEvents: 'none' },
          phStyle: { width: '100%', height: '100%', background: p.featured && p.tint ? ('repeating-linear-gradient(45deg,' + p.tint[0] + ',' + p.tint[0] + ' 6px,' + p.tint[1] + ' 6px,' + p.tint[1] + ' 12px)') : 'repeating-linear-gradient(45deg,#e7e1d6,#e7e1d6 6px,#dcd4c6 6px,#dcd4c6 12px)' }
        });
      } }

      // selection handles
      let hasSelection = false, selHandles = [], selPoly = '', measLabel = null, hasMeas = false;
      if (sel && H) {
        hasSelection = true;
        const q = this.pieceQuad(sel, H);
        selPoly = q.map(pt => pt[0] + ',' + pt[1]).join(' ');
        const corners = ['tl', 'tr', 'br', 'bl'], cur = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];
        selHandles = q.map((pt, i) => ({
          corner: corners[i], id: sel.id,
          boxStyle: { position: 'absolute', left: (pt[0] - 19) + 'px', top: (pt[1] - 19) + 'px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: cur[i], touchAction: 'none', zIndex: 20, pointerEvents: 'auto' },
          dotStyle: { width: '16px', height: '16px', borderRadius: '50%', background: 'var(--accent)', border: '2.5px solid #fff', boxShadow: '0 1px 5px rgba(0,0,0,0.35)' }
        }));
        if (this.showMeas()) {
          const mx = (q[0][0] + q[1][0]) / 2, my = (q[0][1] + q[1][1]) / 2;
          measLabel = { style: { position: 'absolute', left: mx + 'px', top: (my - 32) + 'px', transform: 'translateX(-50%)', background: 'var(--accent)', color: 'var(--accentText)', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 21 }, text: fmtIn(this.num(sel.w, 0)) + ' × ' + fmtIn(this.num(sel.h, 0)) };
          hasMeas = true;
        }
      }

      // calibration dots
      let calDots = [], calPoly = '';
      if (S.calibrating && photoRect) {
        const pts = S.calPoints.map(c => [photoRect.x + c[0] * photoRect.w, photoRect.y + c[1] * photoRect.h]);
        calPoly = pts.map(p => p[0] + ',' + p[1]).join(' ');
        calDots = pts.map((pt, i) => ({ num: (i + 1), idx: i,
          boxStyle: { position: 'absolute', left: (pt[0] - 21) + 'px', top: (pt[1] - 21) + 'px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', zIndex: 30, pointerEvents: 'auto' },
          dotStyle: { width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', border: '3px solid #fff', boxShadow: '0 2px 7px rgba(0,0,0,0.4)', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }
        }));
      }

      // thumbnails
      const thumbs = S.pieces.map(p => {
        const eUrl = this.effImg(p);
        return {
          id: p.id, name: p.name || 'Untitled', hasImage: !!eUrl, noImage: !eUrl, url: eUrl || '',
          imgStyle: { width: '100%', height: '100%', backgroundImage: eUrl ? ('url("' + eUrl + '")') : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
          phStyle: { width: '100%', height: '100%', background: p.featured && p.tint ? ('repeating-linear-gradient(45deg,' + p.tint[0] + ',' + p.tint[0] + ' 5px,' + p.tint[1] + ' 5px,' + p.tint[1] + ' 10px)') : 'repeating-linear-gradient(45deg,#e7e1d6,#e7e1d6 5px,#dcd4c6 5px,#dcd4c6 10px)' },
          btnStyle: { flex: '0 0 auto', width: '78px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer' },
          frameStyle: { width: '72px', height: '90px', borderRadius: '4px', overflow: 'hidden', background: p.frameColor, padding: '4px', boxShadow: p.id === S.selectedId ? '0 0 0 2.5px var(--accent)' : '0 2px 8px rgba(0,0,0,0.14)' },
          onClick: () => this.selectPiece(p.id)
        };
      });

      // frame & mat swatches
      const fc = ['#2c261f', '#1a1a1a', '#f7f4ef', '#b48a5e', '#5c4433', '#c9a24b', '#8a8a88'];
      const frameSwatches = fc.map(col => ({ col, onClick: () => sel && this.updatePiece(sel.id, { frameColor: col }), style: { width: '30px', height: '30px', borderRadius: '8px', background: col, cursor: 'pointer', border: sel && sel.frameColor === col ? '2.5px solid var(--accent)' : '1px solid rgba(0,0,0,0.12)', padding: 0 } }));
      const mc = ['#ffffff', '#f3eee6', '#e6ddcf', '#1c1c1c'];
      const matSwatches = mc.map(col => ({ col, onClick: () => sel && this.updatePiece(sel.id, { matColor: col }), style: { width: '26px', height: '26px', borderRadius: '7px', background: col, cursor: 'pointer', border: sel && sel.matColor === col ? '2.5px solid var(--accent)' : '1px solid rgba(0,0,0,0.15)', padding: 0 } }));

      const spMat = sel ? sel.mat : false;
      const matToggleStyle = { width: '42px', height: '25px', borderRadius: '999px', border: 'none', padding: '2px', cursor: 'pointer', background: spMat ? 'var(--accent)' : '#cdc6ba', display: 'flex', alignItems: 'center', justifyContent: spMat ? 'flex-end' : 'flex-start', transition: 'all .15s' };
      const matKnobStyle = { width: '21px', height: '21px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', display: 'block' };

      const ww = this.num(S.wallW, 144), wh = this.num(S.wallH, 96);
      const persp = S.mode === 'perspective';

      // header coloring (locked to the site design: accent eyebrow, ink headline)
      const eyebrowCol = 'var(--accent)', headlineCol = 'var(--text)';

      // panel tabs
      const onShop = S.panelView === 'shop';
      const onWall = S.panelView === 'wall';
      const onPieces = !onShop && !onWall;
      const tabBase = { fontSize: '14px', padding: '6px 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: '-1px', cursor: 'pointer', touchAction: 'manipulation', whiteSpace: 'nowrap' };
      const tabActive = Object.assign({}, tabBase, { fontWeight: 600, color: 'var(--text)', borderBottom: '2px solid var(--accent)' });
      const tabIdle = Object.assign({}, tabBase, { fontWeight: 500, color: 'var(--sub)', borderBottom: '2px solid transparent' });

      // shop / featured — catalog is code-defined in seedShop(); no in-app editing
      const shopItems = this.seedShop().map(a => {
        const imgU = this.resolveImg(a.img);
        const hasImg = !!(imgU && imgU.trim());
        const reg = (a.price || '').trim();
        const sale = (a.salePrice || '').trim();
        const onSale = !!(sale && reg);
        const fallback = !reg && !sale;
        const priceMain = sale || reg || 'See price on Etsy';
        return {
          title: a.title || 'Untitled print', artist: a.artist || '—', size: (a.w || '?') + '×' + (a.h || '?') + '″',
          buyUrl: (a.buyUrl && a.buyUrl.trim()) ? a.buyUrl.trim() : '#',
          priceMain, hasStrike: onSale, priceStrike: reg,
          priceStyle: { fontSize: fallback ? '11.5px' : '13px', fontWeight: fallback ? 600 : 700, color: onSale ? 'var(--accent)' : (fallback ? 'var(--sub)' : 'var(--text)'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
          thumbStyle: hasImg
            ? { width: '100%', height: '82px', backgroundImage: 'url("' + imgU + '")', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#e7e1d6' }
            : { width: '100%', height: '82px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg,' + a.tint[0] + ',' + a.tint[0] + ' 7px,' + a.tint[1] + ' 7px,' + a.tint[1] + ' 14px)' },
          showPreviewLabel: !hasImg,
          add: () => this.addFeatured(a)
        };
      });

      return {
        rootRef: (el) => { this.rootEl = el; this.applyTheme(); },
        canvasRef: (el) => { this.canvasEl = el; if (el && !el.style.height) { el.style.height = Math.round((window.innerHeight || 800) * 0.42) + 'px'; } if (el && !this.ro && typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.measure()); this.ro.observe(el); this.measure(); } if (el && !this._touchBound) { this._touchBound = true; el.addEventListener('pointerdown', this._cpd, { passive: false }); el.addEventListener('touchstart', this._ts, { passive: false }); el.addEventListener('touchmove', this._tm, { passive: false }); el.addEventListener('touchend', this._te); el.addEventListener('touchcancel', this._te); el.addEventListener('wheel', (ev) => this.onWheel(ev), { passive: false }); } },
        stageStyle: { position: 'absolute', inset: 0, transformOrigin: '0 0', transform: 'translate(' + S.panX + 'px,' + S.panY + 'px) scale(' + S.zoom + ')', willChange: 'transform' },
        isZoomed: S.zoom > 1.01,
        zoomLabel: (Math.round(S.zoom * 10) / 10) + '×',
        resetZoom: () => this.resetZoom(),
        wallInputRef: (el) => { this.wallInput = el; },
        pieceInputRef: (el) => { this.pieceInput = el; },
        toolbarRef: (el) => { this.toolbarEl = el; },
        gripRef: (el) => { this.gripEl = el; if (el && !this._gripBound) { this._gripBound = true; el.addEventListener('pointerdown', (e) => this.startSplit(e)); el.addEventListener('touchstart', this._gs, { passive: false }); el.addEventListener('touchmove', this._gm, { passive: false }); el.addEventListener('touchend', this._ge); el.addEventListener('touchcancel', this._ge); } },

        // canvas
        wallUrl: S.wallUrl,
        wallImgStyle: { position: 'absolute', left: (photoRect ? photoRect.x : 0) + 'px', top: (photoRect ? photoRect.y : 0) + 'px', width: (photoRect ? photoRect.w : 0) + 'px', height: (photoRect ? photoRect.h : 0) + 'px', backgroundImage: S.wallUrl ? ('url("' + S.wallUrl + '")') : 'none', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', pointerEvents: 'none', userSelect: 'none' },
        pieces, hasSelection, selHandles, selPoly, measLabel, hasMeas,
        calibrating: S.calibrating, calDots, calPoly,

        // toolbar
        menuOpen: S.menuOpen,
        toggleMenu: () => this.setState(s => ({ menuOpen: !s.menuOpen })),
        closeMenu: () => this.setState({ menuOpen: false }),
        menuReset: () => this.setState({ menuOpen: false, confirmReset: true }),
        menuExport: () => { this.setState({ menuOpen: false }); this.exportPng(); },
        saveLabel: S.saveStatus === 'saving' ? 'Saving…' : 'Saved',
        saveDotStyle: { width: '7px', height: '7px', borderRadius: '50%', flex: '0 0 auto', background: S.saveStatus === 'saving' ? 'var(--sub)' : '#3a8a5e', opacity: S.saveStatus === 'saving' ? 0.9 : 1 },
        showSaveNote: S.showSaveNote,
        dismissSaveNote: () => this.dismissSaveNote(),

        // header
        eyebrowCol, headlineCol,

        // panel routing
        isList: S.panelView === 'list', isWall: S.panelView === 'wall', isShop: onShop, isPiece: S.panelView === 'piece' && !!sel,
        piecesTabStyle: onPieces ? tabActive : tabIdle,
        shopTabStyle: onShop ? tabActive : tabIdle,
        wallTabStyle: onWall ? tabActive : tabIdle,
        shopItems,
        selectPiecesTab: () => this.setState({ panelView: 'list', selectedId: null, calibrating: false }),
        selectShopTab: () => this.setState({ panelView: 'shop', selectedId: null, calibrating: false }),
        // Entering the Wall tab in perspective mode always shows the calibration
        // dots — otherwise the perspective controls appear with nothing to drag.
        selectWallTab: () => this.setState(s => ({ panelView: 'wall', selectedId: null, calibrating: s.mode === 'perspective' })),
        gotoList: () => this.setState({ panelView: 'list' }),
        addPiece: () => this.addPiece(),
        thumbs,

        // wall panel
        wallW: S.wallW, wallH: S.wallH, refW: S.refW, refH: S.refH,
        wallOn: { w: this.setStr('wallW'), h: this.setStr('wallH') },
        refOn: { w: this.setStr('refW'), h: this.setStr('refH') },
        wallFtNote: '≈ ' + (Math.round(ww / 12 * 10) / 10) + ' ft wide × ' + (Math.round(wh / 12 * 10) / 10) + ' ft tall',
        hasWall: S.hasWall,
        wallThumbStyle: { width: '66px', height: '48px', borderRadius: '8px', backgroundImage: S.wallUrl ? ('url("' + S.wallUrl + '")') : 'none', backgroundColor: 'var(--bg)', backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)', flex: '0 0 auto' },
        wallUploadLabel: S.hasWall ? 'Replace photo' : 'Upload wall photo',
        uploadWall: () => this.wallInput && this.wallInput.click(),
        useDefault: () => { if (this.state.mode === 'perspective') this.disablePersp(); this.useDefaultWall(); },
        isFlat: !persp, isPersp: persp,
        enablePersp: () => this.enablePersp(),
        disablePersp: () => this.disablePersp(),
        toggleCalib: () => this.toggleCalib(),
        calibBtnLabel: S.calibrating ? 'Done' : 'Recalibrate dots',

        // piece panel
        sp: sel || { name: '', w: '', h: '', frameColor: '#2c261f', frameThickness: '', matWidth: '', matColor: '#fff' },
        spHasImage: sel ? !!sel.hasImage : false,
        spFeatured: sel ? !!sel.featured : false,
        spShopTitle: sel && sel.shopTitle ? sel.shopTitle : '',
        spShopMeta: sel ? ((sel.shopArtist || '') + ((sel.shopPrice && sel.shopPrice.trim()) ? (' · ' + sel.shopPrice) : '')) : '',
        spBuyUrl: sel && sel.buyUrl ? sel.buyUrl : '#',
        spShowPhotoBtns: sel ? !sel.featured : false,
        spShopThumbStyle: (() => { const u = this.effImg(sel); return u
          ? { width: '40px', height: '48px', flex: '0 0 auto', borderRadius: '5px', backgroundImage: 'url("' + u + '")', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#e7e1d6', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }
          : { width: '40px', height: '48px', flex: '0 0 auto', borderRadius: '5px', background: sel && sel.tint ? ('repeating-linear-gradient(45deg,' + sel.tint[0] + ',' + sel.tint[0] + ' 4px,' + sel.tint[1] + ' 4px,' + sel.tint[1] + ' 8px)') : '#e7e1d6', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }; })(),
        spMat,
        photoBtnLabel: (sel && sel.hasImage) ? 'Replace photo' : 'Add photo',
        frameSwatches, matSwatches, matToggleStyle, matKnobStyle,
        spOn: sel ? {
          w: (e) => this.updatePiece(sel.id, { w: e.target.value }),
          h: (e) => this.updatePiece(sel.id, { h: e.target.value }),
          frameThickness: (e) => this.updatePiece(sel.id, { frameThickness: e.target.value }),
          matWidth: (e) => this.updatePiece(sel.id, { matWidth: e.target.value }),
          frameColor: (e) => this.updatePiece(sel.id, { frameColor: e.target.value }),
          swap: () => this.swapWH(sel.id),
          toggleMat: () => this.toggleMat(sel.id),
          dup: () => this.duplicatePiece(sel.id),
          front: () => this.bringFront(sel.id),
          back: () => this.sendBack(sel.id),
          del: () => this.deletePiece(sel.id),
          addPhoto: () => this.pieceInput && this.pieceInput.click(),
          removePhoto: () => this.removePhoto(sel.id)
        } : {},
        onWallFile: (e) => this.onWallFile(e),
        onPieceFile: (e) => this.onPieceFile(e),

        // reset
        confirmReset: S.confirmReset,
        cancelReset: () => this.setState({ confirmReset: false }),
        doReset: () => { this.setState({ confirmReset: false }); this.doReset(); }
      };
    }

    render() {
      const v = this.renderVals();
      return html`
<div ref=${v.rootRef} style="height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','Segoe UI',Roboto,Arial,sans-serif;font-size:14px;overflow:hidden;--bg:#e9ecf1;--surface:#ffffff;--text:#1a2230;--sub:#8a95a6;--border:#dde2ea;--accent:#2f5e8c;--accentText:#fff;--canvas:#dfe3ea">

  <input type="file" accept="image/*" ref=${v.wallInputRef} onChange=${v.onWallFile} style="display:none"/>
  <input type="file" accept="image/*" ref=${v.pieceInputRef} onChange=${v.onPieceFile} style="display:none"/>

  <div aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none">
    <img data-catsrc="../prints/sandhill-cranes.webp" src="../prints/sandhill-cranes.webp" alt=""/>
    <img data-catsrc="../prints/sardines.webp" src="../prints/sardines.webp" alt=""/>
    <img data-catsrc="../prints/allen-gardens.webp" src="../prints/allen-gardens.webp" alt=""/>
    <img data-catsrc="../prints/tiny-rom.webp" src="../prints/tiny-rom.webp" alt=""/>
    <img data-catsrc="../prints/tiny-cn-tower.webp" src="../prints/tiny-cn-tower.webp" alt=""/>
    <img data-catsrc="../prints/four-kings.webp" src="../prints/four-kings.webp" alt=""/>
  </div>

  <div ref=${v.toolbarRef} style="flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:10px 14px;background:var(--surface);border-bottom:1px solid var(--border);z-index:30">
    <div style="margin-right:auto;min-width:0;display:flex;align-items:center;gap:12px">
      <a href="../" title="Back to lishaxu.com" aria-label="Back to home page" style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none;font-size:17px;line-height:1;touch-action:manipulation">←</a>
      <div style="min-width:0">
        <div style=${{ fontSize: '8.5px', fontWeight: 600, letterSpacing: '.15em', textTransform: 'uppercase', lineHeight: 1, marginBottom: '5px', color: v.eyebrowCol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gallery Wall Planner</div>
        <div style=${{ fontFamily: 'Lora,Georgia,serif', fontSize: '15px', fontWeight: 500, letterSpacing: 0, lineHeight: 1.4, paddingBottom: '1px', color: v.headlineCol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Plan it before you hang it.</div>
      </div>
    </div>
    <div title="Your work saves automatically on this device" style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--sub);white-space:nowrap;margin-right:2px">
      <span style=${v.saveDotStyle}></span>${v.saveLabel}
    </div>
    <div style="position:relative;display:flex">
      <button onClick=${v.toggleMenu} aria-label="More options" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--sub);cursor:pointer;touch-action:manipulation;font-size:19px;line-height:1;padding:0">⋯</button>
      ${v.menuOpen && html`
        <div style="position:absolute;right:0;top:calc(100% + 8px);min-width:172px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,0.2);padding:6px;z-index:10">
          <button onClick=${v.menuExport} style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;font-size:13.5px;font-weight:600;padding:10px 11px;border-radius:8px;border:none;background:transparent;color:var(--text);cursor:pointer"><span style="font-size:15px">⤓</span>Export image</button>
          <button onClick=${v.menuReset} style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;font-size:13.5px;font-weight:600;padding:10px 11px;border-radius:8px;border:none;background:transparent;color:#b23b27;cursor:pointer"><span style="font-size:15px">↺</span>Start over</button>
        </div>
      `}
    </div>
  </div>

  ${v.menuOpen && html`<div onPointerDown=${v.closeMenu} style="position:fixed;inset:0;z-index:25"></div>`}

  ${v.showSaveNote && html`
    <div style="flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--surface);border-bottom:1px solid var(--border);z-index:6">
      <span style="flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:#3a8a5e;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center">✓</span>
      <div style="flex:1;min-width:0;font-size:12.5px;line-height:1.4;color:var(--text)">Your work saves automatically on this device — no need to hit save.</div>
      <button onClick=${v.dismissSaveNote} style="flex:0 0 auto;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;touch-action:manipulation">Got it</button>
    </div>
  `}

  <div ref=${v.canvasRef} style="flex:0 0 auto;position:relative;overflow:hidden;background:var(--canvas);touch-action:none;user-select:none">
    <div style=${v.stageStyle}>
      ${v.wallUrl && html`<div style=${v.wallImgStyle}></div>`}

      ${v.pieces.map(p => html`
        <div key=${p.id} style=${p.containerStyle} data-piece=${p.id}>
          <div style=${p.matStyle}>
            ${p.hasImage && html`<div style=${p.imgStyle}></div>`}
            ${p.noImage && html`<div style=${p.phStyle}></div>`}
          </div>
        </div>
      `)}

      ${v.hasSelection && html`
        <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">
          <polygon points=${v.selPoly} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 4"></polygon>
        </svg>
        ${v.selHandles.map(hd => html`
          <div key=${hd.corner} style=${hd.boxStyle} data-resize=${hd.corner} data-resize-id=${hd.id}><div style=${hd.dotStyle}></div></div>
        `)}
      `}

      ${v.hasMeas && html`<div style=${v.measLabel.style}>${v.measLabel.text}</div>`}

      ${v.calibrating && html`
        <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible">
          <polygon points=${v.calPoly} fill="rgba(0,0,0,0.06)" stroke="var(--accent)" strokeWidth="2" strokeDasharray="7 5"></polygon>
        </svg>
        ${v.calDots.map(d => html`
          <div key=${d.idx} style=${d.boxStyle} data-caldot=${d.idx}><div style=${d.dotStyle}>${d.num}</div></div>
        `)}
      `}
    </div>

    ${v.calibrating && html`
      <div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(20,16,12,0.78);color:#fff;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;pointer-events:none;text-align:center;max-width:88%;line-height:1.35">Drag the 4 dots onto a real rectangle — a window, frame, or piece of tape</div>
    `}

    ${v.isZoomed && html`
      <button onClick=${v.resetZoom} style="position:absolute;right:12px;bottom:12px;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:8px 12px;border-radius:999px;border:none;background:rgba(20,16,12,0.8);color:#fff;cursor:pointer;touch-action:manipulation;z-index:40">${v.zoomLabel} · Reset</button>
    `}
  </div>

  <div style="flex:1 1 auto;min-height:0;background:var(--surface);border-top:1px solid var(--border);overflow-y:auto;-webkit-overflow-scrolling:touch;z-index:5">

    <div style="position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);z-index:4">
      <div ref=${v.gripRef} title="Drag to resize" style="display:flex;align-items:center;justify-content:center;height:14px;cursor:ns-resize;touch-action:none;user-select:none">
        <div style="width:40px;height:4px;border-radius:99px;background:var(--border)"></div>
      </div>
      <div style="padding:0 16px;display:flex;gap:26px">
        <button onClick=${v.selectPiecesTab} style=${v.piecesTabStyle}>Pieces</button>
        <button onClick=${v.selectShopTab} style=${v.shopTabStyle}>Shop</button>
        <button onClick=${v.selectWallTab} style=${v.wallTabStyle}>Wall</button>
      </div>
    </div>

    ${v.isList && html`
      <div style="padding:14px 14px 18px">
        <div style="display:flex;gap:11px;overflow-x:auto;padding:2px 0 6px">
          <button onClick=${v.addPiece} style="flex:0 0 auto;width:78px;height:104px;border-radius:12px;border:1.5px dashed var(--border);background:transparent;color:var(--sub);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:600;font-size:12px"><span style="font-size:22px;font-weight:400;line-height:1">+</span>Add</button>
          ${v.thumbs.map(t => html`
            <button key=${t.id} onClick=${t.onClick} style=${t.btnStyle}>
              <div style=${t.frameStyle}>
                ${t.hasImage && html`<div style=${t.imgStyle}></div>`}
                ${t.noImage && html`<div style=${t.phStyle}></div>`}
              </div>
            </button>
          `)}
        </div>
      </div>
    `}

    ${v.isShop && html`
      <div style="padding:14px 14px 20px">
        <div style="font-family:Lora,Georgia,serif;font-size:17px;font-weight:500;color:var(--text);line-height:1.2;margin-bottom:3px">Featured artwork</div>
        <div style="font-size:12px;color:var(--sub);line-height:1.45;margin-bottom:14px">Drop any artwork onto your wall to size and place it. <span style="white-space:nowrap">Buy links may earn us a commission.</span></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${v.shopItems.map(a => html`
            <div key=${a.title} style="border:1px solid var(--border);border-radius:13px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column">
              <div style=${a.thumbStyle}>${a.showPreviewLabel && html`<span style="font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.1em;color:rgba(0,0,0,0.32)">preview</span>`}</div>
              <div style="padding:9px 10px 10px;display:flex;flex-direction:column;flex:1">
                <div style="font-family:Lora,Georgia,serif;font-size:13.5px;font-weight:500;color:var(--text);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.title}</div>
                <div style="font-size:11px;color:var(--sub);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.artist}</div>
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-top:7px">
                  <span style="display:flex;align-items:baseline;gap:5px;min-width:0">
                    ${a.hasStrike && html`<span style="font-size:11px;color:var(--sub);text-decoration:line-through">${a.priceStrike}</span>`}
                    <span style=${a.priceStyle}>${a.priceMain}</span>
                  </span>
                  <span style="font-size:10.5px;color:var(--sub);flex:0 0 auto">${a.size}</span>
                </div>
                <div style="display:flex;gap:7px;margin-top:10px">
                  <button onClick=${a.add} style="flex:1;font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;border:1px solid transparent;background:var(--accent);color:var(--accentText);cursor:pointer;touch-action:manipulation">Add</button>
                  <a href=${a.buyUrl} target="_blank" rel="noopener noreferrer" data-umami-event="Planner Buy Click" data-umami-event-piece=${a.title} style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;text-decoration:none">Buy ↗</a>
                </div>
              </div>
            </div>
          `)}
        </div>
        <div style="font-size:10.5px;color:var(--sub);line-height:1.45;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">As an affiliate we earn from qualifying purchases. Prices and availability are set by the seller.</div>
      </div>
    `}

    ${v.isWall && html`
      <div style="padding:16px 14px 20px">
        <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);margin-bottom:9px">Wall photo</div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <div style=${v.wallThumbStyle}></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button onClick=${v.uploadWall} style="font-size:13px;font-weight:600;padding:9px 13px;border-radius:9px;border:1px solid transparent;background:var(--accent);color:var(--accentText);cursor:pointer">${v.wallUploadLabel}</button>
              ${v.hasWall && html`<button onClick=${v.useDefault} style="font-size:13px;font-weight:600;padding:9px 13px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Use default</button>`}
            </div>
          </div>
        </div>

        <div style="height:1px;background:var(--border);margin-bottom:13px"></div>

        ${v.isFlat && html`
          <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);margin-bottom:8px">Real wall size</div>
          <div style="display:flex;gap:10px;margin-bottom:6px">
            <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Width (in)</div><input inputMode="decimal" value=${v.wallW} onChange=${v.wallOn.w} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
            <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Height (in)</div><input inputMode="decimal" value=${v.wallH} onChange=${v.wallOn.h} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
          </div>
          <div style="font-size:11px;color:var(--sub);margin-bottom:12px">${v.wallFtNote}</div>

          <div style="height:1px;background:var(--border);margin-bottom:13px"></div>
        `}

        <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);margin-bottom:8px">Perspective match</div>

        ${v.isFlat && html`
          <div style="font-size:12.5px;color:var(--sub);line-height:1.45;margin-bottom:11px">For a tilted photo: turn this on, drag 4 dots onto a real rectangle, and enter its size.</div>
          <button onClick=${v.enablePersp} style="font-size:13px;font-weight:600;padding:10px 14px;border-radius:9px;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer">Enable perspective match</button>
        `}
        ${v.isPersp && html`
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Rect width (in)</div><input inputMode="decimal" value=${v.refW} onChange=${v.refOn.w} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
            <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Rect height (in)</div><input inputMode="decimal" value=${v.refH} onChange=${v.refOn.h} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button onClick=${v.toggleCalib} style="font-size:13px;font-weight:600;padding:9px 13px;border-radius:9px;border:1px solid transparent;background:var(--accent);color:var(--accentText);cursor:pointer">${v.calibBtnLabel}</button>
            <button onClick=${v.disablePersp} style="font-size:13px;font-weight:600;padding:9px 13px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--sub);cursor:pointer">Turn off</button>
          </div>
        `}
      </div>
    `}

    ${v.isPiece && html`
      <div style="padding:13px 14px 20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <button onClick=${v.gotoList} style="font-size:18px;line-height:1;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">‹</button>
          <div style="flex:1;font-size:15px;font-weight:700;padding:7px 0;color:var(--text)">Artwork</div>
        </div>

        ${v.spFeatured && html`
          <div style="display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:12px;border:1px solid var(--border);background:var(--bg);margin-bottom:16px">
            <div style=${v.spShopThumbStyle}></div>
            <div style="flex:1;min-width:0">
              <div style="font-family:Lora,Georgia,serif;font-size:13.5px;font-weight:500;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.spShopTitle}</div>
              <div style="font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.spShopMeta}</div>
            </div>
            <a href=${v.spBuyUrl} target="_blank" rel="noopener noreferrer" data-umami-event="Planner Buy Click" data-umami-event-piece=${v.spShopTitle} style="flex:0 0 auto;font-size:12px;font-weight:600;padding:8px 12px;border-radius:9px;border:1px solid transparent;background:var(--accent);color:var(--accentText);cursor:pointer;text-decoration:none;white-space:nowrap">Buy ↗</a>
          </div>
        `}

        ${v.spShowPhotoBtns && html`
          <div style="display:flex;gap:9px;margin-bottom:16px">
            <button onClick=${v.spOn.addPhoto} style="flex:1;font-size:13px;font-weight:600;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">${v.photoBtnLabel}</button>
            ${v.spHasImage && html`<button onClick=${v.spOn.removePhoto} style="flex:0 0 auto;font-size:13px;font-weight:600;padding:11px 13px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--sub);cursor:pointer">Remove</button>`}
          </div>
        `}

        <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);margin-bottom:8px">Size (outer, inches)</div>
        <div style="display:flex;gap:9px;align-items:flex-end;margin-bottom:16px">
          <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Width</div><input inputMode="decimal" value=${v.sp.w} onChange=${v.spOn.w} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
          <button onClick=${v.spOn.swap} title="Swap" style="flex:0 0 auto;font-size:16px;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">⇄</button>
          <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Height</div><input inputMode="decimal" value=${v.sp.h} onChange=${v.spOn.h} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
        </div>

        <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);margin-bottom:8px">Frame</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
          ${v.frameSwatches.map(s => html`<button key=${s.col} onClick=${s.onClick} style=${s.style}></button>`)}
          <label style="width:30px;height:30px;border-radius:8px;border:1px solid var(--border);overflow:hidden;cursor:pointer;position:relative;display:inline-flex;align-items:center;justify-content:center;background:conic-gradient(from 0deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"><input type="color" value=${v.sp.frameColor} onChange=${v.spOn.frameColor} style="position:absolute;width:200%;height:200%;opacity:0;cursor:pointer"/></label>
        </div>
        <div style="display:flex;gap:9px;align-items:flex-end;margin-bottom:16px">
          <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Frame thickness (in)</div><input inputMode="decimal" value=${v.sp.frameThickness} onChange=${v.spOn.frameThickness} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:11px">
          <div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub)">Mat</div>
          <button onClick=${v.spOn.toggleMat} style=${v.matToggleStyle}><span style=${v.matKnobStyle}></span></button>
        </div>
        ${v.spMat && html`
          <div style="display:flex;gap:9px;align-items:flex-end;margin-bottom:16px">
            <div style="flex:1"><div style="font-size:11px;color:var(--sub);margin-bottom:4px">Mat width (in)</div><input inputMode="decimal" value=${v.sp.matWidth} onChange=${v.spOn.matWidth} style="width:100%;font-size:14px;font-weight:600;padding:9px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text)"/></div>
            <div style="flex:0 0 auto;display:flex;gap:7px">
              ${v.matSwatches.map(s => html`<button key=${s.col} onClick=${s.onClick} style=${s.style}></button>`)}
            </div>
          </div>
        `}

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onClick=${v.spOn.dup} style="flex:1;min-width:80px;font-size:12.5px;font-weight:600;padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Duplicate</button>
          <button onClick=${v.spOn.front} style="flex:1;min-width:80px;font-size:12.5px;font-weight:600;padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Bring front</button>
          <button onClick=${v.spOn.back} style="flex:1;min-width:80px;font-size:12.5px;font-weight:600;padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Send back</button>
          <button onClick=${v.spOn.del} style="flex:1;min-width:80px;font-size:12.5px;font-weight:600;padding:10px;border-radius:9px;border:1px solid transparent;background:rgba(192,60,40,0.1);color:#b23b27;cursor:pointer">Delete</button>
        </div>
      </div>
    `}
  </div>

  ${v.confirmReset && html`
    <div style="position:fixed;inset:0;background:rgba(20,16,12,0.5);display:flex;align-items:center;justify-content:center;padding:24px;z-index:60">
      <div style="background:var(--surface);border-radius:16px;padding:22px;max-width:340px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,0.3)">
        <div style="font-weight:700;font-size:17px;margin-bottom:8px">Start over?</div>
        <div style="font-size:13.5px;color:var(--sub);line-height:1.5;margin-bottom:20px">This clears your wall photo, all artwork, and all saved data. This can't be undone.</div>
        <div style="display:flex;gap:10px">
          <button onClick=${v.cancelReset} style="flex:1;font-size:14px;font-weight:600;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">Cancel</button>
          <button onClick=${v.doReset} style="flex:1;font-size:14px;font-weight:600;padding:11px;border-radius:10px;border:1px solid transparent;background:#b23b27;color:#fff;cursor:pointer">Start over</button>
        </div>
      </div>
    </div>
  `}

</div>`;
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Planner));
})();
