/*
 * Aurora Casa Viva — scheda per Home Assistant
 * DomotikPro.it · https://domotikpro.it
 *
 * Piantina 2D animata collegata ai sensori veri:
 *  - luce del sole che entra dalle finestre, calcolata da azimut e altezza del sole;
 *  - macchina del tempo: trascini la barra e la casa rivive le ultime 24 ore dello storico;
 *  - scia di presenza tra le stanze (il percorso, non la posizione esatta);
 *  - energia che scorre dal quadro agli apparecchi, aria dalle finestre aperte, suoni,
 *    telecamera, allarme, pioggia e nuvole;
 *  - radar di presenza (con le zone dell MTR-1 disegnate), mappa di calore, consumi per stanza, raccolta differenziata,
 *    spioncino con foto, tocco sulle stanze e Short verticale registrato con un pulsante.
 * Un solo file, nessuna compilazione, nessun cloud. L'unica richiesta esterna sono i font Google
 * (con fonts: false nessuna).
 * Copyright (c) 2026 DomotikPro.it (Luca Pinelli). Uso personale gratuito: vedi LICENSE.
 * Guida: https://domotikpro.it/progetti/aurora-casa-viva
 */
const ACV_VERSION = '1.5.6';

(() => {
  if (customElements.get('aurora-casa-viva')) return;

  const RAD = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
  const parsePts = s => typeof s === 'string' ? s.split(',').map(p => p.trim().split(/\s+/).map(Number)) : s;
  const nf = (v, d = 0) => Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtDur = m => m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0');
  const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const MIN = 60000, DAY = 86400000;
  const OUT_DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const RAINY = { rainy: .75, pouring: 1, 'lightning-rainy': .9, 'snowy-rainy': .6, hail: .8 };
  const CLOUDY = { sunny: .05, 'clear-night': .05, partlycloudy: .45, cloudy: .88, fog: .8, rainy: .9, pouring: .95, 'lightning-rainy': .95, lightning: .85, snowy: .9, 'snowy-rainy': .9, hail: .9, windy: .3, 'windy-variant': .5, exceptional: .6 };
  const COND_IT = { sunny: 'Sereno', 'clear-night': 'Sereno', partlycloudy: 'Poco nuvoloso', cloudy: 'Nuvoloso', fog: 'Nebbia', rainy: 'Pioggia', pouring: 'Pioggia forte', 'lightning-rainy': 'Temporale', lightning: 'Fulmini', snowy: 'Neve', 'snowy-rainy': 'Nevischio', hail: 'Grandine', windy: 'Ventoso', 'windy-variant': 'Ventoso', exceptional: 'Allerta meteo' };
  const WASTE_COL = { carta: [96, 165, 250], cartone: [96, 165, 250], plastica: [250, 204, 21], multimateriale: [250, 204, 21], umido: [190, 130, 70], organico: [190, 130, 70], vetro: [74, 222, 128], indifferenziato: [156, 163, 175], secco: [156, 163, 175], pannolini: [232, 121, 249], verde: [34, 197, 94], sfalci: [34, 197, 94] };
  const DIRS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];

  // ───────── sole: algoritmo NOAA semplificato (precisione ~0,5°) ─────────
  function sunAt(ms, lat, lon) {
    const n = ms / DAY + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
    const ha = (gmst * 15 + lon) * RAD - ra, la = lat * RAD;
    const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
    return { az: (az / RAD + 360) % 360, el: el / RAD };
  }
  function sunColor(el) {
    if (el < 2) return [255, 122, 70];
    if (el < 10) return mixc([255, 122, 70], [255, 192, 122], (el - 2) / 8);
    if (el < 30) return mixc([255, 192, 122], [255, 238, 205], (el - 10) / 20);
    return [255, 246, 228];
  }
  const tempColor = T => T < 19 ? mixc([84, 140, 255], [80, 200, 230], clamp((T - 17) / 2, 0, 1)) : T < 22 ? mixc([80, 200, 230], [255, 196, 110], (T - 19) / 3) : mixc([255, 196, 110], [255, 92, 92], clamp((T - 22) / 4, 0, 1));

  function roundedPath(P, r) {
    const p = new Path2D(), n = P.length;
    p.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < n; i++) { const c = P[i], nx = P[(i + 1) % n], pv = P[(i - 1 + n) % n]; p.arcTo(c[0], c[1], nx[0], nx[1], Math.min(r, dist(c, nx) / 2, dist(c, pv) / 2)); }
    p.closePath(); return p;
  }
  function polyPath(c, P) { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.closePath(); }

  // generatore pseudo-casuale fisso: le animazioni non cambiano a ogni ricarica
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const CSS = `
  :host{display:block}
  ha-card{overflow:hidden;background:#05080f;color:#E8ECF8;font-family:Manrope,var(--ha-font-family-body,system-ui),sans-serif;border-radius:var(--ha-card-border-radius,18px);border:1px solid rgba(255,255,255,.08)}
  .wrap{position:relative}
  canvas.map{display:block;width:100%;cursor:pointer;touch-action:manipulation}
  .hud{position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;gap:10px;pointer-events:none}
  .glass{background:rgba(6,9,18,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.11);border-radius:14px;padding:10px 12px}
  .clock{font-family:Sora,Manrope,sans-serif;font-size:28px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
  .mode{font-size:12px;color:#A3AECB;margin-top:6px}
  .mode b{color:#22D3EE;font-weight:700}
  .mode b.rep{color:#FFC069}
  .info{font-size:13px;color:#C9D1E8;line-height:1.55;text-align:right}
  .info span{color:#A3AECB}
  .nofeed .feed{display:none}
  .feed{position:absolute;left:12px;bottom:12px;max-width:224px;pointer-events:none;font-size:13px;line-height:1.45;display:flex;flex-direction:column;gap:3px}
  .feed div{display:grid;grid-template-columns:42px 9px 1fr;gap:6px;align-items:baseline}
  .feed time{color:#A3AECB;font-variant-numeric:tabular-nums}
  .feed i{width:8px;height:8px;border-radius:50%;align-self:center}
  .pop{position:absolute;right:12px;bottom:12px;width:250px;max-width:calc(100% - 24px);font-size:13px}
  .bell{position:absolute;padding:8px;font-size:13px;cursor:pointer;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  .bell img{display:block;width:100%;border-radius:9px;margin-bottom:6px;aspect-ratio:16/9;object-fit:cover;background:#0b1020}
  .bell .cap{font-weight:700;color:#FFD9A0}
  .pop h3{margin:0 0 8px;font-size:12px;letter-spacing:1.3px;text-transform:uppercase;color:#E8ECF8}
  .pop .r{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
  .pop .r span:first-child{color:#A3AECB}
  .pop button{margin-top:8px;width:100%;min-height:36px;border-radius:10px;border:1px solid rgba(34,211,238,.45);background:rgba(34,211,238,.12);color:#E8ECF8;font:inherit;font-size:13px;cursor:pointer}
  .bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px 12px;border-top:1px solid rgba(255,255,255,.07)}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
  .btn{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#E8ECF8;border-radius:10px;padding:0 11px;min-height:38px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
  .btn.rec{border-color:rgba(255,92,110,.7);background:rgba(255,92,110,.18)}
  .btn.on{border-color:rgba(34,211,238,.6);background:rgba(34,211,238,.15)}
  .btn.play{width:42px;padding:0;background:linear-gradient(135deg,rgba(124,108,245,.55),rgba(34,211,238,.35))}
  .track{position:relative;height:56px}
  .track canvas{position:absolute;inset:0 0 auto 0;width:100%;height:40px;border-radius:9px}
  .track input{position:absolute;left:0;top:0;width:100%;height:40px;margin:0;opacity:0;cursor:grab}
  .head{position:absolute;top:-3px;width:2px;height:46px;background:#fff;box-shadow:0 0 10px #fff,0 0 20px #22D3EE;pointer-events:none;transform:translateX(-1px)}
  .ticks{position:absolute;left:0;right:0;top:42px;display:flex;justify-content:space-between;font-size:12px;color:#A3AECB;pointer-events:none}
  .narrow .hud{position:static;padding:10px 12px 0;flex-wrap:wrap}
  .narrow .hud .glass{padding:0;background:none;border:0;backdrop-filter:none}
  .narrow .info{text-align:left}
  .narrow .feed{display:none}
  .narrow .pop{position:static;width:auto;max-width:none;margin:0 12px 10px}
  .narrow + .bar{grid-template-columns:1fr}
  .narrow + .bar .btns:last-child{justify-content:space-between}
  [hidden]{display:none!important}
  `;

  class AuroraCasaViva extends HTMLElement {
    static getStubConfig() {
      return { title: 'Casa viva', north: 0, rooms: { soggiorno: { name: 'Soggiorno', points: '0 0,400 0,400 300,0 300' } } };
    }
    getCardSize() { return 12; }
    getGridOptions() { return { columns: 'full', rows: 'auto' }; }

    setConfig(config) {
      if (!config || !config.rooms) throw new Error('Aurora Casa Viva: serve almeno una stanza in "rooms"');
      this._config = config;
      this._prep(config);
      if (this._built) { this._resize(); this._rebuildDerived(); }
    }

    // ───────── geometria, grafo dei percorsi ─────────
    _prep(c) {
      const rooms = {};
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const [id, r] of Object.entries(c.rooms)) {
        const P = parsePts(r.points);
        const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
        const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        minX = Math.min(minX, bb[0]); minY = Math.min(minY, bb[1]); maxX = Math.max(maxX, bb[2]); maxY = Math.max(maxY, bb[3]);
        const node = r.node || [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
        rooms[id] = {
          id, name: r.name || id, short: r.short, P, bb, path: roundedPath(P, 7), node,
          label: r.label || node, rot: !!r.rotate_label, outdoor: !!r.outdoor, facing: r.facing,
          spine: (r.walk || [node]).map(p => p.slice()), lights: arr(r.light), motion: arr(r.motion), temp: r.temperature,
        };
      }
      this._rooms = rooms;
      this._plan = [minX, minY, maxX, maxY];
      this._house = new Path2D(); for (const k in rooms) if (!rooms[k].outdoor) this._house.addPath(rooms[k].path);
      this._openings = arr(c.openings).map(o => ({ ...o, a: o.from, b: o.to, n: Array.isArray(o.outside) ? o.outside : OUT_DIR[o.outside || 'left'], sill: o.sill ?? 0, top: o.top ?? 2.2, motes: Array.from({ length: 30 }, () => ({ u: rnd() * 2 - 1, v: rnd(), sv: .01 + rnd() * .025, p: rnd() * 6.28, s: .6 + rnd() * 1.5 })) }));
      this._door = c.door ? { ...c.door, len: c.door.length || 52, ang: c.door.angle ?? 85 } : null;
      this._devices = arr(c.devices);
      this._media = arr(c.media);
      this._cams = arr(c.cameras);
      this._radars = arr(c.radars).map(r => ({ ...r, fov: r.fov ?? 120, range: r.range_mm ?? 6000, ppm: r.ppm ?? (c.px_per_meter || 54), trail: [[], [], []], sm: [null, null, null] }));
      // grafo: spine delle stanze + porte interne + quadro + apparecchi
      const N = {}, adj = {};
      const link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
      for (const r of Object.values(rooms)) r.spine.forEach((p, i) => { N[r.id + '#' + i] = p; if (i) link(r.id + '#' + (i - 1), r.id + '#' + i); });
      const nearest = (room, p) => { const r = rooms[room]; if (!r) return null; let bi = 0, bd = 1e9; r.spine.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return room + '#' + bi; };
      if (c.outside_point) N.fuori = c.outside_point;
      arr(c.doors).forEach((d, k) => {
        const id = 'door' + k; N[id] = d.at;
        for (const rm of d.rooms) { if (rm === 'fuori') { if (N.fuori) link(id, 'fuori'); } else { const n = nearest(rm, d.at); if (n) link(id, n); } }
      });
      if (c.panel) { N.panel = c.panel.at; const n = nearest(c.panel.room, c.panel.at); if (n) link('panel', n); }
      this._devices.forEach((d, i) => { N['dev' + i] = d.at; const n = nearest(d.room, d.at); if (n) link('dev' + i, n); });
      for (const r of Object.values(rooms)) r.target = nearest(r.id, r.node);
      this._N = N; this._adj = adj; this._routes = {};
      // entità da seguire (stato e storico)
      const ents = new Set();
      for (const r of Object.values(rooms)) { r.lights.forEach(e => ents.add(e)); r.motion.forEach(e => ents.add(e)); if (r.temp) ents.add(r.temp); }
      this._openings.forEach(o => o.entity && ents.add(o.entity));
      if (this._door?.entity) ents.add(this._door.entity);
      this._devices.forEach(d => ents.add(d.entity));
      this._media.forEach(m => ents.add(m.entity));
      this._cams.forEach(m => ents.add(m.entity));
      if (c.alarm) ents.add(c.alarm);
      if (c.power_total) ents.add(c.power_total);
      if (c.waste) [c.waste.entity, c.waste.from].forEach(e => e && ents.add(e));
      if (c.doorbell) [c.doorbell.image, c.doorbell.event_type].forEach(e => e && ents.add(e));
      for (const r of this._radars) {
        [r.presence, r.moving, r.still, r.move_distance, r.still_distance].forEach(e => e && ents.add(e));
        if (r.type === 'ld2450') for (let i = 1; i <= 3; i++) {
          ents.add(`${r.prefix}_target_${i}_x`); ents.add(`${r.prefix}_target_${i}_y`);
          // zone del radar: coordinate (number.*) e persone dentro la zona
          const nb = r.prefix.replace(/^sensor\./, 'number.');
          ['x1', 'y1', 'x2', 'y2'].forEach(k => ents.add(`${nb}_zone_${i}_${k}`)); ents.add(`${r.prefix}_zone_${i}_all_target_count`);
        }
      }
      this._ents = [...ents];
      this._motionRoom = {}; for (const r of Object.values(rooms)) r.motion.forEach(e => this._motionRoom[e] = r.id);
      this._stars = Array.from({ length: 170 }, () => ({ x: rnd(), y: rnd(), r: .5 + rnd() * 1.3, p: rnd() * 6.28 }));
      this._clouds = Array.from({ length: 8 }, (_, i) => ({ x: rnd(), y: rnd(), r: 150 + rnd() * 160, k: i / 8 }));
      this._drops = Array.from({ length: 260 }, () => ({ x: rnd(), y: rnd(), v: .7 + rnd() * .6 }));
      this._ripples = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), p: rnd() }));
      this._air = Array.from({ length: 22 }, () => ({ u: rnd() * 2 - 1, p: rnd(), a: rnd() * 6.28 }));
    }
    _route(a, b) {
      const key = a + '>' + b; if (this._routes[key]) return this._routes[key];
      const N = this._N, adj = this._adj, D = { [a]: 0 }, P = {}, Q = new Set(Object.keys(N));
      while (Q.size) {
        let u = null; for (const q of Q) if (D[q] !== undefined && (u === null || D[q] < D[u])) u = q;
        if (u === null || u === b) break; Q.delete(u);
        for (const v of adj[u] || []) { const nd = D[u] + dist(N[u], N[v]); if (D[v] === undefined || nd < D[v]) { D[v] = nd; P[v] = u; } }
      }
      const path = [b]; while (path[0] !== a && P[path[0]]) path.unshift(P[path[0]]);
      if (path[0] !== a) path.unshift(a);
      const p = path.map(n => N[n]).filter(Boolean), segs = []; let L = 0;
      for (let i = 1; i < p.length; i++) { const l = dist(p[i - 1], p[i]); segs.push(l); L += l; }
      return (this._routes[key] = { p, segs, L: L || 1 });
    }
    _along(r, s) {
      s = clamp(s, 0, r.L);
      for (let i = 0; i < r.segs.length; i++) { if (s <= r.segs[i] || i === r.segs.length - 1) { const k = r.segs[i] ? s / r.segs[i] : 0; return [lerp(r.p[i][0], r.p[i + 1][0], k), lerp(r.p[i][1], r.p[i + 1][1], k)]; } s -= r.segs[i]; }
      return r.p[0];
    }

    // ───────── DOM ─────────
    _build() {
      this._built = true;
      if (this._config.fonts !== false && window.AURORA_CASA_VIVA_FONTS !== false && !document.getElementById('acv-fonts')) {
        const l = document.createElement('link'); l.id = 'acv-fonts'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap';
        document.head.appendChild(l);
      }
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
      <ha-card>
        <div class="wrap">
          <canvas class="map" aria-label="Piantina animata della casa"></canvas>
          <div class="hud">
            <div class="glass"><div class="clock">--:--</div><div class="mode"></div></div>
            <div class="glass info"></div>
          </div>
          <div class="feed"></div>
          <div class="glass pop" hidden></div>
          <div class="glass bell" hidden><img alt="Ultima foto dello spioncino"><div class="cap"></div></div>
        </div>
        <div class="bar">
          <div class="btns"><button class="btn play" aria-label="Rivivi le ultime 24 ore">▶</button></div>
          <div class="track"><canvas></canvas><input type="range" min="0" max="1440" step="0.5" aria-label="Ora delle ultime 24 ore"><div class="head"></div><div class="ticks"><span>-24 h</span><span>-18</span><span>-12</span><span>-6</span><span>adesso</span></div></div>
          <div class="btns"><button class="btn spd" data-s="60">×60</button><button class="btn spd on" data-s="600">×600</button><button class="btn spd" data-s="3600">×3600</button><button class="btn live on">Dal vivo</button><button class="btn energymap" title="Mappa dei consumi delle ultime 24 ore con il costo per stanza">Consumi</button><button class="btn heat" title="Mappa di calore: dove si è passato il tempo nelle ultime 24 ore">Calore</button><button class="btn short" title="Registra uno Short verticale delle ultime 24 ore">Short</button></div>
        </div>
      </ha-card>`;
      const $ = s => root.querySelector(s);
      this._el = { wrap: $('.wrap'), cv: $('canvas.map'), clock: $('.clock'), mode: $('.mode'), info: $('.info'), feed: $('.feed'), pop: $('.pop'), bell: $('.bell'), bellImg: $('.bell img'), bellCap: $('.bell .cap'), play: $('.play'), live: $('.live'), range: $('.track input'), tl: $('.track canvas'), head: $('.head') };
      this._ctx = this._el.cv.getContext('2d');
      this._fx = document.createElement('canvas'); this._fctx = this._fx.getContext('2d');
      this._base = document.createElement('canvas'); this._bctx = this._base.getContext('2d');
      this._live = true; this._playing = false; this._speed = 600; this._T = Date.now(); this._rt = 0;
      this._lit = {}; this._pglow = {}; this._doorA = 0; this._sel = null; this._scrub = false;
      this._tl = {}; this._wx = { t: [], v: [] };
      const E = this._el;
      E.range.addEventListener('input', () => { this._scrub = true; this._goReplay(); this._T = this._t0() + (+E.range.value) * MIN; });
      const end = () => { this._scrub = false; }; E.range.addEventListener('change', end); E.range.addEventListener('pointerup', end); E.range.addEventListener('touchend', end);
      E.play.onclick = () => {
        if (this._live) { this._goReplay(); this._T = this._t0(); this._playing = true; }
        else this._playing = !this._playing;
        this._syncBtns();
      };
      E.live.onclick = () => this._goLive();
      root.querySelector('.short').onclick = () => this._recordShort();
      root.querySelector('.heat').onclick = ev => { this._heatOn = !this._heatOn; ev.currentTarget.classList.toggle('on', this._heatOn); if (this._heatOn) { this._buildHeat(); this._energyOn = false; root.querySelector('.energymap').classList.remove('on'); } this._hudT = 0; };
      root.querySelector('.energymap').onclick = ev => { this._energyOn = !this._energyOn; ev.currentTarget.classList.toggle('on', this._energyOn); if (this._energyOn) { this._energyPrep(); this._heatOn = false; root.querySelector('.heat').classList.remove('on'); } this._hudT = 0; };
      E.bell.onclick = () => { const cam = this._config.doorbell?.camera || this._config.doorbell?.image; if (cam) this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: cam } })); };
      if (this._config.heatmap) { this._heatOn = true; root.querySelector('.heat').classList.add('on'); }
      root.querySelectorAll('.spd').forEach(b => b.onclick = () => { this._speed = +b.dataset.s; root.querySelectorAll('.spd').forEach(x => x.classList.toggle('on', x === b)); if (this._live) { this._goReplay(); this._T = this._t0(); } this._playing = true; this._syncBtns(); });
      E.cv.addEventListener('pointerdown', ev => this._pointer(ev, 'down'));
      E.cv.addEventListener('pointerup', ev => this._pointer(ev, 'up'));
      E.cv.addEventListener('pointercancel', ev => this._pointer(ev, 'cancel'));
      E.cv.addEventListener('contextmenu', ev => ev.preventDefault());
      this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(E.wrap);
      this._ro2 = new ResizeObserver(() => this._drawTimeline()); this._ro2.observe(E.tl);
      this._io = new IntersectionObserver(es => { this._visible = es.some(e => e.isIntersecting); }); this._io.observe(this);
      this._visible = true;
      this._loadHistory();
      this._start();
    }
    connectedCallback() { if (this._built) this._start(); }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._raf = null; }
    _start() {
      if (this._raf) return;
      let last = performance.now();
      const frame = now => {
        this._raf = requestAnimationFrame(frame);
        if (!this._visible || document.hidden) { last = now; return; }
        if (!this._S) { this._resize(); if (!this._S) return; }
        const dt = Math.min(.1, (now - last) / 1000); last = now; this._rt += dt;
        if (this._live) this._T = Date.now();
        else if (this._playing && !this._scrub) { this._T = this._rec ? this._rec.T0 + (now - this._rec.real0) * this._speed : this._T + dt * this._speed * 1000; if (this._T >= Date.now()) { this._T = Date.now(); if (this._rec && this._rec.rec.state === 'recording') this._rec.rec.stop(); this._goLive(); } }
        const st = this._render();
        if (this._rec) this._recFrame(st);
        this._hudT = (this._hudT || 0) - dt;
        if (this._hudT <= 0 || this._scrub) { this._updateHud(st); this._hudT = .25; }
      };
      this._raf = requestAnimationFrame(frame);
    }
    _t0() { return Date.now() - DAY; }
    _goLive() { this._live = true; this._playing = false; this._syncBtns(); }
    _goReplay() { if (this._live) { this._live = false; this._syncBtns(); } }
    _syncBtns() {
      const E = this._el; E.live.classList.toggle('on', this._live);
      E.play.textContent = this._live || !this._playing ? '▶' : '❚❚';
      E.play.setAttribute('aria-label', this._live ? 'Rivivi le ultime 24 ore' : this._playing ? 'Pausa' : 'Riproduci');
    }

    set hass(h) {
      const first = !this._hass; this._hass = h;
      if (!this._built) this._build();
      if (first) return;
      // aggiunge allo storico locale i cambi di stato arrivati dal vivo
      let changed = false;
      for (const e of this._ents) {
        const s = h.states[e]; if (!s) continue;
        const tl = this._tl[e] || (this._tl[e] = { t: [], s: [] });
        const t = Date.parse(s.last_changed);
        if (!tl.t.length || (tl.t[tl.t.length - 1] < t && tl.s[tl.s.length - 1] !== s.state)) { tl.t.push(t); tl.s.push(s.state); changed = true; }
      }
      const w = this._config.weather && h.states[this._config.weather];
      if (w) { const v = this._wxFrom(w.state, w.attributes); const last = this._wx.v[this._wx.v.length - 1]; if (!last || JSON.stringify(last) !== JSON.stringify(v)) { this._wx.t.push(Date.now()); this._wx.v.push(v); } }
      if (changed) this._rebuildDerived();
    }
    get hass() { return this._hass; }

    // ───────── storico ─────────
    async _loadHistory() {
      const h = this._hass; if (!h) return;
      const end = new Date(), start = new Date(end.getTime() - DAY);
      try {
        const r = await h.callWS({ type: 'history/history_during_period', start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: this._ents, minimal_response: true, no_attributes: true, significant_changes_only: false });
        const tl = {};
        for (const [e, list] of Object.entries(r || {})) { const t = [], s = []; for (const x of list) { const ts = ((x.lc ?? x.lu) || 0) * 1000; if (s.length && s[s.length - 1] === x.s) continue; t.push(ts); s.push(x.s); } tl[e] = { t, s }; }
        // mantiene i cambi arrivati dal vivo durante il caricamento
        for (const [e, cur] of Object.entries(this._tl)) { const dst = tl[e] || (tl[e] = { t: [], s: [] }); cur.t.forEach((t, i) => { if (!dst.t.length || t > dst.t[dst.t.length - 1]) { dst.t.push(t); dst.s.push(cur.s[i]); } }); }
        this._tl = tl;
        if (this._config.weather) {
          const w = await h.callWS({ type: 'history/history_during_period', start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: [this._config.weather], minimal_response: false, no_attributes: false, significant_changes_only: false });
          const list = (w || {})[this._config.weather] || []; const t = [], v = []; let lastA = {};
          for (const x of list) { if (x.a) lastA = x.a; t.push(((x.lc ?? x.lu) || 0) * 1000); v.push(this._wxFrom(x.s, lastA)); }
          if (t.length) this._wx = { t, v };
        }
      } catch (e) { console.warn('Aurora Casa Viva: storico non disponibile', e); }
      this._rebuildDerived();
    }
    _wxFrom(cond, a = {}) {
      const cc = a.cloud_coverage != null ? a.cloud_coverage / 100 : (CLOUDY[cond] ?? .3);
      const unit = a.wind_speed_unit || 'km/h';
      const ws = a.wind_speed != null ? (unit === 'm/s' ? a.wind_speed : unit === 'mph' ? a.wind_speed * .447 : a.wind_speed / 3.6) : 2;
      return { cond, cloud: clamp(Math.max(cc, (RAINY[cond] ? .85 : 0)), 0, 1), rain: RAINY[cond] || 0, wind: ws, from: a.wind_bearing ?? 270, out: a.temperature ?? null };
    }
    _at(e, T) {
      if (this._live) { const s = this._hass?.states[e]; return s ? s.state : undefined; }
      const tl = this._tl[e]; if (!tl || !tl.t.length) { const s = this._hass?.states[e]; return s ? s.state : undefined; }
      let lo = 0, hi = tl.t.length - 1; if (T < tl.t[0]) return tl.s[0];
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl.t[m] <= T) lo = m; else hi = m - 1; }
      return tl.s[lo];
    }
    _wxAt(T) {
      if (this._live) { const w = this._hass?.states[this._config.weather]; return w ? this._wxFrom(w.state, w.attributes) : this._wxFrom('sunny'); }
      const W = this._wx; if (!W.t.length) return this._wxFrom('sunny');
      let k = 0; for (let i = 0; i < W.t.length; i++) if (W.t[i] <= T) k = i; return W.v[k];
    }
    _rebuildDerived() {
      // eventi di presenza (stanza per stanza) e diario
      const pres = [], ev = [];
      for (const e of Object.keys(this._motionRoom)) {
        const tl = this._tl[e]; if (!tl) continue;
        for (let i = 0; i < tl.t.length; i++) if (tl.s[i] === 'on' && (i === 0 || tl.s[i - 1] !== 'on')) pres.push({ t: tl.t[i], r: this._motionRoom[e] });
      }
      pres.sort((a, b) => a.t - b.t);
      const P = []; for (const p of pres) if (!P.length || P[P.length - 1].r !== p.r) P.push(p);
      this._pres = P;
      const rising = (e, test, push) => { const tl = this._tl[e]; if (!tl) return; for (let i = 1; i < tl.t.length; i++) if (test(tl.s[i]) && !test(tl.s[i - 1])) push(tl.t[i], tl.s[i]); };
      for (const p of P) ev.push({ t: p.t, c: '#22D3EE', s: 'Movimento in ' + this._rooms[p.r].name.toLowerCase() });
      for (const r of Object.values(this._rooms)) r.lights.forEach(e => rising(e, s => s === 'on', t => ev.push({ t, c: '#FFC069', s: 'Luce ' + r.name.toLowerCase() + ' accesa' })));
      this._openings.forEach(o => o.entity && rising(o.entity, s => s === 'on', t => ev.push({ t, c: '#9FD5FF', s: (o.name || 'Finestra') + ' aperta' })));
      if (this._door?.entity) rising(this._door.entity, s => s === 'on', t => ev.push({ t, c: '#9FD5FF', s: 'Porta d\'ingresso aperta' }));
      this._devices.forEach(d => rising(d.entity, s => +s > (d.threshold ?? 400), (t, s) => ev.push({ t, c: '#FF9F5A', s: d.name + ' ' + nf(+s / 1000, 1) + ' kW' })));
      if (this._config.alarm) rising(this._config.alarm, s => /^armed|triggered/.test(s), (t, s) => ev.push({ t, c: '#FF7A85', s: s === 'triggered' ? 'Allarme scattato' : 'Allarme inserito' }));
      this._cams.forEach(c => rising(c.entity, s => s === 'on', t => ev.push({ t, c: '#B9A6FF', s: (c.name || 'Telecamera') + ': movimento' })));
      ev.sort((a, b) => a.t - b.t);
      this._bellEventsBuild(); (this._bellEv || []).forEach(b => ev.push({ t: b.t, c: '#FFD678', s: b.ring ? 'Hanno suonato alla porta' : 'Movimento alla porta' })); ev.sort((a, b) => a.t - b.t);
      this._en = null;
      this._events = ev;
      this._drawTimeline();
    }

    // ───────── stato in un istante (dal vivo o dallo storico) ─────────
    _state(T) {
      const c = this._config, hc = this._hass?.config || {};
      const sun = sunAt(T, hc.latitude ?? 41.9, hc.longitude ?? 12.5);
      const w = this._wxAt(T);
      const beams = [];
      if (sun.el > .4) {
        const A = (sun.az - (c.north || 0)) * RAD, d = [-Math.sin(A), Math.cos(A)], tanE = Math.tan(sun.el * RAD), ppm = c.px_per_meter || 54;
        for (const o of this._openings) {
          const cosI = -(d[0] * o.n[0] + d[1] * o.n[1]); if (cosI <= .04) continue;
          beams.push({ o, d, near: o.sill / tanE * ppm, far: Math.min(o.top / tanE * ppm, 1100), inten: Math.min(1, Math.sin(sun.el * RAD) * 2.4) * Math.min(1, cosI * 1.7) * (1 - w.cloud * .8) });
        }
      }
      const sunRoom = {}; for (const b of beams) sunRoom[b.o.room] = Math.max(sunRoom[b.o.room] || 0, b.inten);
      const lights = {}, temps = {};
      for (const r of Object.values(this._rooms)) {
        lights[r.id] = r.lights.some(e => this._at(e, T) === 'on');
        if (r.temp) { const v = parseFloat(this._at(r.temp, T)); if (!isNaN(v)) temps[r.id] = v; }
      }
      const open = {}; this._openings.forEach(o => open[o.entity] = this._at(o.entity, T) === 'on');
      const doorOpen = this._door?.entity ? this._at(this._door.entity, T) === 'on' : false;
      const dev = this._devices.map(d => { const v = parseFloat(this._at(d.entity, T)); return isNaN(v) ? 0 : Math.max(0, v); });
      let tot = c.power_total ? parseFloat(this._at(c.power_total, T)) : NaN; if (isNaN(tot)) tot = dev.reduce((a, b) => a + b, 0);
      const media = this._media.map(m => /^(playing|on)$/.test(this._at(m.entity, T) || ''));
      const cams = this._cams.map(m => this._at(m.entity, T) === 'on');
      const radars = this._radars.map(r => {
        const o = { on: r.presence ? this._at(r.presence, T) === 'on' : false };
        if (r.type === 'ld2450') o.t = [1, 2, 3].map(i => {
          const x = parseFloat(this._at(`${r.prefix}_target_${i}_x`, T)), y = parseFloat(this._at(`${r.prefix}_target_${i}_y`, T));
          return isFinite(x) && isFinite(y) && !(x === 0 && y === 0) && Math.hypot(x, y) <= r.range ? this._ldPos(r, x, y) : null;
        });
        if (r.type === 'ld2450') {
          const nb = r.prefix.replace(/^sensor\./, 'number.');
          o.z = [1, 2, 3].map(i => {
            const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => parseFloat(this._hass?.states[`${nb}_zone_${i}_${k}`]?.state));
            if (![x1, y1, x2, y2].every(isFinite) || (x1 === x2 && y1 === y2)) return null;
            const n = parseFloat(this._at(`${r.prefix}_zone_${i}_all_target_count`, T));
            return { i, pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => this._ldPos(r, x, y)), n: isFinite(n) ? n : 0 };
          }).filter(Boolean);
        }
        else { o.mv = this._at(r.moving, T) === 'on'; o.st = this._at(r.still, T) === 'on'; o.md = parseFloat(this._at(r.move_distance, T)); o.sd = parseFloat(this._at(r.still_distance, T)); }
        return o;
      });
      // sensori della stanza non raggiungibili (da sistemare)
      const offline = {};
      if (this._config.show_offline !== false) for (const r of Object.values(this._rooms)) {
        const l = [...r.motion, ...(r.temp ? [r.temp] : [])].filter(e => { const v = this._hass?.states[e]; return !v || v.state === 'unavailable'; });
        if (l.length) offline[r.id] = l;
      }
      const al = c.alarm ? this._at(c.alarm, T) || '' : '';
      const alarm = al === 'triggered' ? 'triggered' : al === 'armed_away' || al === 'armed_vacation' ? 'away' : /^armed/.test(al) ? 'night' : null;
      let pk = -1; const P = this._pres || []; for (let i = 0; i < P.length; i++) if (P[i].t <= T) pk = i; else break;
      if (w.out == null) w.out = 15;
      const waste = this._wasteList(T), bell = this._bellAt(T), energy = this._energyOn ? this._energyAt(T) : null;
      return { T, sun, w, beams, sunRoom, lights, temps, open, doorOpen, dev, tot, media, cams, radars, offline, alarm, pk, waste, bell, energy };
    }

    // ───────── dimensioni ─────────
    _resize() {
      const E = this._el; if (!E || this._rec) return;
      const W = E.wrap.clientWidth || 600;
      const narrow = W < 560; E.wrap.classList.toggle('narrow', narrow);
      this._bounds(narrow);
      const maxH = Math.max(380, innerHeight * .78);
      let CH = W * this._WH / this._WW; if (CH > maxH) CH = maxH;
      E.cv.style.height = CH + 'px';
      this._layout(E.cv, W, CH, Math.min(2, devicePixelRatio || 1));
      E.wrap.classList.toggle('nofeed', (W - (this._plan[2] - this._plan[0]) * this._S) / 2 < 236);
    }
    _bounds(narrow, margin) {
      const [x0, y0, x1, y1] = this._plan, pw = x1 - x0, ph = y1 - y0, m = (margin ?? (narrow ? .05 : .13)) * Math.max(pw, ph);
      const top = narrow ? .8 : 1.6;   // sopra la casa serve spazio per orologio e meteo
      this._W0 = x0 - m; this._H0 = y0 - m * top; this._WW = pw + 2 * m; this._WH = ph + (top + .8) * m;
      this._C0 = [(x0 + x1) / 2, (y0 + y1) / 2];
    }
    _layout(cv, CW, CH, DPR) {
      this._CW = CW; this._CH = CH; this._DPR = DPR;
      for (const c of [cv, this._fx, this._base]) { c.width = Math.round(CW * DPR); c.height = Math.round(CH * DPR); }
      this._S = Math.min(CW / this._WW, CH / this._WH);
      this._OX = (CW - this._WW * this._S) / 2 - this._W0 * this._S; this._OY = (CH - this._WH * this._S) / 2 - this._H0 * this._S;
      this._renderBase();
    }
    _world(c) { c.setTransform(this._DPR * this._S, 0, 0, this._DPR * this._S, this._DPR * this._OX, this._DPR * this._OY); }
    _px(v) { return v * (this._fs || 1) / this._S; }
    _font(size, w = 600, fam = 'Manrope') { return `${w} ${this._px(size)}px ${fam}, sans-serif`; }
    _renderBase() {
      const c = this._bctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._base.width, this._base.height); this._world(c);
      const [x0, y0, x1, y1] = this._plan;
      const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#7C6CF5'); g.addColorStop(1, '#22D3EE');
      c.save(); c.strokeStyle = g; c.lineJoin = 'round';
      c.globalAlpha = .2; c.lineWidth = 22; c.filter = 'blur(12px)'; c.stroke(this._house); c.filter = 'none';
      c.globalAlpha = .45; c.lineWidth = 1.5; c.stroke(this._house); c.restore();
      const dots = document.createElement('canvas'); dots.width = dots.height = 16; const d = dots.getContext('2d'); d.fillStyle = 'rgba(255,255,255,.09)'; d.beginPath(); d.arc(8, 8, 1, 0, 7); d.fill();
      const pat = c.createPattern(dots, 'repeat');
      for (const R of Object.values(this._rooms)) {
        c.fillStyle = R.outdoor ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.045)'; c.fill(R.path);
        if (!R.outdoor) { c.fillStyle = pat; c.fill(R.path); }
        c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1.5; if (R.outdoor) c.setLineDash([6, 6]); c.stroke(R.path); c.setLineDash([]);
      }
    }
    _lay(k) { const L = this._config.layers || {}; return L[k] !== false; }

    // ───────── disegno ─────────
    _sunPos(az) {
      const A = (az - (this._config.north || 0)) * RAD, u = [Math.sin(A), -Math.cos(A)];
      // sole e luna stanno nel margine attorno alla casa (su schermo stretto il margine è piccolo)
      const mx = (this._WW - (this._plan[2] - this._plan[0])) / 2, my = (this._WH - (this._plan[3] - this._plan[1])) / 2;
      const hx = this._WW / 2 - Math.min(46, mx * .45), hy = this._WH / 2 - Math.min(46, my * .45);
      const k = Math.min(hx / Math.max(1e-6, Math.abs(u[0])), hy / Math.max(1e-6, Math.abs(u[1])));
      const cx = this._W0 + this._WW / 2, cy = this._H0 + this._WH / 2;
      return [cx + u[0] * k, cy + u[1] * k];
    }
    _cloudAt(x, y, w) {
      let m = 0;
      for (const cl of this._clouds) {
        const a = clamp(w.cloud * 1.5 - cl.k, 0, 1); if (a <= 0) continue;
        const cx = this._W0 - 350 + ((cl.x * (this._WW + 700) + this._rt * (5 + w.wind * 3)) % (this._WW + 700)), cy = this._H0 + cl.y * this._WH, dd = Math.hypot(x - cx, y - cy) / cl.r;
        m = Math.max(m, a * Math.exp(-dd * dd * 1.6));
      }
      return m;
    }
    _render() {
      const ctx = this._ctx, st = this._state(this._T);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this._el.cv.width, this._el.cv.height); this._world(ctx);
      this._drawSky(st); this._drawFx(st); this._drawSun(st);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._base, 0, 0); ctx.restore(); this._world(ctx);
      ctx.fillStyle = `rgba(3,5,12,${(.28 * (1 - sstep(-6, 4, st.sun.el))).toFixed(3)})`; ctx.fill(this._house);
      if (this._config.thermal) this._drawThermal(st);
      if (this._lay('sun')) this._drawSunlight(st);
      this._drawLights(st);
      if (this._heatOn) this._drawHeat(st);
      if (this._energyOn) this._drawEnergyMap(st);
      if (this._lay('energy')) this._drawEnergy(st);
      if (this._lay('air')) this._drawAir(st);
      if (this._lay('sound')) this._drawSound(st);
      if (this._lay('security')) this._drawSecurity(st);
      this._drawRadars(st);
      if (this._lay('presence')) this._drawPresence(st);
      this._drawOpenings(st);
      this._drawBell(st);
      this._drawWaste(st);
      this._drawTaps();
      if (this._lay('weather')) this._drawClouds(st);
      this._drawLabels(st);
      return st;
    }
    _drawSky(st) {
      const ctx = this._ctx, el = st.sun.el; let col;
      if (el < -10) col = [6, 9, 18];
      else if (el < -2) col = mixc([6, 9, 18], [26, 19, 52], (el + 10) / 8);
      else if (el < 8) col = mixc([26, 19, 52], [34, 30, 58], (el + 2) / 10);
      else col = mixc([34, 30, 58], [11, 36, 54], clamp((el - 8) / 14, 0, 1));
      ctx.fillStyle = rgba(col, 1); ctx.fillRect(this._W0 - 3000, this._H0 - 3000, this._WW + 6000, this._WH + 6000);
      if (el > -9) {
        const sp = this._sunPos(st.sun.az), sc = sunColor(el), a = el < 0 ? .25 * (1 + el / 9) : el < 12 ? .3 : .16;
        const g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], 950); g.addColorStop(0, rgba(sc, a)); g.addColorStop(1, rgba(sc, 0));
        ctx.fillStyle = g; ctx.fillRect(this._W0 - 3000, this._H0 - 3000, this._WW + 6000, this._WH + 6000);
      }
    }
    _drawFx(st) {
      const c = this._fctx, rt = this._rt, W0 = this._W0, H0 = this._H0, WW = this._WW, WH = this._WH;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this._fx.width, this._fx.height); this._world(c);
      const night = 1 - sstep(-11, -1, st.sun.el);
      if (night > 0) {
        for (const s of this._stars) { const tw = .55 + .45 * Math.sin(rt * 1.7 + s.p); c.fillStyle = `rgba(220,228,255,${(night * tw * .8 * (1 - st.w.cloud * .8)).toFixed(3)})`; c.beginPath(); c.arc(W0 + s.x * WW, H0 + s.y * WH, s.r, 0, 7); c.fill(); }
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let band = 0; band < 2; band++) {
          const y0 = band ? this._plan[3] + 30 : this._plan[1] - 60, hue = band ? [139, 124, 248] : [64, 230, 190];
          for (let j = 0; j < 14; j++) {
            c.beginPath();
            for (let x = W0; x <= W0 + WW; x += 18) { const y = y0 + j * 3 + Math.sin(x / 140 + rt * .35 + band * 2) * 26 + Math.sin(x / 57 - rt * .5) * 8; x === W0 ? c.moveTo(x, y) : c.lineTo(x, y); }
            c.strokeStyle = rgba(hue, .05 * night * (1 - j / 14)); c.lineWidth = 6; c.stroke();
          }
        }
        c.restore();
      }
      if (this._lay('weather') && st.w.rain > .02) {
        const n = Math.floor(this._drops.length * clamp(st.w.rain, 0, 1)), wa = (st.w.from + 180) * RAD, wx = Math.sin(wa) * (2 + st.w.wind), wy = -Math.cos(wa) * (2 + st.w.wind);
        c.strokeStyle = 'rgba(170,200,255,.45)'; c.lineWidth = 1.2; c.beginPath();
        for (let i = 0; i < n; i++) { const d = this._drops[i]; const x = W0 + ((d.x * WW + rt * wx * 40 * d.v) % WW + WW) % WW, y = H0 + ((d.y * WH + rt * (260 + wy * 30) * d.v) % WH + WH) % WH; c.moveTo(x, y); c.lineTo(x - wx * 3, y - 14); }
        c.stroke();
        for (let i = 0; i < this._ripples.length * st.w.rain; i++) { const r = this._ripples[i], ph = (rt * .9 + r.p) % 1; c.strokeStyle = `rgba(170,200,255,${(.4 * (1 - ph)).toFixed(3)})`; c.beginPath(); c.ellipse(W0 + r.x * WW, H0 + r.y * WH, 3 + ph * 12, 2 + ph * 8, 0, 0, 7); c.stroke(); }
      }
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.strokeStyle = '#000'; c.lineWidth = 22; c.lineJoin = 'round';
      c.fill(this._house); c.stroke(this._house); c.globalCompositeOperation = 'source-over';
      const ctx = this._ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._fx, 0, 0); ctx.restore();
    }
    _drawSun(st) {
      const ctx = this._ctx, el = st.sun.el, rt = this._rt;
      if (el > -4) {
        const p = this._sunPos(st.sun.az), sc = sunColor(el), a = sstep(-4, 1, el);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 70); g.addColorStop(0, rgba(sc, .9 * a)); g.addColorStop(.25, rgba(sc, .4 * a)); g.addColorStop(1, rgba(sc, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 70, 0, 7); ctx.fill();
        ctx.fillStyle = rgba([255, 250, 235], a); ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(rt * .15); ctx.strokeStyle = rgba(sc, .55 * a); ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(27 + 3 * Math.sin(rt * 2 + i), 0); ctx.stroke(); }
        ctx.restore();
      }
      if (el < 2) {
        const p = this._sunPos((st.sun.az + 180) % 360), a = 1 - sstep(-4, 2, el);
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 50); g.addColorStop(0, `rgba(200,212,255,${.35 * a})`); g.addColorStop(1, 'rgba(200,212,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 50, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(232,236,255,${.95 * a})`; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(6,9,18,${a})`; ctx.beginPath(); ctx.arc(p[0] + 5, p[1] - 3, 9.5, 0, 7); ctx.fill();
      }
      // nord
      const nr = -(this._config.north || 0) * RAD, cx = this._W0 + this._WW / 2, cy = this._H0 + this._WH / 2;
      const R = Math.min(this._WW, this._WH) / 2 - this._px(20);
      ctx.fillStyle = 'rgba(232,236,248,.85)'; ctx.font = this._font(13, 700, 'Sora'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', cx + Math.sin(nr) * R, cy - Math.cos(nr) * R);
    }
    _drawSunlight(st) {
      const ctx = this._ctx, sc = sunColor(st.sun.el), rt = this._rt, S = this._S, DPR = this._DPR;
      if (st.sun.el > 0) {
        const A = (st.sun.az - (this._config.north || 0)) * RAD;
        for (const R of Object.values(this._rooms)) {
          if (!R.outdoor) continue;
          const I = Math.min(1, Math.sin(st.sun.el * RAD) * 2.5) * (1 - st.w.cloud * .8) * (R.facing != null ? Math.max(0, Math.cos((st.sun.az - R.facing) * RAD)) : .8);
          if (I > .01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(sc, .2 * I); ctx.fill(R.path); ctx.restore(); }
        }
      }
      for (const b of st.beams) {
        const o = b.o, d = b.d, R = this._rooms[o.room]; if (!R) continue;
        const mid = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], half = [(o.b[0] - o.a[0]) / 2, (o.b[1] - o.a[1]) / 2];
        const P = (k, f) => { const sp = 1 + f / 900; return [mid[0] + half[0] * k * sp + d[0] * f, mid[1] + half[1] * k * sp + d[1] * f]; };
        const I = b.inten * (1 - .75 * this._cloudAt(mid[0], mid[1], st.w)) * (.92 + .08 * Math.sin(rt * 1.3 + mid[0]));
        if (I < .01) continue;
        ctx.save(); ctx.clip(R.path); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(sc, .05 * I); ctx.fill(R.path);
        const fl = Math.min(b.far, 460);
        let g = ctx.createLinearGradient(mid[0], mid[1], mid[0] + d[0] * fl, mid[1] + d[1] * fl);
        g.addColorStop(0, rgba(sc, Math.min(.4, .3 * I + .08 * b.inten))); g.addColorStop(1, rgba(sc, 0));
        ctx.fillStyle = g; polyPath(ctx, [P(-1.6, 0), P(1.6, 0), P(1.6, b.far * 1.08), P(-1.6, b.far * 1.08)]); ctx.fill();
        g = ctx.createLinearGradient(mid[0] + d[0] * b.near, mid[1] + d[1] * b.near, mid[0] + d[0] * b.far, mid[1] + d[1] * b.far);
        g.addColorStop(0, rgba(sc, .62 * I)); g.addColorStop(.75, rgba(sc, .42 * I)); g.addColorStop(1, rgba(sc, .04 * I));
        ctx.fillStyle = g; ctx.filter = 'blur(' + Math.max(.5, 2.5 * S * DPR).toFixed(1) + 'px)';
        polyPath(ctx, [P(-1, b.near), P(1, b.near), P(1, b.far), P(-1, b.far)]); ctx.fill(); ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(8,11,20,${(.32 * I).toFixed(3)})`;
        polyPath(ctx, [P(-.06, b.near), P(.06, b.near), P(.06, b.far), P(-.06, b.far)]); ctx.fill();
        if (b.far - b.near > 40) { const fm = (b.near + b.far) / 2, th = Math.max(3, (b.far - b.near) * .04); polyPath(ctx, [P(-1, fm - th), P(1, fm - th), P(1, fm + th), P(-1, fm + th)]); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter';
        for (const m of o.motes) {
          const v = (m.v + rt * m.sv) % 1, u = m.u + Math.sin(rt * .6 + m.p) * .12, q = P(u * 1.4, b.far * v * 1.05), tw = .5 + .5 * Math.sin(rt * 2.2 + m.p * 3);
          ctx.fillStyle = rgba([255, 250, 230], .75 * I * tw * Math.sin(Math.PI * v)); ctx.beginPath(); ctx.arc(q[0], q[1], m.s, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }
    _drawThermal(st) {
      const ctx = this._ctx;
      for (const [r, T] of Object.entries(st.temps)) {
        const R = this._rooms[r], col = tempColor(T), n = R.node, br = .2 + .05 * Math.sin(this._rt * 1.2 + n[0]);
        const g = ctx.createRadialGradient(n[0], n[1], 0, n[0], n[1], Math.max(R.bb[2] - R.bb[0], R.bb[3] - R.bb[1]) * .8);
        g.addColorStop(0, rgba(col, br + .12)); g.addColorStop(1, rgba(col, br * .45)); ctx.fillStyle = g; ctx.fill(R.path);
      }
    }
    _drawLights(st) {
      const ctx = this._ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const R of Object.values(this._rooms)) {
        this._lit[R.id] = lerp(this._lit[R.id] || 0, st.lights[R.id] ? 1 : 0, this._scrub ? .35 : .08);
        const a = this._lit[R.id]; if (a < .01) continue;
        const n = R.node, rad = Math.hypot(R.bb[2] - R.bb[0], R.bb[3] - R.bb[1]) * .62;
        const g = ctx.createRadialGradient(n[0], n[1], 0, n[0], n[1], rad); g.addColorStop(0, `rgba(255,190,112,${.42 * a})`); g.addColorStop(1, `rgba(255,170,90,${.13 * a})`);
        ctx.fillStyle = g; ctx.fill(R.path);
        ctx.strokeStyle = `rgba(255,196,120,${.75 * a})`; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(255,180,100,.9)'; ctx.shadowBlur = 16 * this._S * this._DPR; ctx.stroke(R.path); ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
    _drawEnergy(st) {
      const ctx = this._ctx, rt = this._rt, pn = this._config.panel; if (!pn) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const q = pn.at; ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.strokeStyle = 'rgba(34,211,238,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(q[0] - 9, q[1] - 7, 18, 14, 3); ctx.fill(); ctx.stroke();
      this._devices.forEach((D, i) => {
        const w = st.dev[i]; if (w < (D.min ?? 3)) return;
        const r = this._route('panel', 'dev' + i), col = w < 300 ? [34, 211, 238] : w < 1000 ? [255, 210, 110] : [255, 128, 80];
        ctx.strokeStyle = rgba(col, .07 + Math.min(.15, w / 12000)); ctx.lineWidth = 2; ctx.beginPath(); r.p.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
        const n = Math.round(clamp(2 + w / 170, 2, 16)), v = 28 + Math.sqrt(w) * 5.5;
        for (let k = 0; k < n; k++) {
          const p = this._along(r, (rt * v + k * r.L / n) % r.L);
          const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7); g.addColorStop(0, rgba(col, .95)); g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.fill();
        }
        const d = D.at, pulse = .5 + .5 * Math.sin(rt * (2 + w / 500));
        ctx.strokeStyle = rgba(col, .35 + .4 * pulse); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d[0], d[1], 7 + Math.min(10, w / 220) * pulse, 0, 7); ctx.stroke();
        ctx.fillStyle = rgba(col, .9); ctx.beginPath(); ctx.arc(d[0], d[1], 3.5, 0, 7); ctx.fill();
        if (w > 400) {
          ctx.globalCompositeOperation = 'source-over'; ctx.font = this._font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.strokeStyle = 'rgba(5,8,15,.85)'; ctx.lineWidth = this._px(3); ctx.strokeText(nf(w / 1000, 1) + ' kW', d[0], d[1] - this._px(10));
          ctx.fillStyle = rgba(col, 1); ctx.fillText(nf(w / 1000, 1) + ' kW', d[0], d[1] - this._px(10)); ctx.globalCompositeOperation = 'lighter';
        }
      });
      ctx.restore();
    }
    _drawAir(st) {
      const ctx = this._ctx, rt = this._rt;
      for (const o of this._openings) {
        if (!st.open[o.entity]) continue;
        const R = this._rooms[o.room]; if (!R) continue;
        const nin = [-o.n[0], -o.n[1]], half = [(o.b[0] - o.a[0]) / 2, (o.b[1] - o.a[1]) / 2], mid = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
        const inside = st.temps[o.room] ?? 20, col = st.w.out < inside ? [140, 196, 255] : [255, 176, 120], L = 110 + st.w.wind * 12;
        ctx.save(); ctx.clip(R.path); ctx.lineCap = 'round';
        for (const a of this._air) {
          const s = (rt * (.18 + st.w.wind * .02) + a.p) % 1, spread = 1 + s * 1.6;
          const wig = Math.sin(rt * 2 + a.a + s * 6) * 9, perp = [half[0] / 20, half[1] / 20];
          const x = mid[0] + half[0] * a.u * spread + nin[0] * s * L + perp[0] * wig, y = mid[1] + half[1] * a.u * spread + nin[1] * s * L + perp[1] * wig;
          ctx.strokeStyle = rgba(col, .55 * Math.sin(Math.PI * s)); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - nin[0] * 8 + perp[0] * 6, y - nin[1] * 8 + perp[1] * 6, x - nin[0] * 16, y - nin[1] * 16); ctx.stroke();
        }
        ctx.restore();
      }
    }
    _drawSound(st) {
      const ctx = this._ctx;
      this._media.forEach((m, i) => {
        if (!st.media[i]) return; const R = this._rooms[m.room]; if (!R) return;
        ctx.save(); ctx.clip(R.path);
        for (let k = 0; k < 4; k++) { const r = (this._rt * 34 + k * 30) % 120; ctx.strokeStyle = `rgba(167,150,255,${((1 - r / 120) * .55).toFixed(3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.at[0], m.at[1], r + 6, 0, 7); ctx.stroke(); }
        ctx.fillStyle = '#B9A6FF'; ctx.beginPath(); ctx.arc(m.at[0], m.at[1], 4.5, 0, 7); ctx.fill(); ctx.restore();
      });
    }
    _drawSecurity(st) {
      const ctx = this._ctx, rt = this._rt;
      this._cams.forEach((cm, i) => {
        const hit = st.cams[i] ? 1 : 0, col = hit ? [255, 122, 133] : [185, 166, 255], len = cm.range || 300, fov = cm.fov || 50, ang = cm.angle ?? 0;
        const a0 = (ang - fov / 2) * RAD, a1 = (ang + fov / 2) * RAD, R = this._rooms[cm.room];
        const g = ctx.createRadialGradient(cm.at[0], cm.at[1], 0, cm.at[0], cm.at[1], len); g.addColorStop(0, rgba(col, .28 + .3 * hit * (.6 + .4 * Math.sin(rt * 8)))); g.addColorStop(1, rgba(col, 0));
        ctx.save(); if (R) ctx.clip(R.path); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cm.at[0], cm.at[1]); ctx.arc(cm.at[0], cm.at[1], len, a0, a1); ctx.closePath(); ctx.fill();
        const sw = ang * RAD + Math.sin(rt * .8) * fov / 2 * RAD; ctx.strokeStyle = rgba(col, .5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cm.at[0], cm.at[1]); ctx.lineTo(cm.at[0] + Math.cos(sw) * len, cm.at[1] + Math.sin(sw) * len); ctx.stroke();
        ctx.restore(); ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.roundRect(cm.at[0] - 7, cm.at[1] - 5, 14, 10, 3); ctx.fill();
      });
      if (st.alarm) {
        const red = st.alarm === 'night' ? [255, 150, 110] : [255, 92, 110], [x0, y0, x1, y1] = this._plan, h = y1 - y0 + 220;
        const y = y0 - 110 + ((rt * (st.alarm === 'triggered' ? 420 : 140)) % h);
        ctx.save(); ctx.clip(this._house); ctx.globalCompositeOperation = 'lighter';
        if (st.alarm === 'triggered') { ctx.fillStyle = rgba(red, .12 + .1 * Math.sin(rt * 10)); ctx.fill(this._house); }
        const gl = ctx.createLinearGradient(0, y - 70, 0, y + 4); gl.addColorStop(0, rgba(red, 0)); gl.addColorStop(1, rgba(red, .22));
        ctx.fillStyle = gl; ctx.fillRect(x0, y - 70, x1 - x0, 74); ctx.fillStyle = rgba(red, .85); ctx.fillRect(x0, y, x1 - x0, 1.6);
        ctx.restore();
        ctx.save(); ctx.strokeStyle = rgba(red, .45); ctx.lineWidth = 1.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -rt * 30; ctx.stroke(this._house); ctx.restore();
      }
    }
    _drawPresence(st) {
      const ctx = this._ctx, P = this._pres || [], rt = this._rt; if (st.pk < 0) return;
      const sp = this._live ? 1 : this._speed, T = st.T;
      const W = clamp(sp * 8, 360, 5400) * 1000, tr = Math.max(1500, sp * 1800);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let j = st.pk; j >= 1; j--) {
        const v = P[j], prev = P[j - 1]; if (T - v.t > W + tr) break;
        const r = this._route(this._rooms[prev.r].target, this._rooms[v.r].target);
        for (let s = 0; s <= r.L; s += 5) {
          const ts = v.t + (s / r.L) * tr; if (ts > T) break;
          const age = (T - ts) / W; if (age > 1) continue;
          const p = this._along(r, s), a = Math.pow(1 - age, 1.6) * .7, rad = 2.5 + 4.5 * a;
          const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 2.2); g.addColorStop(0, `rgba(120,240,255,${(.42 * a).toFixed(3)})`); g.addColorStop(1, 'rgba(124,108,245,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 2.2, 0, 7); ctx.fill();
        }
      }
      const v = P[st.pk], prev = P[Math.max(0, st.pk - 1)], k = clamp((T - v.t) / tr, 0, 1);
      const fade = this._live ? 1 - sstep(20 * MIN, 40 * MIN, T - v.t) : 1;
      let head = st.pk === 0 ? this._N[this._rooms[v.r].target] : this._along(this._route(this._rooms[prev.r].target, this._rooms[v.r].target), 0);
      if (st.pk > 0) { const r = this._route(this._rooms[prev.r].target, this._rooms[v.r].target); head = this._along(r, r.L * k); }
      const ri = this._radars.findIndex(r => r.room === v.r && r.type === 'ld2450'), tgt = ri >= 0 ? this._radars[ri].sm.find(Boolean) : null;
      if (k >= 1) head = tgt && st.radars[ri].t.some(Boolean) ? tgt : [head[0] + Math.sin(rt * .7) * 6, head[1] + Math.cos(rt * .9) * 5];
      if (fade > .02) {
        const pulse = (rt * .8) % 1;
        ctx.strokeStyle = `rgba(34,211,238,${(.7 * (1 - pulse) * fade).toFixed(3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(head[0], head[1], 8 + pulse * 26, 0, 7); ctx.stroke();
        const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 20); g.addColorStop(0, `rgba(230,255,255,${fade})`); g.addColorStop(.3, `rgba(34,211,238,${.8 * fade})`); g.addColorStop(1, 'rgba(124,108,245,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(head[0], head[1], 20, 0, 7); ctx.fill();
      }
      ctx.restore();
      for (const R of Object.values(this._rooms)) {
        this._pglow[R.id] = lerp(this._pglow[R.id] || 0, (R.id === v.r && k >= 1 ? fade : 0), .06);
        const a = this._pglow[R.id]; if (a > .02) { ctx.strokeStyle = `rgba(34,211,238,${(.55 * a).toFixed(3)})`; ctx.lineWidth = 2; ctx.stroke(R.path); }
      }
    }
    _ldPos(r, x, y) {
      // stessa formula di casa-radar: x laterale (flip = positivo a sinistra), y in avanti, in millimetri
      // ppm_side: scala del lato (X) diversa da quella in avanti (Y), per piantine non in scala
      const A = r.angle * RAD, fx = Math.cos(A), fy = Math.sin(A), sg = r.flip ? -1 : 1, k = r.ppm / 1000, ks = (r.ppm_side ?? r.ppm) / 1000;
      return [r.at[0] + (y * k * fx + sg * x * ks * -fy), r.at[1] + (y * k * fy + sg * x * ks * fx)];
    }
    _drawRadars(st) {
      const ctx = this._ctx, rt = this._rt, px = v => this._px(v), COLS = [[255, 180, 84], [94, 225, 255], [183, 140, 255]];
      this._radars.forEach((r, i) => {
        const s = st.radars[i], R = this._rooms[r.room], at = r.at, col = s.on ? [34, 211, 238] : [139, 124, 248];
        ctx.save(); if (R) ctx.clip(R.path);
        if (r.type === 'ld2450') {
          const A = r.angle * RAD, half = r.fov / 2 * RAD, len = r.range * r.ppm / 1000;
          const g = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], len); g.addColorStop(0, rgba(col, s.on ? .2 : .1)); g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.arc(at[0], at[1], len, A - half, A + half); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgba(col, .2); ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
          for (let m = 1; m * 1000 <= r.range; m++) { ctx.beginPath(); ctx.arc(at[0], at[1], m * r.ppm, A - half, A + half); ctx.stroke(); }
          ctx.setLineDash([]);
          // zone disegnate nel radar: tratteggio, piene quando c'è qualcuno dentro
          (s.z || []).forEach(z => {
            const busy = z.n > 0; ctx.beginPath(); z.pts.forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
            ctx.fillStyle = busy ? `rgba(255,180,84,${(.30 + .10 * Math.sin(rt * 3)).toFixed(3)})` : 'rgba(255,180,84,.12)'; ctx.fill();
            ctx.strokeStyle = busy ? 'rgba(255,190,100,1)' : 'rgba(255,180,84,.8)'; ctx.lineWidth = busy ? px(2.4) : px(1.6); ctx.setLineDash(busy ? [] : [px(6), px(4)]); ctx.stroke(); ctx.setLineDash([]);
            const cx = z.pts.reduce((a, p) => a + p[0], 0) / 4, cy = z.pts.reduce((a, p) => a + p[1], 0) / 4;
            ctx.fillStyle = busy ? 'rgba(255,214,150,1)' : 'rgba(255,214,150,.7)'; ctx.font = `600 ${Math.round(px(10))}px Sora, Manrope, sans-serif`; ctx.textAlign = 'center';
            ctx.fillText((r.zone_names && r.zone_names[z.i - 1]) || 'Zona ' + z.i, cx, cy + px(4));
          });
          const sw = A + Math.sin(rt * .9) * half, ex = at[0] + Math.cos(sw) * len, ey = at[1] + Math.sin(sw) * len;
          const lg = ctx.createLinearGradient(at[0], at[1], ex, ey); lg.addColorStop(0, rgba(col, .7)); lg.addColorStop(1, rgba(col, 0));
          ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(ex, ey); ctx.stroke();
        } else {
          const maxR = (r.max_cm ?? 600) / 100 * r.ppm;
          for (let k = 0; k < 3; k++) { const rr = (rt * 22 + k * maxR / 3) % maxR; ctx.strokeStyle = rgba(col, .3 * (1 - rr / maxR)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(at[0], at[1], rr, 0, 7); ctx.stroke(); }
          if (s.mv && isFinite(s.md)) { ctx.strokeStyle = `rgba(255,192,105,${(.65 + .3 * Math.sin(rt * 6)).toFixed(3)})`; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(at[0], at[1], s.md / 100 * r.ppm, 0, 7); ctx.stroke(); }
          if (s.st && isFinite(s.sd)) { ctx.strokeStyle = 'rgba(94,225,255,.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(at[0], at[1], s.sd / 100 * r.ppm, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
        }
        ctx.restore();
        // persone viste dal radar (posizione reale), con scia dal vivo
        if (s.t) s.t.forEach((p, k) => {
          const tr = r.trail[k];
          if (!p) { r.sm[k] = null; tr.length = 0; return; }
          r.sm[k] = r.sm[k] ? [lerp(r.sm[k][0], p[0], this._scrub ? 1 : .18), lerp(r.sm[k][1], p[1], this._scrub ? 1 : .18)] : p.slice();
          const q = r.sm[k];
          if (this._live && (!tr.length || dist(tr[tr.length - 1], q) > 2)) { tr.push(q.slice()); if (tr.length > 40) tr.shift(); }
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          for (let j = 1; j < tr.length; j++) { ctx.strokeStyle = rgba(COLS[k], .5 * j / tr.length); ctx.lineWidth = 1 + 3 * j / tr.length; ctx.beginPath(); ctx.moveTo(tr[j - 1][0], tr[j - 1][1]); ctx.lineTo(tr[j][0], tr[j][1]); ctx.stroke(); }
          const pulse = (rt * 1.1 + k * .3) % 1;
          ctx.strokeStyle = rgba(COLS[k], .7 * (1 - pulse)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], px(9) + pulse * px(16), 0, 7); ctx.stroke();
          const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], px(16)); g.addColorStop(0, rgba(COLS[k], .95)); g.addColorStop(.45, rgba(COLS[k], .5)); g.addColorStop(1, rgba(COLS[k], 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], px(16), 0, 7); ctx.fill();
          ctx.restore();
        });
        // icona del radar, sempre accesa
        const blink = s.on ? .75 + .25 * Math.sin(rt * 5) : .55 + .15 * Math.sin(rt * 1.5);
        ctx.fillStyle = 'rgba(6,9,18,.85)'; ctx.strokeStyle = rgba(col, blink); ctx.lineWidth = px(1.6);
        ctx.beginPath(); ctx.arc(at[0], at[1], px(11), 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = rgba(col, .95); ctx.lineWidth = px(1.4); const dir = (r.angle ?? 0) * RAD;
        const sp = r.type === 'ld2450' ? .8 : Math.PI; for (const rr of [4, 7.5]) { ctx.beginPath(); ctx.arc(at[0], at[1], px(rr), dir - sp, dir + sp); ctx.stroke(); }
        ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(at[0], at[1], px(1.8), 0, 7); ctx.fill();
      });
    }
    // ───────── Short verticale: le ultime 24 ore in pochi secondi ─────────
    async _recordShort(opts = {}) {
      if (this._rec) return;
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { alert('Questo browser non può registrare video dalla scheda.'); return; }
      const c = this._config.short || {}, W = 1080, H = 1920, secs = c.seconds || 24;
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const map = document.createElement('canvas'), mask = document.createElement('canvas'), bg = document.createElement('canvas'); bg.width = 90; bg.height = 160;
      const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 14e6 });
      const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise(res => { rec.onstop = res; });
      this._rec = { out, octx: out.getContext('2d'), map, mask, bg, cv: this._el.cv, ctx: this._ctx, rec, type, title: c.title || '24 ore di casa mia', subtitle: c.subtitle || 'Home Assistant · macchina del tempo', brand: c.brand ?? 'Aurora Casa Viva · domotikpro.it', speed: this._speed };
      this._sel = null; this._el.pop.hidden = true;
      this._el.cv = map; this._ctx = map.getContext('2d'); this._fs = 2.5;
      this._bounds(true, .09); this._layout(map, W, 1120, 1);
      mask.width = W; mask.height = 1120;
      for (const r of this._radars) r.trail.forEach(t => { t.length = 0; });
      this._live = false; this._speed = DAY / 1000 / secs; this._T = this._t0(); this._playing = true; this._syncBtns();
      const btn = this.shadowRoot.querySelector('.short'); btn.classList.add('rec'); btn.textContent = 'Registro…';
      this._rec.T0 = this._T; this._rec.real0 = performance.now();
      rec.start(500);
      await done;
      const blob = new Blob(chunks, { type: type || 'video/webm' });
      const R = this._rec; this._el.cv = R.cv; this._ctx = R.ctx; this._fs = 1; this._speed = R.speed; this._rec = null;
      btn.classList.remove('rec'); btn.textContent = 'Short';
      this._resize(); this._goLive();
      this._lastShort = blob;
      const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aurora-casa-viva-short-${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      if (opts.download !== false && this._config.short?.download !== false) { document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    }
    _recCaption(st) {
      const rooms = [...new Set(st.beams.filter(b => b.inten > .06).map(b => this._rooms[b.o.room]?.name).filter(Boolean))];
      const lit = Object.values(this._rooms).filter(r => st.lights[r.id]).map(r => r.name);
      const join = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0];
      if (st.w.rain > .2) return 'Fuori piove, la pioggia si ferma sui muri';
      if (rooms.length) return 'Il sole entra da ' + join(rooms.slice(0, 3));
      if (st.sun.el > 0) return 'Giornata ' + (COND_IT[st.w.cond] || '').toLowerCase();
      if (lit.length) return 'Luci accese: ' + join(lit.slice(0, 3));
      return st.sun.el > -6 ? (st.sun.az < 180 ? 'Sta per sorgere il sole' : 'Il sole è appena tramontato') : 'Notte';
    }
    _recFrame(st) {
      const R = this._rec, o = R.octx, W = 1080, H = 1920, MY = 230, MH = 1120;
      // sfondo: la mappa sfocata, così i bordi si fondono
      const b = R.bg.getContext('2d'); b.filter = 'blur(5px)'; b.drawImage(R.map, -15, -10, 120, 180); b.filter = 'none';
      o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high'; o.drawImage(R.bg, -60, -60, W + 120, H + 120);
      o.fillStyle = 'rgba(5,8,15,.62)'; o.fillRect(0, 0, W, H);
      const m = R.mask.getContext('2d'); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, W, MH); m.drawImage(R.map, 0, 0);
      const g = m.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.07, '#000'); g.addColorStop(.93, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.globalCompositeOperation = 'destination-in'; m.fillStyle = g; m.fillRect(0, 0, W, MH);
      o.drawImage(R.mask, 0, MY);
      o.textAlign = 'center'; o.textBaseline = 'alphabetic';
      o.fillStyle = '#E8ECF8'; o.font = '700 64px Sora, Manrope, sans-serif'; o.fillText(R.title, W / 2, 165);
      o.fillStyle = '#A3AECB'; o.font = '500 34px Manrope, sans-serif'; o.fillText(R.subtitle, W / 2, 218);
      o.fillStyle = '#FFFFFF'; o.font = '600 140px Sora, Manrope, sans-serif'; o.fillText(hhmm(st.T), W / 2, 1490);
      o.fillStyle = st.sun.el > 0 ? '#FFD9A0' : '#C9D1E8'; o.font = '600 40px Manrope, sans-serif'; o.fillText(this._recCaption(st), W / 2, 1555);
      // barra del giorno con l'avanzamento
      const bx = 110, bw = W - 220, by = 1595, bh = 22, k = clamp((st.T - this._t0()) / DAY, 0, 1);
      o.save(); o.beginPath(); o.roundRect(bx, by, bw, bh, 11); o.clip();
      if (this._el.tl.width) o.drawImage(this._el.tl, bx, by, bw, bh); else { o.fillStyle = '#1b2440'; o.fillRect(bx, by, bw, bh); }
      o.fillStyle = 'rgba(5,8,15,.55)'; o.fillRect(bx + bw * k, by, bw * (1 - k), bh); o.restore();
      o.fillStyle = '#fff'; o.shadowColor = '#22D3EE'; o.shadowBlur = 18; o.beginPath(); o.arc(bx + bw * k, by + bh / 2, 15, 0, 7); o.fill(); o.shadowBlur = 0;
      if (R.brand) { o.fillStyle = '#A3AECB'; o.font = '600 30px Manrope, sans-serif'; o.fillText(R.brand, W / 2, 1675); }
    }
    // ───────── mappa di calore: dove si è passato il tempo nelle ultime 24 ore ─────────
    _tlAt(e, T) {
      const tl = this._tl[e]; if (!tl || !tl.t.length) return undefined;
      if (T < tl.t[0]) return tl.s[0];
      let lo = 0, hi = tl.t.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl.t[m] <= T) lo = m; else hi = m - 1; }
      return tl.s[lo];
    }
    _buildHeat() {
      const dep = [], t0 = this._t0(), now = Date.now(), CHUNK = 5 * MIN;
      const add = (t, dur, x, y, sig, room) => { for (let s = 0; s < dur; s += CHUNK) dep.push({ t: t + s, w: Math.min(CHUNK, dur - s) / MIN, x, y, sig, room }); };
      const radarRooms = new Set(this._radars.filter(r => r.type === 'ld2450').map(r => r.room));
      // stanze senza radar di posizione: finché i sensori della stanza vedono qualcuno (+1 minuto), mai oltre il movimento successivo
      const P = this._pres || [];
      const seenUntil = (room, t) => {
        let end = t;
        for (const e of this._rooms[room].motion) {
          const tl = this._tl[e]; if (!tl || !tl.t.length) continue;
          let lo = 0, hi = tl.t.length - 1; if (t < tl.t[0]) continue;
          while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl.t[m] <= t) lo = m; else hi = m - 1; }
          if (tl.s[lo] !== 'on') continue;
          let j = lo + 1; while (j < tl.t.length && tl.s[j] === 'on') j++;
          end = Math.max(end, j < tl.t.length ? tl.t[j] : now);
        }
        return end;
      };
      for (let i = 0; i < P.length; i++) {
        const p = P[i], R = this._rooms[p.r]; if (!R || R.outdoor || radarRooms.has(p.r)) continue;
        const next = i + 1 < P.length ? P[i + 1].t : now, end = Math.min(next, seenUntil(p.r, p.t) + MIN), s = Math.max(p.t, t0), dur = Math.min(end - s, 45 * MIN);
        if (dur > 0) add(s, dur, R.node[0], R.node[1], Math.min(R.bb[2] - R.bb[0], R.bb[3] - R.bb[1]) * .36, p.r);
      }
      // stanze con radar LD2450: le posizioni vere delle persone
      for (const r of this._radars) {
        if (r.type !== 'ld2450') continue;
        for (let k = 1; k <= 3; k++) {
          const ex = `${r.prefix}_target_${k}_x`, ey = `${r.prefix}_target_${k}_y`, a = this._tl[ex], b = this._tl[ey];
          if (!a) continue;
          const ts = [...new Set([...a.t, ...(b ? b.t : [])])].sort((m, n) => m - n);
          for (let i = 0; i < ts.length; i++) {
            const end = i + 1 < ts.length ? ts[i + 1] : now; if (end <= t0) continue;
            const t = Math.max(ts[i], t0), x = parseFloat(this._tlAt(ex, ts[i])), y = parseFloat(this._tlAt(ey, ts[i]));
            if (!isFinite(x) || !isFinite(y) || (x === 0 && y === 0) || Math.hypot(x, y) > r.range) continue;
            if (r.presence && this._tlAt(r.presence, ts[i]) === 'off') continue;
            const dur = Math.min(end - t, 30 * MIN); if (dur <= 0) continue;
            const p = this._ldPos(r, x, y); add(t, dur, p[0], p[1], 15, r.room);
          }
        }
      }
      dep.sort((m, n) => m.t - n.t);
      const [x0, y0, x1, y1] = this._plan, cs = 4;
      this._heat = { dep, ptr: 0, upTo: -Infinity, cs, gw: Math.ceil((x1 - x0) / cs) + 1, gh: Math.ceil((y1 - y0) / cs) + 1, grid: null, mins: {}, dirty: true, built: Date.now() };
    }
    _heatAdvance(T) {
      const H = this._heat;
      if (!H.grid || T < H.upTo) { H.grid = new Float32Array(H.gw * H.gh); H.ptr = 0; H.mins = {}; H.dirty = true; }
      const x0 = this._plan[0], y0 = this._plan[1], cs = H.cs;
      while (H.ptr < H.dep.length && H.dep[H.ptr].t <= T) {
        const d = H.dep[H.ptr++], cx = (d.x - x0) / cs, cy = (d.y - y0) / cs, s = d.sig / cs, r = Math.ceil(s * 2.5), inv = 1 / (2 * s * s);
        for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(H.gh - 1, Math.ceil(cy + r)); j++)
          for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(H.gw - 1, Math.ceil(cx + r)); i++) { const dx = i - cx, dy = j - cy; H.grid[j * H.gw + i] += d.w * Math.exp(-(dx * dx + dy * dy) * inv); }
        H.mins[d.room] = (H.mins[d.room] || 0) + d.w; H.dirty = true;
      }
      H.upTo = T;
    }
    _heatImage() {
      const H = this._heat;
      if (!H.lut) {
        const stops = [[0, [20, 16, 60, 0]], [.12, [70, 50, 170, .32]], [.32, [124, 108, 245, .5]], [.52, [34, 211, 238, .6]], [.74, [255, 196, 105, .72]], [1, [255, 92, 110, .85]]];
        H.lut = new Uint8ClampedArray(256 * 4);
        for (let i = 0; i < 256; i++) {
          const v = i / 255; let k = 1; while (k < stops.length - 1 && stops[k][0] < v) k++;
          const [va, a] = stops[k - 1], [vb, b] = stops[k], f = clamp((v - va) / (vb - va), 0, 1);
          for (let c = 0; c < 3; c++) H.lut[i * 4 + c] = lerp(a[c], b[c], f); H.lut[i * 4 + 3] = lerp(a[3], b[3], f) * 255;
        }
        H.img = document.createElement('canvas'); H.img.width = H.gw; H.img.height = H.gh;
      }
      let mx = 0; for (const v of H.grid) if (v > mx) mx = v;
      const g = H.img.getContext('2d'), im = g.createImageData(H.gw, H.gh);
      for (let k = 0; k < H.grid.length; k++) { const li = (mx ? Math.min(255, Math.sqrt(H.grid[k] / mx) * 255) | 0 : 0) * 4; im.data[k * 4] = H.lut[li]; im.data[k * 4 + 1] = H.lut[li + 1]; im.data[k * 4 + 2] = H.lut[li + 2]; im.data[k * 4 + 3] = H.lut[li + 3]; }
      g.putImageData(im, 0, 0);
      // punti caldi: i 3 massimi locali più forti, distanti tra loro
      const hot = [], used = new Uint8Array(H.grid.length), order = [...H.grid.keys()].filter(k => H.grid[k] > mx * .35).sort((m, n) => H.grid[n] - H.grid[m]);
      for (const k of order) {
        if (used[k]) continue; const i = k % H.gw, j = (k / H.gw) | 0;
        hot.push({ x: this._plan[0] + i * H.cs, y: this._plan[1] + j * H.cs, v: H.grid[k] / mx });
        for (let jj = Math.max(0, j - 18); jj <= Math.min(H.gh - 1, j + 18); jj++) for (let ii = Math.max(0, i - 18); ii <= Math.min(H.gw - 1, i + 18); ii++) used[jj * H.gw + ii] = 1;
        if (hot.length >= 3) break;
      }
      H.hot = hot; H.dirty = false; H.imgAt = this._rt;
    }
    _drawHeat(st) {
      if (!this._heat || Date.now() - this._heat.built > 10 * MIN && this._live) this._buildHeat();
      const H = this._heat, ctx = this._ctx, rt = this._rt;
      this._heatAdvance(st.T);
      if (H.dirty && (rt - (H.imgAt || -1) > .2 || !H.hot)) this._heatImage();
      ctx.save(); ctx.clip(this._house);
      ctx.fillStyle = 'rgba(3,5,12,.42)'; ctx.fill(this._house);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = .9 + .1 * Math.sin(rt * 1.4);
      ctx.drawImage(H.img, this._plan[0] - H.cs / 2, this._plan[1] - H.cs / 2, H.gw * H.cs, H.gh * H.cs);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      (H.hot || []).forEach((h, i) => {
        const ph = (rt * .55 + i * .33) % 1, col = h.v > .8 ? [255, 120, 120] : [255, 200, 120];
        for (const q of [ph, (ph + .5) % 1]) { ctx.strokeStyle = rgba(col, .55 * (1 - q) * h.v); ctx.lineWidth = this._px(2); ctx.beginPath(); ctx.arc(h.x, h.y, this._px(6) + q * this._px(34), 0, 7); ctx.stroke(); }
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, this._px(14)); g.addColorStop(0, rgba([255, 240, 220], .9)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, this._px(14), 0, 7); ctx.fill();
      });
      ctx.restore();
    }
    _heatTop(n = 3) {
      const m = this._heat?.mins || {};
      return Object.entries(m).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([r, v]) => `${this._rooms[r]?.name || r} ${fmtDur(v)}`);
    }
    // ───────── raccolta differenziata: i bidoni da portare fuori stasera ─────────
    _wasteList(T) {
      const w = this._config.waste; if (!w) return [];
      let raw;
      if (this._live) { const s = this._hass?.states[w.entity]; raw = s ? (w.attribute ? s.attributes[w.attribute] : s.state) : null; }
      else raw = this._at(w.entity, T);
      const list = (Array.isArray(raw) ? raw : String(raw || '').split(/[,;]+/)).map(x => String(x).trim().toLowerCase()).filter(x => x && !/nessun|unknown|unavailable|none/.test(x));
      const d = new Date(T), mins = d.getHours() * 60 + d.getMinutes();
      let from = 20 * 60;
      const fs = w.from && this._hass?.states[w.from];
      if (fs) { const [hh, mm] = String(fs.state).split(':').map(Number); if (isFinite(hh)) from = hh * 60 + (mm || 0); }
      else if (w.from_time) { const [hh, mm] = w.from_time.split(':').map(Number); from = hh * 60 + (mm || 0); }
      from -= w.lead_min ?? 120;
      return mins >= from ? list : [];
    }
    _drawWaste(st) {
      const w = this._config.waste; if (!w) return;
      if (this._CW < 560 && !this._rec) return;   // su schermo stretto i bidoni stanno nella riga sotto la mappa
      const list = st.waste, ctx = this._ctx, rt = this._rt, px = v => this._px(v);
      this._wasteA = lerp(this._wasteA || 0, list.length ? 1 : 0, this._scrub ? .5 : .04);
      if (this._wasteA < .01) return;
      if (list.length) this._wasteLast = list;
      const L = this._wasteLast || [], a = this._wasteA;
      const door = this._door ? [this._door.hinge[0] + this._door.len / 2, this._door.hinge[1]] : (w.at || [0, 0]);
      const cx = w.at ? w.at[0] : door[0], cy = w.at ? w.at[1] : door[1] - px(50), bw = px(17), bh = px(21);
      ctx.font = this._font(12, 700);
      const gap = Math.max(bw * 1.8, ...L.map(k => ctx.measureText(k.toUpperCase()).width + px(12)));
      // i bidoni restano sempre dentro l'area visibile
      const half = gap * (L.length - 1) / 2 + gap / 2;
      const cxs = clamp(cx, this._W0 + half + px(4), this._W0 + this._WW - half - px(4)), cys = clamp(cy, this._H0 + bh + px(24), this._H0 + this._WH - bh);
      L.forEach((k, i) => {
        const col = (w.colors && w.colors[k]) || WASTE_COL[k] || [200, 205, 220];
        const tx = cxs + (i - (L.length - 1) / 2) * gap, x = lerp(door[0], tx, a), y = lerp(door[1], cys, a) + Math.sin(rt * 2 + i) * px(1.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, bw * 2); g.addColorStop(0, rgba(col, .45 * a * (.75 + .25 * Math.sin(rt * 3 + i)))); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, bw * 2, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(col, .95 * a); ctx.beginPath(); ctx.roundRect(x - bw / 2, y - bh / 2 + px(2), bw, bh, px(3)); ctx.fill();
        ctx.fillStyle = rgba(mixc(col, [0, 0, 0], .35), a); ctx.beginPath(); ctx.roundRect(x - bw / 2 - px(2), y - bh / 2 - px(3), bw + px(4), px(5), px(2)); ctx.fill();
        ctx.strokeStyle = rgba([5, 8, 15], .35 * a); ctx.lineWidth = px(1.2); for (const dx of [-.25, 0, .25]) { ctx.beginPath(); ctx.moveTo(x + dx * bw, y - bh * .2); ctx.lineTo(x + dx * bw, y + bh * .4); ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(5,8,15,.85)'; ctx.lineWidth = px(3); ctx.strokeText(k.toUpperCase(), x, y - bh / 2 - px(6));
        ctx.fillStyle = rgba(mixc(col, [255, 255, 255], .35), a); ctx.fillText(k.toUpperCase(), x, y - bh / 2 - px(6));
      });
    }
    // ───────── spioncino / campanello ─────────
    _bellEventsBuild() {
      const b = this._config.doorbell; this._bellEv = []; if (!b?.image) return;
      const tl = this._tl[b.image]; if (!tl) return;
      for (let i = 1; i < tl.t.length; i++) {
        if (/unavail|unknown/.test(tl.s[i])) continue;
        const type = b.event_type ? String(this._tlAt(b.event_type, tl.t[i] + 5000) || '') : '';
        this._bellEv.push({ t: tl.t[i], ring: /ring|campanel|call|chiamat|doorbell|press/i.test(type), type });
      }
    }
    _bellAt(T) {
      const b = this._config.doorbell; if (!b) return null;
      if (this._live) {
        const s = this._hass?.states[b.image]; if (!s || /unavail|unknown/.test(s.state)) return null;
        const t = Date.parse(s.state) || Date.parse(s.last_changed), age = T - t;
        if (!(age >= 0 && age < (b.show_seconds ?? 90) * 1000)) return null;
        const type = b.event_type ? String(this._hass.states[b.event_type]?.state || '') : '';
        return { t, ring: /ring|campanel|call|chiamat|doorbell|press/i.test(type), type, pic: s.attributes.entity_picture };
      }
      const win = Math.max(90000, this._speed * 3000);
      let e = null; for (const x of this._bellEv || []) { if (x.t <= T && T - x.t < win) e = x; if (x.t > T) break; }
      return e;
    }
    _drawBell(st) {
      const b = this._config.doorbell; if (!b) return;
      const e = st.bell, ctx = this._ctx, rt = this._rt;
      this._bellA = lerp(this._bellA || 0, e ? 1 : 0, .06); if (this._bellA < .01) return;
      const at = b.at || (this._door ? [this._door.hinge[0] + this._door.len / 2, this._door.hinge[1]] : [0, 0]), col = e && e.ring ? [255, 214, 120] : [185, 166, 255], a = this._bellA;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) { const q = (rt * .7 + k / 4) % 1, r = 10 + q * 170; ctx.strokeStyle = rgba(col, .6 * (1 - q) * a); ctx.lineWidth = 3 * (1 - q) + 1; ctx.beginPath(); ctx.arc(at[0], at[1], r, 0, 7); ctx.stroke(); }
      const g = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], 40); g.addColorStop(0, rgba(col, .8 * a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(at[0], at[1], 40, 0, 7); ctx.fill();
      ctx.restore();
      // campanella
      const sw = Math.sin(rt * 14) * (e && e.ring ? .35 : .12) * a, px = v => this._px(v);
      ctx.save(); ctx.translate(at[0], at[1] - px(2)); ctx.rotate(sw); ctx.fillStyle = rgba([255, 250, 235], a);
      ctx.beginPath(); ctx.moveTo(-px(7), px(5)); ctx.quadraticCurveTo(-px(7), -px(8), 0, -px(8)); ctx.quadraticCurveTo(px(7), -px(8), px(7), px(5)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, px(7), px(2.2), 0, 7); ctx.fill(); ctx.restore();
    }
    _updateBell(st) {
      const E = this._el, b = this._config.doorbell; if (!b || !E.bell) return;
      const e = st.bell;
      if (!e || this._rec) { E.bell.hidden = true; return; }
      const cap = (e.ring ? 'Hanno suonato' : 'Qualcuno alla porta') + ' · ' + hhmm(e.t);
      if (E.bellCap.textContent !== cap) E.bellCap.textContent = cap;
      if (this._live && e.pic) { if (E.bellImg.dataset.src !== e.pic) { E.bellImg.dataset.src = e.pic; E.bellImg.src = e.pic; } E.bellImg.hidden = false; } else E.bellImg.hidden = true;
      const at = b.at || [this._door.hinge[0] + this._door.len / 2, this._door.hinge[1]];
      const x = this._OX + at[0] * this._S, y = this._OY + at[1] * this._S, w = Math.min(230, this._CW - 24);
      E.bell.style.left = clamp(x - w / 2, 12, this._CW - w - 12) + 'px'; E.bell.style.top = clamp(y + 24, 12, this._CH - 60) + 'px'; E.bell.style.width = w + 'px';
      E.bell.hidden = false;
    }
    // ───────── mappa dei consumi: dove si spende energia, con il costo ─────────
    _energyPrep() {
      const mk = e => { const tl = this._tl[e]; if (!tl || !tl.t.length) return null; const t = [], w = [], cum = [0]; for (let i = 0; i < tl.t.length; i++) { const v = parseFloat(tl.s[i]); t.push(tl.t[i]); w.push(isFinite(v) ? Math.max(0, v) : 0); if (i) cum.push(cum[i - 1] + w[i - 1] * (t[i] - t[i - 1]) / 3600000); } return { t, w, cum }; };
      this._en = { dev: this._devices.map(d => mk(d.entity)), tot: this._config.power_total ? mk(this._config.power_total) : null, at: Date.now() };
    }
    _whAt(s, T) {
      if (!s) return 0; if (T <= s.t[0]) return 0;
      let lo = 0, hi = s.t.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s.t[m] <= T) lo = m; else hi = m - 1; }
      return s.cum[lo] + s.w[lo] * (T - s.t[lo]) / 3600000;
    }
    _energyAt(T) {
      if (!this._en || (this._live && Date.now() - this._en.at > 5 * MIN)) this._energyPrep();
      const t0 = this._t0(), rooms = {}, devWh = this._en.dev.map(s => Math.max(0, this._whAt(s, T) - this._whAt(s, t0)));
      this._devices.forEach((d, i) => { rooms[d.room] = (rooms[d.room] || 0) + devWh[i]; });
      const tot = this._en.tot ? Math.max(0, this._whAt(this._en.tot, T) - this._whAt(this._en.tot, t0)) : devWh.reduce((a, b) => a + b, 0);
      return { rooms, devWh, tot, dev: devWh.reduce((a, b) => a + b, 0) };
    }
    _drawEnergyMap(st) {
      const ctx = this._ctx, rt = this._rt, E = st.energy, mx = Math.max(1, ...Object.values(E.rooms));
      ctx.save(); ctx.clip(this._house); ctx.fillStyle = 'rgba(3,5,12,.45)'; ctx.fill(this._house); ctx.restore();
      for (const [r, wh] of Object.entries(E.rooms)) {
        const R = this._rooms[r]; if (!R || wh < 1) continue;
        const k = Math.sqrt(wh / mx), col = k < .5 ? mixc([34, 211, 238], [255, 196, 105], k * 2) : mixc([255, 196, 105], [255, 92, 110], (k - .5) * 2);
        const n = R.node, g = ctx.createRadialGradient(n[0], n[1], 0, n[0], n[1], Math.hypot(R.bb[2] - R.bb[0], R.bb[3] - R.bb[1]) * .6);
        const br = .75 + .25 * Math.sin(rt * 1.6 + n[0]);
        g.addColorStop(0, rgba(col, (.25 + .4 * k) * br)); g.addColorStop(1, rgba(col, (.08 + .15 * k) * br));
        ctx.fillStyle = g; ctx.fill(R.path); ctx.strokeStyle = rgba(col, .6 * k + .2); ctx.lineWidth = 2; ctx.stroke(R.path);
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      this._devices.forEach((d, i) => {
        const wh = E.devWh[i]; if (wh < 5) return;
        const r = 6 + Math.sqrt(wh) * .9, q = (rt * .6 + i * .17) % 1;
        const g = ctx.createRadialGradient(d.at[0], d.at[1], 0, d.at[0], d.at[1], r); g.addColorStop(0, 'rgba(255,220,150,.85)'); g.addColorStop(1, 'rgba(255,128,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.at[0], d.at[1], r, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,190,120,${(.5 * (1 - q)).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.at[0], d.at[1], r * (.6 + q * .8), 0, 7); ctx.stroke();
      });
      ctx.restore();
    }
    // ───────── tocco e pressione lunga ─────────
    _hit(ev) {
      const r = this._el.cv.getBoundingClientRect(), x = (ev.clientX - r.left - this._OX) / this._S, y = (ev.clientY - r.top - this._OY) / this._S;
      const ctx = this._ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      let hit = null; for (const R of Object.values(this._rooms)) if (ctx.isPointInPath(R.path, x, y)) hit = R.id;
      ctx.restore(); return { hit, x, y };
    }
    _pointer(ev, kind) {
      if (kind === 'down') {
        this._pd = { clientX: ev.clientX, clientY: ev.clientY, t: performance.now(), long: false };
        clearTimeout(this._pdT); this._pdT = setTimeout(() => { if (this._pd) { this._pd.long = true; this._openPop(this._hit(this._pd).hit); } }, 500);
        return;
      }
      clearTimeout(this._pdT); const pd = this._pd; this._pd = null;
      if (kind !== 'up' || !pd || pd.long || Math.hypot(ev.clientX - pd.clientX, ev.clientY - pd.clientY) > 10) return;
      const { hit, x, y } = this._hit(ev); if (!hit) { this._openPop(null); return; }
      const R = this._rooms[hit];
      if ((this._config.tap_action || 'toggle') === 'toggle' && R.lights.length && this._hass) {
        const on = R.lights.some(e => this._hass.states[e]?.state === 'on');
        this._hass.callService('homeassistant', on ? 'turn_off' : 'turn_on', { entity_id: R.lights });
        (this._taps = this._taps || []).push({ x, y, t: this._rt, on: !on });
        if (navigator.vibrate) navigator.vibrate(12);
      } else this._openPop(hit);
    }
    _openPop(id) { this._sel = id === this._sel ? null : id; this._el.pop.hidden = !this._sel; this._hudT = 0; }
    _drawTaps() {
      const ctx = this._ctx; this._taps = (this._taps || []).filter(t => this._rt - t.t < .9);
      for (const t of this._taps) { const q = (this._rt - t.t) / .9, col = t.on ? [255, 200, 120] : [160, 175, 210]; ctx.strokeStyle = rgba(col, .8 * (1 - q)); ctx.lineWidth = 2.5 * (1 - q) + .5; ctx.beginPath(); ctx.arc(t.x, t.y, 8 + q * 60, 0, 7); ctx.stroke(); }
    }
    _drawOpenings(st) {
      const ctx = this._ctx, armed = !!st.alarm && this._lay('security'), blink = .5 + .5 * Math.sin(this._rt * 4), S = this._S, DPR = this._DPR;
      for (const o of this._openings) {
        const isOpen = st.open[o.entity], half = [(o.b[0] - o.a[0]) / 2, (o.b[1] - o.a[1]) / 2], nrm = [-o.n[0], -o.n[1]];
        ctx.lineCap = 'butt'; ctx.strokeStyle = '#0A0E17'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(o.a[0], o.a[1]); ctx.lineTo(o.b[0], o.b[1]); ctx.stroke();
        if (!isOpen) {
          ctx.strokeStyle = '#C9D3F0'; ctx.lineWidth = 1.3;
          for (const s of [-2.2, 2.2]) { ctx.beginPath(); ctx.moveTo(o.a[0] + o.n[0] * s, o.a[1] + o.n[1] * s); ctx.lineTo(o.b[0] + o.n[0] * s, o.b[1] + o.n[1] * s); ctx.stroke(); }
        } else {
          const L = Math.hypot(half[0], half[1]) * 2, dir = [half[0] / (L / 2), half[1] / (L / 2)], ang = 1.05;
          const leaf = [o.a[0] + (dir[0] * Math.cos(ang) + nrm[0] * Math.sin(ang)) * L, o.a[1] + (dir[1] * Math.cos(ang) + nrm[1] * Math.sin(ang)) * L];
          ctx.strokeStyle = '#FFC069'; ctx.lineWidth = 2.5; ctx.shadowColor = '#FFC069'; ctx.shadowBlur = 10 * S * DPR; ctx.beginPath(); ctx.moveTo(o.a[0], o.a[1]); ctx.lineTo(leaf[0], leaf[1]); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.font = this._font(12, 700); ctx.textBaseline = 'middle';
          const lp = [o.a[0] + half[0] - o.n[0] * this._px(8), o.a[1] + half[1] - o.n[1] * this._px(14) + (o.n[0] ? Math.abs(half[1]) + this._px(12) : 0)];
          ctx.textAlign = o.n[0] < 0 ? 'left' : o.n[0] > 0 ? 'right' : 'center';
          ctx.strokeStyle = 'rgba(5,8,15,.85)'; ctx.lineWidth = this._px(3); ctx.lineJoin = 'round'; ctx.strokeText('APERTO', lp[0], lp[1]);
          ctx.fillStyle = '#FFC069'; ctx.fillText('APERTO', lp[0], lp[1]);
        }
        if (armed) { ctx.fillStyle = `rgba(255,122,133,${(.4 + .6 * blink).toFixed(3)})`; ctx.beginPath(); ctx.arc(o.a[0] + half[0] + nrm[0] * 9, o.a[1] + half[1] + nrm[1] * 9, 3.2, 0, 7); ctx.fill(); }
      }
      const D = this._door; if (!D) return;
      const max = D.ang * RAD; this._doorA = lerp(this._doorA, st.doorOpen ? max : 0, this._scrub ? .4 : .08);
      const h = D.hinge, base = (D.closed_angle || 0) * RAD, sgn = D.swing === 'ccw' ? -1 : 1;
      const e = [h[0] + Math.cos(base + sgn * this._doorA) * D.len, h[1] + Math.sin(base + sgn * this._doorA) * D.len], ec = [h[0] + Math.cos(base) * D.len, h[1] + Math.sin(base) * D.len];
      ctx.strokeStyle = '#0A0E17'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(ec[0], ec[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(34,211,238,.35)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(h[0], h[1], D.len, Math.min(base, base + sgn * max), Math.max(base, base + sgn * max)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 2.6; ctx.shadowColor = '#22D3EE'; ctx.shadowBlur = (this._doorA > .1 ? 14 : 4) * S * DPR; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.font = this._font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const txt = this._doorA > .3 ? 'PORTA APERTA' : (D.label || 'ENTRATA'), tw2 = ctx.measureText(txt).width / 2 + this._px(4);
      const lx = clamp((h[0] + ec[0]) / 2, this._W0 + tw2, this._W0 + this._WW - tw2), ly = Math.min(h[1], ec[1]) - this._px(8);
      ctx.strokeStyle = 'rgba(5,8,15,.85)'; ctx.lineWidth = this._px(3); ctx.strokeText(txt, lx, ly); ctx.fillStyle = '#22D3EE'; ctx.fillText(txt, lx, ly);
      if (armed) { ctx.fillStyle = `rgba(255,122,133,${(.4 + .6 * blink).toFixed(3)})`; ctx.beginPath(); ctx.arc(lx, h[1] + 9, 3.2, 0, 7); ctx.fill(); }
    }
    _drawClouds(st) {
      const ctx = this._ctx; if (st.sun.el <= 0 || st.w.cloud < .05) return;
      const day = sstep(0, 8, st.sun.el);
      for (const cl of this._clouds) {
        const a = clamp(st.w.cloud * 1.5 - cl.k, 0, 1); if (a <= 0) continue;
        const cx = this._W0 - 350 + ((cl.x * (this._WW + 700) + this._rt * (5 + st.w.wind * 3)) % (this._WW + 700)), cy = this._H0 + cl.y * this._WH;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cl.r * 1.3); g.addColorStop(0, `rgba(2,4,10,${(.3 * a * day).toFixed(3)})`); g.addColorStop(1, 'rgba(2,4,10,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cl.r * 1.3, 0, 7); ctx.fill();
      }
    }
    _drawLabels(st) {
      const ctx = this._ctx, narrow = this._CW < 560, showT = this._CW > 700 || this._config.thermal, px = v => this._px(v);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const R of Object.values(this._rooms)) {
        const name = (narrow && R.short ? R.short : R.name).toUpperCase();
        ctx.save(); ctx.translate(R.label[0], R.label[1]); if (R.rot) ctx.rotate(-Math.PI / 2);
        ctx.font = this._font(12, 700); if ('letterSpacing' in ctx) ctx.letterSpacing = px(narrow ? .3 : 1.2) + 'px';
        ctx.strokeStyle = 'rgba(5,8,15,.8)'; ctx.lineWidth = px(3.5); ctx.lineJoin = 'round'; ctx.strokeText(name, 0, 0);
        ctx.fillStyle = this._sel === R.id ? '#E8ECF8' : (this._lit[R.id] || 0) > .5 ? '#FFE2B8' : '#A3AECB'; ctx.fillText(name, 0, 0);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        if (this._energyOn && st.energy) {
          const wh = st.energy.rooms[R.id];
          if (wh >= 1) { const t1 = nf(wh / 1000, 2) + ' kWh', t2 = nf(wh / 1000 * (this._config.tariff ?? .30), 2) + ' €'; ctx.font = this._font(12, 700); ctx.strokeText(t1, 0, px(16)); ctx.fillStyle = '#FFD9A0'; ctx.fillText(t1, 0, px(16)); ctx.strokeText(t2, 0, px(31)); ctx.fillStyle = '#E8ECF8'; ctx.fillText(t2, 0, px(31)); }
          ctx.restore(); continue;
        }
        if (this._heatOn) {
          const m = this._heat?.mins[R.id];
          if (m >= 1) { const t = fmtDur(m); ctx.font = this._font(12, 700); ctx.strokeText(t, 0, px(16)); ctx.fillStyle = '#FFD9A0'; ctx.fillText(t, 0, px(16)); }
          ctx.restore(); continue;
        }
        if (st.offline[R.id] && !R.rot && !this._rec) {
          const t = st.offline[R.id].length + ' OFFLINE', y = px(showT && st.temps[R.id] !== undefined ? 32 : 16);
          ctx.font = this._font(12, 700); ctx.strokeText(t, 0, y); ctx.fillStyle = '#FF9AA2'; ctx.fillText(t, 0, y);
        }
        if (showT && st.temps[R.id] !== undefined && !R.rot) {
          const t = nf(st.temps[R.id], 1) + '°'; ctx.font = this._font(12, 600); ctx.strokeText(t, 0, px(16));
          ctx.fillStyle = this._config.thermal ? rgba(tempColor(st.temps[R.id]), 1) : '#8F9AB8'; ctx.fillText(t, 0, px(16));
        }
        ctx.restore();
      }
      if (this._sel && this._rooms[this._sel]) { ctx.save(); ctx.strokeStyle = 'rgba(232,236,248,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -this._rt * 20; ctx.stroke(this._rooms[this._sel].path); ctx.restore(); }
    }

    // ───────── pannelli ─────────
    _updateHud(st) {
      const E = this._el, sun = st.sun, w = st.w;
      E.clock.textContent = hhmm(st.T);
      E.mode.innerHTML = this._live ? '<b>Dal vivo</b>' : `<b class="rep">Macchina del tempo</b> ×${nf(this._speed)}${this._playing ? '' : ' · in pausa'}`;
      const rooms = [...new Set(st.beams.filter(b => b.inten > .04).map(b => this._rooms[b.o.room]?.name).filter(Boolean))];
      const sunTxt = sun.el > 0 ? (rooms.length ? `Il sole entra da: ${rooms.join(', ')}` : `Sole a ${DIRS[Math.round(sun.az / 45) % 8]}, ${nf(sun.el)}° sull'orizzonte`) : 'Sole sotto l\'orizzonte';
      const tariff = this._config.tariff ?? 0.30;
      const heatTxt = this._heatOn ? (this._heatTop().length ? 'Più tempo in: ' + this._heatTop().join(' · ') : 'Mappa di calore: ancora pochi dati') : null;
      const en = st.energy, enTxt = en ? `Consumi 24 h: ${nf(en.tot / 1000, 1)} kWh · ${nf(en.tot / 1000 * tariff, 2)} €` + (en.tot > en.dev ? `<br><span>Apparecchi misurati ${nf(en.dev / 1000, 1)} kWh, resto della casa ${nf((en.tot - en.dev) / 1000, 1)} kWh</span>` : '') : null;
      const wcol = k => { const c = (this._config.waste?.colors || {})[k] || WASTE_COL[k] || [200, 205, 220]; return `rgb(${c.join(',')})`; };
      const wasteTxt = st.waste.length ? `<br><span style="color:#FFD9A0">Stasera fuori: ${st.waste.map(k => `<b style="color:${wcol(k)}">■</b> ${k}`).join(', ')}</span>` : '';
      E.info.innerHTML = `${enTxt || heatTxt || sunTxt}${wasteTxt}<br>${COND_IT[w.cond] || 'Meteo'} · fuori ${nf(w.out, 1)}°<br><span>Casa</span> ${nf(st.tot)} W · ${nf(st.tot / 1000 * tariff, 2)} €/h${Object.keys(st.offline).length ? `<br><span style="color:#FF9AA2">Sensori offline: ${Object.values(st.offline).flat().length}</span>` : ''}`;
      const past = (this._events || []).filter(e => e.t <= st.T).slice(-4).reverse();
      E.feed.innerHTML = past.map(e => `<div class="glass" style="padding:5px 9px"><time>${hhmm(e.t)}</time><i style="background:${e.c}"></i><span>${e.s}</span></div>`).join('');
      if (this._sel) this._renderPop(st);
      this._updateBell(st);
      const pct = clamp((st.T - this._t0()) / DAY, 0, 1) * 100; E.head.style.left = pct + '%';
      if (!this._scrub) E.range.value = pct / 100 * 1440;
    }
    _renderPop(st) {
      const R = this._rooms[this._sel], E = this._el; if (!R) return;
      let last = null; const P = this._pres || []; for (let i = P.length - 1; i >= 0; i--) if (P[i].r === R.id && P[i].t <= st.T) { last = P[i].t; break; }
      const here = st.pk >= 0 && P[st.pk].r === R.id;
      const wsum = this._devices.reduce((s, d, i) => s + (d.room === R.id ? st.dev[i] : 0), 0);
      const rows = [];
      if (st.temps[R.id] !== undefined) rows.push(['Temperatura', nf(st.temps[R.id], 1) + ' °C']);
      if (R.lights.length) rows.push(['Luce', st.lights[R.id] ? 'accesa' : 'spenta']);
      if (R.motion.length) rows.push(['Movimento', here ? 'adesso' : last ? 'ultimo alle ' + hhmm(last) : 'nessuno nelle 24 ore']);
      this._radars.forEach((r, i) => { if (r.room !== R.id) return; const s = st.radars[i], n = s.t ? s.t.filter(Boolean).length : 0; rows.push([r.name || 'Radar', r.type === 'ld2450' ? (n ? n + (n === 1 ? ' persona' : ' persone') : 'nessuno') : (s.mv ? 'movimento a ' + nf(s.md / 100, 1) + ' m' : s.st ? 'persona ferma a ' + nf(s.sd / 100, 1) + ' m' : 'nessuno')]); });
      (st.offline[R.id] || []).forEach(e => rows.push(['Offline', (this._hass?.states[e]?.attributes.friendly_name || e).replace(/ (Occupancy|Temperature|Temperatura)$/i, '')]));
      rows.push(['Sole dalla finestra', (st.sunRoom[R.id] || 0) > .02 ? nf(st.sunRoom[R.id] * 100) + '%' : 'no']);
      if (wsum > 0) rows.push(['Consumo', nf(wsum) + ' W']);
      E.pop.innerHTML = `<h3>${R.name}</h3>${rows.map(r => `<div class="r"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}${R.lights.length ? '<button class="more">Apri la luce</button>' : ''}`;
      const b = E.pop.querySelector('.more'); if (b) b.onclick = ev => { ev.stopPropagation(); this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: R.lights[0] } })); };
    }
    _drawTimeline() {
      const cv = this._el?.tl; if (!cv) return;
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      const d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d;
      const c = cv.getContext('2d'), w = cv.width, h = cv.height, t0 = this._t0(), hc = this._hass?.config || {};
      for (let x = 0; x < w; x += 2) {
        const el = sunAt(t0 + x / w * DAY, hc.latitude ?? 41.9, hc.longitude ?? 12.5).el;
        const col = el < -10 ? [10, 13, 28] : el < 0 ? mixc([10, 13, 28], [70, 46, 92], (el + 10) / 10) : el < 10 ? mixc([120, 70, 80], [40, 90, 120], el / 10) : mixc([40, 90, 120], [60, 140, 170], clamp((el - 10) / 25, 0, 1));
        c.fillStyle = rgba(col, 1); c.fillRect(x, 0, 2, h);
      }
      const W = this._wx; for (let i = 0; i < W.t.length; i++) if (W.v[i].rain > .1) { const a = (W.t[i] - t0) / DAY * w, b = ((W.t[i + 1] || Date.now()) - t0) / DAY * w; c.fillStyle = 'rgba(127,178,255,.55)'; c.fillRect(Math.max(0, a), 0, b - a, 5 * d); }
      for (const e of this._events || []) { const x = (e.t - t0) / DAY * w; if (x < 0) continue; c.fillStyle = e.c; c.fillRect(Math.round(x), h - 12 * d, Math.max(1, d * 1.5), 12 * d); }
    }
  }

  customElements.define('aurora-casa-viva', AuroraCasaViva);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'aurora-casa-viva', name: 'Aurora Casa Viva', description: 'Piantina animata: sole vero dalle finestre, macchina del tempo e scia di presenza', preview: false });
  console.info('%c AURORA CASA VIVA %c ' + ACV_VERSION + ' ', 'background:#7C6CF5;color:#fff;font-weight:700;border-radius:4px 0 0 4px', 'background:#22D3EE;color:#05080f;border-radius:0 4px 4px 0');
})();
