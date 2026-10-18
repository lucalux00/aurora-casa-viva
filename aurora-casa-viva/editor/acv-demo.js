/*
 * Aurora Casa Viva — dati finti per la demo e per l'anteprima dell'editor.
 * Costruisce una giornata credibile partendo da qualsiasi configurazione della scheda:
 * chi si muove dove, luci, finestre, consumi, meteo, allarme, radar, spioncino e rifiuti.
 * Nessun collegamento a Home Assistant: tutto resta nel browser.
 */
(() => {
  const MIN = 60000, DAY = 86400000;
  const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
  const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const tod = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  const inIv = (list, m) => list.some(([a, b]) => m >= a && m < b);

  function pick(rooms, re, fallback) {
    const k = Object.keys(rooms).find(id => !rooms[id].outdoor && re.test(id + ' ' + (rooms[id].name || '')));
    return k || fallback;
  }

  function plan(cfg) {
    const rooms = cfg.rooms || {}, ids = Object.keys(rooms).filter(k => !rooms[k].outdoor);
    const any = i => ids[i % Math.max(1, ids.length)];
    const P = {
      bed: pick(rooms, /camera|letto|matrimoniale|bedroom/i, any(0)),
      bath: pick(rooms, /bagno|bath/i, any(1)),
      kitchen: pick(rooms, /cucina|kitchen/i, any(2)),
      living: pick(rooms, /soggiorno|salotto|living|sala/i, any(3)),
      study: pick(rooms, /studio|cameretta|ufficio|office/i, any(4)),
      hall: pick(rooms, /ingresso|corridoio|disimpegno|hall/i, any(5)),
    };
    const seq = [['00:00', 'bed'], ['06:52', 'bed'], ['06:58', 'bath'], ['07:20', 'kitchen'], ['07:55', 'bed'], ['08:03', 'hall'], ['08:05', 'fuori'],
      ['12:38', 'hall'], ['12:42', 'kitchen'], ['13:30', 'living'], ['15:00', 'bath'], ['15:08', 'living'], ['16:30', 'study'], ['18:30', 'kitchen'],
      ['20:00', 'living'], ['21:15', 'study'], ['21:28', 'living'], ['23:00', 'bath'], ['23:14', 'bed']];
    const pres = seq.map(([t, r]) => ({ m: hm(t), r: r === 'fuori' ? 'fuori' : P[r] })).filter(p => p.r);
    return { P, pres };
  }

  function roomAt(pres, m) { let r = pres[0].r; for (const p of pres) if (p.m <= m) r = p.r; return r; }
  function sinceEnter(pres, m) { let t = 0; for (const p of pres) if (p.m <= m) t = p.m; return m - t; }

  // meteo: mattina serena, temporale breve nel pomeriggio
  const WX = [[0, .12, 0, 7, 12.5, 'clear-night'], [420, .1, 0, 7, 11.5, 'sunny'], [720, .3, 0, 11, 19, 'sunny'], [840, .6, 0, 18, 20, 'partlycloudy'],
    [890, .85, 0, 25, 18, 'cloudy'], [900, .9, .8, 28, 16.5, 'rainy'], [945, .8, 0, 22, 16, 'cloudy'], [1000, .4, 0, 14, 17, 'partlycloudy'], [1140, .15, 0, 8, 15, 'clear-night'], [1440, .12, 0, 7, 12.5, 'clear-night']];
  function weatherAt(m) {
    for (let i = 1; i < WX.length; i++) if (m <= WX[i][0]) {
      const a = WX[i - 1], b = WX[i], k = (m - a[0]) / (b[0] - a[0]);
      const night = m < 420 || m > 1110;
      const cond = b[2] > 0 && m >= 900 ? 'rainy' : (a[1] + (b[1] - a[1]) * k) > .7 ? 'cloudy' : (a[1] + (b[1] - a[1]) * k) > .35 ? 'partlycloudy' : night ? 'clear-night' : 'sunny';
      return { state: cond, attributes: { temperature: +(a[4] + (b[4] - a[4]) * k).toFixed(1), cloud_coverage: Math.round((a[1] + (b[1] - a[1]) * k) * 100), wind_speed: Math.round(a[3] + (b[3] - a[3]) * k), wind_speed_unit: 'km/h', wind_bearing: 255, friendly_name: 'Meteo casa' } };
    }
    return { state: 'sunny', attributes: {} };
  }

  function build(cfg) {
    const { P, pres } = plan(cfg), rooms = cfg.rooms || {};
    const night = m => m < 7 * 60 + 15 || m > 18 * 60 + 20;
    const ent = {};   // entity_id -> function(minuto del giorno, ms) -> stato
    const at = (m) => roomAt(pres, m);
    for (const [id, r] of Object.entries(rooms)) {
      arr(r.light).forEach(e => { ent[e] = m => (at(m) === id && (night(m) || /bagno|corridoio|ripost|ingresso/i.test(id))) || (r.outdoor && m > 20 * 60 + 30 && m < 21 * 60 + 30) ? 'on' : 'off'; });
      arr(r.motion).forEach((e, k) => { ent[e] = m => at(m) === id && (k === 0 ? sinceEnter(pres, m) < 4 || (Math.floor(m * 3) % 7 === 0) : true) ? 'on' : 'off'; });
      if (r.temperature) {
        const base = 19.5 + (id.length % 5) * .4;
        ent[r.temperature] = m => (base + .6 * Math.sin((m - 540) / 1440 * 2 * Math.PI) + (id === P.bath && m > 418 && m < 460 ? 3 : 0) + (id === P.kitchen && ((m > 760 && m < 800) || (m > 1145 && m < 1200)) ? 1.8 : 0)).toFixed(1);
      }
    }
    // finestre: aria al mattino, in cucina mentre si cucina, in soggiorno nel pomeriggio
    arr(cfg.openings).forEach((o, i) => {
      const slots = o.room === P.living ? [[840, 880]] : o.room === P.kitchen ? [[1150, 1170]] : o.room === P.bed ? [[475, 483]] : i % 3 === 0 ? [[600, 615]] : [];
      ent[o.entity] = m => inIv(slots, m) ? 'on' : 'off';
    });
    if (cfg.door?.entity) ent[cfg.door.entity] = m => inIv([[483, 484.2], [758, 759.2]], m) ? 'on' : 'off';
    // consumi: dal nome dell'apparecchio
    arr(cfg.devices).forEach((d, i) => {
      const n = (d.name || d.entity).toLowerCase();
      const slots = /forno/.test(n) ? [[770, 798, 1900], [1145, 1180, 2100]] : /lavatrice/.test(n) ? [[570, 610, 2000], [610, 660, 350]] : /lavastov/.test(n) ? [[1230, 1260, 1800], [1260, 1320, 120]]
        : /pc|computer/.test(n) ? [[990, 1110, 160], [1275, 1288, 150]] : /caff/.test(n) ? [[442, 445, 1250]] : /asciug/.test(n) ? [[660, 720, 900]] : [[600 + i * 90, 640 + i * 90, 700]];
      ent[d.entity] = m => { for (const [a, b, w] of slots) if (m >= a && m < b) return String(w + Math.round(Math.sin(m * 7) * w * .03)); return /frigo/.test(n) ? '55' : '0'; };
    });
    if (cfg.power_total) ent[cfg.power_total] = m => String(120 + arr(cfg.devices).reduce((s, d) => s + (+ent[d.entity](m) || 0), 0));
    arr(cfg.media).forEach(md => {
      const slots = md.room === P.living ? [[815, 895], [1205, 1375]] : md.room === P.kitchen ? [[442, 470], [1120, 1190]] : md.room === P.bed ? [[1394, 1410]] : [];
      ent[md.entity] = m => inIv(slots, m) ? 'playing' : 'idle';
    });
    arr(cfg.cameras).forEach(c => { ent[c.entity] = m => inIv([[612, 613], [931, 932], [966, 966.6]], m) ? 'on' : 'off'; });
    if (cfg.alarm) ent[cfg.alarm] = m => m >= 486 && m < 758 ? 'armed_away' : (m >= 1410 || m < 410) ? 'armed_night' : 'disarmed';
    // radar
    arr(cfg.radars).forEach(r => {
      if (r.type === 'ld2450') {
        if (r.presence) ent[r.presence] = m => at(m) === r.room ? 'on' : 'off';
        for (let k = 1; k <= 3; k++) {
          const who = (m, s) => {
            if (at(m) !== r.room) return null;
            if (k === 1) { const ph = s / 47; return [Math.sin(ph) * 900, 2600 + Math.cos(ph * .7) * 700]; }
            if (k === 2 && m >= 1210 && m < 1370) return [-1200 + Math.sin(s / 90) * 60, 3400];
            return null;
          };
          ent[`${r.prefix}_target_${k}_x`] = (m, ms) => { const p = who(m, ms / 1000); return p ? String(Math.round(p[0])) : '0'; };
          ent[`${r.prefix}_target_${k}_y`] = (m, ms) => { const p = who(m, ms / 1000); return p ? String(Math.round(p[1])) : '0'; };
        }
      } else {
        const here = m => at(m) === r.room || (pres.some(p => Math.abs(p.m - m) < 1.2));
        if (r.presence) ent[r.presence] = m => here(m) ? 'on' : 'off';
        if (r.moving) ent[r.moving] = m => here(m) && sinceEnter(pres, m) < 2 ? 'on' : 'off';
        if (r.still) ent[r.still] = m => here(m) && sinceEnter(pres, m) >= 2 ? 'on' : 'off';
        if (r.move_distance) ent[r.move_distance] = m => String(80 + Math.round((m * 37) % 260));
        if (r.still_distance) ent[r.still_distance] = m => String(120 + Math.round((m * 13) % 140));
      }
    });
    // spioncino e rifiuti
    const bell = cfg.doorbell;
    if (bell?.image) {
      const evs = [hm('10:12'), hm('17:41'), hm('19:58')];
      ent[bell.image] = (m, ms) => { let last = evs[0] - 1440; for (const e of evs) if (e <= m) last = e; return new Date(ms - (m - last) * MIN).toISOString(); };
      if (bell.event_type) ent[bell.event_type] = m => (m >= hm('17:41') && m < hm('19:58')) ? 'Doorbell ring' : 'PIR Event';
    }
    if (cfg.waste?.entity) ent[cfg.waste.entity] = () => 'carta,plastica';
    if (cfg.weather) ent[cfg.weather] = 'weather';
    return ent;
  }

  function createHass(cfg, opts = {}) {
    const ent = build(cfg), over = {}, listeners = [];
    const picture = opts.picture || 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#28324f"/><stop offset="1" stop-color="#0d1222"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="160" cy="70" r="28" fill="#9aa7c7"/><rect x="112" y="104" width="96" height="80" rx="40" fill="#9aa7c7"/><text x="160" y="24" fill="#cfd6ea" font-family="sans-serif" font-size="14" text-anchor="middle">Foto di esempio</text></svg>');
    const stateOf = (e, ms) => {
      const f = ent[e]; const m = tod(ms);
      if (f === 'weather') return weatherAt(m);
      if (over[e] && over[e].until > ms) return { state: over[e].state, attributes: {} };
      const s = typeof f === 'function' ? f(m, ms) : 'unknown';
      const a = {};
      if (cfg.waste && e === cfg.waste.entity) a[cfg.waste.attribute || 'lista'] = s.split(',');
      if (cfg.doorbell && e === cfg.doorbell.image) a.entity_picture = picture;
      return { state: s, attributes: a };
    };
    const states = () => {
      const now = Date.now(), out = {};
      for (const e of Object.keys(ent)) { const s = stateOf(e, now); out[e] = { entity_id: e, state: s.state, attributes: { friendly_name: e.split('.')[1].replace(/_/g, ' '), ...s.attributes }, last_changed: new Date(now - 30000).toISOString() }; }
      return out;
    };
    const history = (ids, start, end, withAttr) => {
      const res = {};
      for (const e of ids) {
        if (!ent[e]) continue;
        const list = []; let prev = null;
        const fine = /_target_\d_[xy]$/.test(e);
        const step = fine ? 15000 : MIN;
        for (let t = start; t <= end; t += step) {
          const s = stateOf(e, t), key = s.state + (withAttr ? JSON.stringify(s.attributes) : '');
          if (key !== prev) { const it = { s: s.state, lu: t / 1000 }; if (withAttr) it.a = s.attributes; list.push(it); prev = key; }
        }
        res[e] = list;
      }
      return res;
    };
    const hass = {
      config: { latitude: opts.latitude ?? 41.9, longitude: opts.longitude ?? 12.5, version: 'demo' },
      user: { is_admin: true, name: 'Demo' },
      states: states(),
      callWS: async msg => {
        if (msg.type === 'history/history_during_period') return history(msg.entity_ids || [], Date.parse(msg.start_time), Date.parse(msg.end_time), msg.no_attributes === false);
        return {};
      },
      callService: async (domain, service, data) => {
        for (const e of arr(data && data.entity_id)) over[e] = { state: service === 'turn_on' ? 'on' : service === 'turn_off' ? 'off' : (hass.states[e]?.state === 'on' ? 'off' : 'on'), until: Date.now() + 10 * MIN };
        tick();
      },
      callApi: async () => ({}),
    };
    function tick() { const h = { ...hass, states: states() }; Object.assign(hass, { states: h.states }); listeners.forEach(fn => fn(h)); }
    return { hass, onUpdate: fn => listeners.push(fn), start: (ms = 2000) => setInterval(tick, ms), tick };
  }

  window.AuroraCasaVivaDemo = { createHass };
})();
