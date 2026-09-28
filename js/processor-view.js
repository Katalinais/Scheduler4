/**
 * Vista Procesador: cada algoritmo se dibuja como un diagrama de bloques de
 * un núcleo, al estilo de una figura de libro de texto (tinta sobre papel).
 *
 *   MEMORIA (por llegar)  ->  COLA DE LISTOS  ->  PLANIFICADOR  ->  NÚCLEO  ->  TERMINADOS
 *                                  ^                                  |
 *                                  +-------- bus de retorno ----------+
 *
 * Cada proceso es una ficha que viaja por los buses. El estado de cada instante
 * se DERIVA de los resultados de los algoritmos (StepView.stateAt), así que el
 * diagrama nunca puede contradecir al Gantt. Al avanzar o retroceder UN paso se
 * anima el recorrido con GSAP; al saltar más lejos se coloca todo de golpe.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const PV = g.Scheduler.ProcessorView = g.Scheduler.ProcessorView || {};
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent, text){
    const e = document.createElementNS(NS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    if(text !== undefined) e.textContent = text;
    if(parent) parent.appendChild(e);
    return e;
  }

  /* ----------------------------- geometría ----------------------------- */
  // Formato ancho y bajo (2,3:1) para que los 4 chips quepan juntos en una pantalla.
  const W = 760, H = 334;
  const G = {
    die:   { x: 16,  y: 16,  w: 728, h: 300 },
    mem:   { x: 24,  y: 24,  w: 112, h: 250 },
    queue: { x: 148, y: 24,  w: 268, h: 56  },
    done:  { x: 428, y: 24,  w: 308, h: 56  },
    sched: { x: 148, y: 90,  w: 268, h: 64  },
    pcb:   { x: 148, y: 164, w: 268, h: 110 },
    core:  { x: 428, y: 90,  w: 308, h: 184 },
    clock: { x: 24,  y: 282, w: 712, h: 28  },
  };
  const BUS_X = 142, QY = 62, HEAD_X = 392, CORR_Y = 85, ENTRY_Y = 104, BAY = { x: 516, y: 142 };
  const CYCLE_W = 24, CLOCK_X0 = G.clock.x + 70, CLOCK_POS = 5;

  const STATE_META = {
    mem:   { label: 'NUEVO',      short: 'NUEVO', color: '#8a877e' },
    queue: { label: 'LISTO',      short: 'LISTO', color: '#96731c' },
    core:  { label: 'EJECUCIÓN',  short: 'EJEC.', color: '#2f5233' },
    done:  { label: 'TERMINADO',  short: 'TERM.', color: '#3d3a6b' },
  };

  function zonePos(zone, idx, n){
    if(zone === 'mem'){
      const sp = Math.min(24, 196 / Math.max(n, 1));
      return { x: 80, y: 74 + idx * sp, w: 100, h: Math.min(20, sp - 2) };
    }
    if(zone === 'queue'){
      const sp = n > 1 ? Math.min(40, (HEAD_X - 168) / (n - 1)) : 40;
      return { x: HEAD_X - idx * sp, y: QY, w: Math.max(16, Math.min(36, sp - 4)), h: 30 };
    }
    if(zone === 'core') return { x: BAY.x, y: BAY.y, w: 132, h: 44 };
    const sp = n > 1 ? Math.min(34, (G.done.w - 44) / (n - 1)) : 34;
    return { x: G.done.x + 22 + idx * sp, y: QY, w: Math.max(16, Math.min(30, sp - 3)), h: 22 };
  }

  /** Recorrido (por los buses) de una ficha que avanza de una zona a otra. */
  function routeFwd(fz, f, tz, t){
    if(fz === 'mem' && tz === 'queue')
      return [f, { x: BUS_X, y: f.y }, { x: BUS_X, y: QY }, t];
    if(fz === 'mem' && tz === 'core')
      return [f, { x: BUS_X, y: f.y }, { x: BUS_X, y: QY }, { x: HEAD_X, y: QY },
              { x: HEAD_X, y: ENTRY_Y }, { x: BAY.x, y: ENTRY_Y }, t];
    if(fz === 'queue' && tz === 'core')
      return [f, { x: f.x, y: ENTRY_Y }, { x: BAY.x, y: ENTRY_Y }, t];
    if(fz === 'core' && (tz === 'queue' || tz === 'done'))
      return [f, { x: BAY.x, y: CORR_Y }, { x: t.x, y: CORR_Y }, t];
    return [f, t];
  }

  function makePath(pts){
    const lens = []; let total = 0;
    for(let i = 1; i < pts.length; i++){
      const d = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      lens.push(d); total += d;
    }
    return { pts, lens, total: total || 1 };
  }
  function pointAt(path, p){
    let d = p * path.total;
    for(let i = 0; i < path.lens.length; i++){
      if(d <= path.lens[i] || i === path.lens.length - 1){
        const k = path.lens[i] ? Math.min(1, d / path.lens[i]) : 1;
        return { x: path.pts[i].x + (path.pts[i+1].x - path.pts[i].x) * k,
                 y: path.pts[i].y + (path.pts[i+1].y - path.pts[i].y) * k };
      }
      d -= path.lens[i];
    }
    return path.pts[path.pts.length - 1];
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  const RULES = {
    FCFS: () => 'orden de llegada, sin expropiar',
    SJF:  () => 'menor ráfaga, sin expropiar',
    SRTF: () => 'menor tiempo restante, expropia',
    RR:   q => `cola FIFO con quantum ${q}`,
  };

  /* ------------------------------ un chip ------------------------------ */
  function createChip(opts){
    const { container, key, meta, sim, colorOf } = opts;
    const data = sim.algos[key];
    const per = data.metrics.per;
    const procs = sim.procs;
    const N = procs.length;
    const KIND = (g.Scheduler.DecisionLog && g.Scheduler.DecisionLog.KIND_META) || {};
    const uid = 'chip' + key;

    const card = document.createElement('div');
    card.className = 'chip-card';
    card.dataset.key = key;
    card.style.setProperty('--accent', meta.accent);
    card.innerHTML =
      `<div class="chip-head" title="Clic para ampliar o volver a los 4"><h3>${meta.label}</h3><span class="full">${meta.full}</span>` +
      `<span class="chip-t" data-role="t">t=000</span></div>` +
      `<div class="chip-svg"></div>` +
      `<div class="chip-why"><span class="kind" data-role="kind"></span><span class="txt" data-role="why"></span></div>`;
    container.appendChild(card);
    const tEl = card.querySelector('[data-role=t]');
    const kindEl = card.querySelector('[data-role=kind]');
    const whyEl = card.querySelector('[data-role=why]');

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chip-svg-el', role: 'img',
      'aria-label': `Procesador de un núcleo ejecutando ${meta.label}` }, card.querySelector('.chip-svg'));

    /* defs */
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: uid + '-grid', width: 16, height: 16, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M16 0H0V16', fill: 'none', stroke: 'rgba(28,28,26,0.05)', 'stroke-width': 0.6 }, pat);
    const clip = el('clipPath', { id: uid + '-clk' }, defs);
    el('rect', { x: CLOCK_X0, y: G.clock.y, width: G.clock.x + G.clock.w - CLOCK_X0, height: G.clock.h }, clip);

    const MONO = 'JetBrains Mono, monospace';
    const SANS = '"PT Sans", "Helvetica Neue", Arial, sans-serif';
    const INK = '#1c1c1a', INK_SOFT = '#4a4a46', INK_FAINT = '#8a877e', BLOCK_STROKE = 'rgba(28,28,26,0.4)';

    /* marco de la figura, sobre papel, con textura de papel cuadriculado */
    el('rect', { x: G.die.x, y: G.die.y, width: G.die.w, height: G.die.h, fill: '#fdfcfa', stroke: INK, 'stroke-width': 1.5 }, svg);
    el('rect', { x: G.die.x, y: G.die.y, width: G.die.w, height: G.die.h, fill: `url(#${uid}-grid)` }, svg);
    el('text', { x: G.die.x + 10, y: G.die.y + 15, 'font-size': 10.5, fill: INK_FAINT, 'font-family': SANS, 'letter-spacing': 0.5 },
      svg, `CPU · 1 NÚCLEO · ${meta.label}`);

    /* trazas (buses) */
    const trace = (d, extra) => el('path', Object.assign({ d, fill: 'none', stroke: INK_FAINT, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, extra || {}), svg);
    trace(`M${G.mem.x + G.mem.w} ${QY} H${G.queue.x}`);
    trace(`M${BUS_X} ${QY} V${G.mem.y + G.mem.h - 8}`, { 'stroke-dasharray': '2 5' });
    trace(`M${HEAD_X} ${G.queue.y + G.queue.h} V${G.sched.y}`);
    trace(`M${G.sched.x + G.sched.w} ${ENTRY_Y} H${G.core.x}`);
    trace(`M${G.queue.x} ${CORR_Y} H${BAY.x}`, { 'stroke-dasharray': '2 5' });
    trace(`M${BAY.x} ${G.done.y + G.done.h} V${G.core.y}`);

    /* bloques */
    function block(r, title, extra){
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#ffffff', stroke: BLOCK_STROKE, 'stroke-width': 1.2 }, svg);
      el('text', { x: r.x + 8, y: r.y + 15, 'font-size': 11, fill: INK_SOFT, 'font-family': SANS, 'font-weight': 700, 'letter-spacing': 0.3 }, svg, title);
      if(extra) el('text', { x: r.x + r.w - 8, y: r.y + 15, 'font-size': 10.5, fill: INK_FAINT, 'font-family': SANS, 'font-style': 'italic', 'text-anchor': 'end' }, svg, extra);
    }
    block(G.mem, 'MEMORIA');
    el('text', { x: G.mem.x + 8, y: G.mem.y + 29, 'font-size': 10.5, fill: INK_FAINT, 'font-family': SANS, 'font-style': 'italic' }, svg, 'por llegar');
    block(G.queue, 'COLA DE LISTOS', 'cabeza');
    el('line', { x1: G.queue.x + 6, y1: QY, x2: G.queue.x + G.queue.w - 6, y2: QY, stroke: 'rgba(28,28,26,0.25)', 'stroke-dasharray': '3 4' }, svg);
    block(G.sched, 'PLANIFICADOR', meta.label);
    block(G.pcb, 'TABLA DE PCB', 'memoria del SO');
    block(G.done, 'TERMINADOS');

    // núcleo
    const coreRect = el('rect', { x: G.core.x, y: G.core.y, width: G.core.w, height: G.core.h, fill: '#faf8f3', stroke: meta.accent, 'stroke-width': 1.8 }, svg);
    el('text', { x: G.core.x + 8, y: G.core.y + 15, 'font-size': 11.5, fill: meta.accent, 'font-family': SANS, 'font-weight': 700, 'letter-spacing': 0.3 }, svg, 'NÚCLEO 0');
    const led = el('circle', { cx: G.core.x + G.core.w - 14, cy: G.core.y + 11, r: 5, fill: 'none', stroke: INK_FAINT, 'stroke-width': 1.4 }, svg);
    el('line', { x1: G.core.x, y1: G.core.y + 22, x2: G.core.x + G.core.w, y2: G.core.y + 22, stroke: BLOCK_STROKE }, svg);
    el('rect', { x: BAY.x - 70, y: BAY.y - 26, width: 140, height: 52, fill: 'none', stroke: INK_FAINT, 'stroke-dasharray': '4 3' }, svg);
    const bayNote = el('text', { x: BAY.x, y: BAY.y + 4, 'text-anchor': 'middle', 'font-size': 11.5, fill: INK_FAINT, 'font-family': SANS, 'font-style': 'italic' }, svg, 'CPU libre');
    el('text', { x: 446, y: 182, 'font-size': 9.5, fill: INK_FAINT, 'font-family': SANS }, svg, 'RÁFAGA EJECUTADA');
    const cellsG = el('g', {}, svg);
    el('text', { x: 606, y: 124, 'font-size': 9.5, fill: INK_FAINT, 'font-family': SANS }, svg, 'REGISTROS');
    const regs = {};
    [['PID', 'pid'], ['PC', 'pc'], ['RESTANTE', 'rest'], ['QUANTUM', 'qnt']].forEach(([label, k], i) => {
      const y = 139 + i * 14;
      el('text', { x: 606, y, 'font-size': 11, fill: INK_SOFT, 'font-family': SANS }, svg, label);
      regs[k] = el('text', { x: 726, y, 'font-size': 12.5, 'font-weight': 700, fill: INK, 'text-anchor': 'end', 'font-family': MONO }, svg, '—');
      el('line', { x1: 606, y1: y + 3, x2: 726, y2: y + 3, stroke: 'rgba(28,28,26,0.18)' }, svg);
    });
    const ucRect = el('rect', { x: 440, y: 222, width: 140, height: 36, fill: '#ffffff', stroke: BLOCK_STROKE }, svg);
    el('text', { x: 510, y: 244, 'text-anchor': 'middle', 'font-size': 11.5, fill: INK_SOFT, 'font-family': SANS }, svg, 'UNIDAD CTRL');
    const aluRect = el('rect', { x: 592, y: 222, width: 136, height: 36, fill: '#ffffff', stroke: BLOCK_STROKE }, svg);
    el('text', { x: 660, y: 244, 'text-anchor': 'middle', 'font-size': 11.5, fill: INK_SOFT, 'font-family': SANS }, svg, 'ALU');
    const ucFlash = el('rect', { x: 440, y: 222, width: 140, height: 36, fill: meta.accent, opacity: 0 }, svg);
    const aluFlash = el('rect', { x: 592, y: 222, width: 136, height: 36, fill: meta.accent, opacity: 0 }, svg);

    // planificador: regla y lámpara del último evento
    el('text', { x: G.sched.x + 8, y: G.sched.y + 33, 'font-size': 11.5, fill: INK_SOFT, 'font-family': SANS }, svg, RULES[key](sim.quantum));
    const lampRect = el('rect', { x: G.sched.x + 8, y: G.sched.y + 40, width: 124, height: 18, fill: 'none', stroke: INK_FAINT }, svg);
    const lampText = el('text', { x: G.sched.x + 70, y: G.sched.y + 53, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: INK_FAINT, 'font-family': SANS }, svg, 'EN ESPERA');

    // tabla de PCB
    const cols = N <= 6 ? 3 : 4, rows = Math.max(1, Math.ceil(N / cols));
    const LONG = cols === 3;
    const tileW = (G.pcb.w - 16 - (cols - 1) * 5) / cols;
    const tileH = Math.min(38, (G.pcb.h - 30 - (rows - 1) * 5) / rows);
    const two = tileH >= 30;
    const tiles = {};
    procs.forEach((p, i) => {
      const cx = G.pcb.x + 8 + (i % cols) * (tileW + 5), cy = G.pcb.y + 24 + Math.floor(i / cols) * (tileH + 5);
      const gTile = el('g', {}, svg);
      const r = el('rect', { x: cx, y: cy, width: tileW, height: tileH, fill: '#ffffff', stroke: BLOCK_STROKE }, gTile);
      el('rect', { x: cx, y: cy, width: 4, height: tileH, fill: colorOf(p.id) }, gTile);
      el('text', { x: cx + 10, y: two ? cy + 14 : cy + tileH / 2 + 4, 'font-size': two ? 12.5 : 11.5, 'font-weight': 700, fill: INK, 'font-family': MONO }, gTile, 'P' + p.id);
      const rest = el('text', { x: cx + tileW - 6, y: cy + 14, 'font-size': 11.5, fill: INK_SOFT, 'text-anchor': 'end', 'font-family': MONO }, gTile, '');
      const state = two
        ? el('text', { x: cx + 10, y: cy + tileH - 7, 'font-size': 9, 'font-weight': 700, fill: INK_FAINT, 'font-family': SANS }, gTile, '')
        : el('text', { x: cx + tileW - 6, y: cy + tileH / 2 + 3.5, 'font-size': 8.5, 'font-weight': 700, fill: INK_FAINT, 'text-anchor': 'end', 'font-family': SANS }, gTile, '');
      const flash = el('rect', { x: cx, y: cy, width: tileW, height: tileH, fill: '#f7ecc9', opacity: 0 }, gTile);
      const focus = el('rect', { x: cx - 1.5, y: cy - 1.5, width: tileW + 3, height: tileH + 3, fill: 'none', stroke: INK, 'stroke-width': 1.6, opacity: 0 }, gTile);
      tiles[p.id] = { r, rest, state, flash, focus };
    });

    // reloj
    block(G.clock, 'RELOJ');
    const waveHolder = el('g', { 'clip-path': `url(#${uid}-clk)` }, svg);
    el('rect', { x: CLOCK_X0 + CLOCK_POS * CYCLE_W, y: G.clock.y + 3, width: CYCLE_W, height: G.clock.h - 6, fill: meta.accent, opacity: 0.14 }, waveHolder);
    const waveG = el('g', {}, waveHolder);
    const nCyc = Math.min(sim.maxTime + 24, 420);
    const yh = G.clock.y + 8, yl = G.clock.y + 16;
    let d = `M0 ${yl}`;
    for(let i = 0; i <= nCyc; i++){
      const x0 = i * CYCLE_W;
      d += ` L${x0} ${yl} L${x0} ${yh} L${x0 + CYCLE_W / 2} ${yh} L${x0 + CYCLE_W / 2} ${yl}`;
      if(i <= sim.maxTime)
        el('text', { x: x0 + CYCLE_W / 2, y: G.clock.y + 25.5, 'text-anchor': 'middle', 'font-size': 8.5, fill: INK_FAINT, 'font-family': MONO }, waveG, String(i));
    }
    el('path', { d, fill: 'none', stroke: meta.accent, 'stroke-width': 1.6, opacity: 0.9 }, waveG);
    function setClock(v){
      waveG.setAttribute('transform', `translate(${CLOCK_X0 + CLOCK_POS * CYCLE_W - v * CYCLE_W},0)`);
    }

    /* fichas */
    const tokLayer = el('g', {}, svg);
    const tokens = {};
    procs.forEach(p => {
      const gEl = el('g', { 'data-id': p.id }, tokLayer);
      const rect = el('rect', { fill: colorOf(p.id), stroke: 'rgba(0,0,0,.4)' }, gEl);
      const follow = el('rect', { fill: 'none', stroke: '#1c1c1a', 'stroke-width': 2, opacity: 0 }, gEl);
      const main = el('text', { 'font-family': 'JetBrains Mono, monospace', 'font-weight': 700, fill: '#1c1c1a' }, gEl, 'P' + p.id);
      const sub = el('text', { 'font-family': 'JetBrains Mono, monospace', 'font-weight': 600, fill: '#1c1c1a', opacity: 0.75 }, gEl, '');
      tokens[p.id] = { g: gEl, rect, follow, main, sub, zone: 'mem', x: 0, y: 0, w: 40, h: 30, id: p.id };
    });

    function paint(tk){
      const { w, h, zone } = tk;
      tk.g.setAttribute('transform', `translate(${tk.x.toFixed(2)},${tk.y.toFixed(2)})`);
      tk.rect.setAttribute('x', -w / 2); tk.rect.setAttribute('y', -h / 2);
      tk.rect.setAttribute('width', w); tk.rect.setAttribute('height', h);
      tk.follow.setAttribute('x', -w / 2 - 3); tk.follow.setAttribute('y', -h / 2 - 3);
      tk.follow.setAttribute('width', w + 6); tk.follow.setAttribute('height', h + 6);
      const m = tk.main, s = tk.sub;
      if(zone === 'mem'){
        m.setAttribute('x', -w / 2 + 8); m.setAttribute('y', 4.5); m.setAttribute('font-size', 12.5); m.setAttribute('text-anchor', 'start');
        s.setAttribute('x', w / 2 - 6); s.setAttribute('y', 3.5); s.setAttribute('font-size', 9); s.setAttribute('text-anchor', 'end');
      } else if(zone === 'queue'){
        m.setAttribute('x', 0); m.setAttribute('y', -2); m.setAttribute('font-size', 12.5); m.setAttribute('text-anchor', 'middle');
        s.setAttribute('x', 0); s.setAttribute('y', 11); s.setAttribute('font-size', 10); s.setAttribute('text-anchor', 'middle');
      } else if(zone === 'core'){
        m.setAttribute('x', -w / 2 + 12); m.setAttribute('y', 8); m.setAttribute('font-size', 22); m.setAttribute('text-anchor', 'start');
        s.setAttribute('x', w / 2 - 10); s.setAttribute('y', 5); s.setAttribute('font-size', 11.5); s.setAttribute('text-anchor', 'end');
      } else {
        m.setAttribute('x', 0); m.setAttribute('y', 4); m.setAttribute('font-size', 10.5); m.setAttribute('text-anchor', 'middle');
        s.setAttribute('x', 0); s.setAttribute('y', 4);
      }
    }

    /* estado de un instante como posiciones de fichas */
    function layout(t){
      const st = g.Scheduler.StepView.stateAt(key, data, t);
      const map = {};
      const mem = st.notArrived.slice().sort((a, b) => a.arrival - b.arrival || a.id - b.id);
      mem.forEach((n, j) => { map[n.id] = Object.assign({ zone: 'mem', sub: `llega t=${n.arrival}` }, zonePos('mem', j, mem.length)); });
      st.ready.forEach((r, i) => { map[r.id] = Object.assign({ zone: 'queue', sub: String(r.remaining) }, zonePos('queue', i, st.ready.length)); });
      if(st.running) map[st.running.id] = Object.assign({ zone: 'core', sub: `restan ${st.running.remaining}` }, zonePos('core', 0, 1));
      const comp = id => per.find(p => p.id === id).completion;
      const done = st.done.slice().sort((a, b) => comp(a) - comp(b) || a - b);
      done.forEach((id, j) => { map[id] = Object.assign({ zone: 'done', sub: '' }, zonePos('done', j, done.length)); });
      return { st, map, t };
    }

    function lastLog(t){
      let last = null;
      for(const e of data.log){ if(e.t <= t) last = e; else break; }
      return last;
    }

    let follow = null;

    /** Partes del chip que no son fichas: registros, PCB, planificador, subtítulos. */
    function updateStatic(L){
      const { st, map, t } = L;
      tEl.textContent = 't=' + String(t).padStart(3, '0');
      // subtítulos de fichas (p. ej. el restante que baja mientras corre)
      procs.forEach(p => { const tk = tokens[p.id], e = map[p.id]; if(e){ tk.sub.textContent = e.sub; tk.main.textContent = 'P' + p.id; } });
      // registros y núcleo
      const run = st.running;
      const seg = run ? data.segments.find(s => s.start <= t && t < s.end) : null;
      if(run){
        const info = st.procInfo(run.id);
        regs.pid.textContent = 'P' + run.id;
        regs.pc.textContent = '0x' + info.executed.toString(16).toUpperCase().padStart(4, '0');
        regs.rest.textContent = String(run.remaining);
        regs.qnt.textContent = key === 'RR' && seg ? `${(t - seg.start) % sim.quantum}/${sim.quantum}` : '—';
        bayNote.textContent = '';
        led.setAttribute('fill', meta.accent);
        led.setAttribute('stroke', meta.accent);
      } else {
        regs.pid.textContent = '—'; regs.pc.textContent = '—'; regs.rest.textContent = '—'; regs.qnt.textContent = '—';
        bayNote.textContent = st.allDone ? 'terminado' : 'CPU libre';
        led.setAttribute('fill', st.allDone ? '#3d3a6b' : 'none');
        led.setAttribute('stroke', st.allDone ? '#3d3a6b' : '#8a877e');
      }
      // celdas de la ráfaga en ejecución
      cellsG.innerHTML = '';
      if(run){
        const info = st.procInfo(run.id);
        const cells = Math.min(info.burst, 24);
        const cw = 150 / cells;
        const filled = Math.round(cells * info.executed / info.burst);
        for(let i = 0; i < cells; i++)
          el('rect', { x: 446 + i * cw + 0.8, y: 186, width: Math.max(1, cw - 1.6), height: 8,
            fill: i < filled ? colorOf(run.id) : '#efece3', stroke: i < filled ? 'none' : 'rgba(28,28,26,0.18)' }, cellsG);
      }
      // PCB
      procs.forEach(p => {
        const e = map[p.id], tl = tiles[p.id];
        if(!e) return;
        const meta2 = STATE_META[e.zone];
        tl.state.textContent = LONG ? meta2.label : meta2.short; tl.state.setAttribute('fill', meta2.color);
        const info = st.procInfo(p.id);
        tl.rest.textContent = !two ? '' : (e.zone === 'done' ? '0' : String(info.remaining));
        tl.r.setAttribute('stroke', e.zone === 'core' ? meta.accent : 'rgba(28,28,26,0.4)');
        tl.focus.setAttribute('opacity', follow === p.id ? 1 : 0);
      });
      // lámpara del planificador y pie de tarjeta
      const lg = lastLog(t);
      const km = lg ? (KIND[lg.kind] || { label: lg.kind.toUpperCase(), color: '#8a877e' }) : null;
      if(km){
        lampText.textContent = km.label; lampText.setAttribute('fill', km.color); lampRect.setAttribute('stroke', km.color);
        kindEl.textContent = km.label; kindEl.style.color = km.color; kindEl.style.borderColor = km.color;
        whyEl.textContent = lg.text; whyEl.title = lg.text;
      } else {
        lampText.textContent = 'EN ESPERA'; lampText.setAttribute('fill', '#8a877e'); lampRect.setAttribute('stroke', '#8a877e');
        kindEl.textContent = ''; whyEl.textContent = 'Aún no ocurre ninguna decisión.';
      }
      if(t >= sim.maxTime){ kindEl.textContent = 'FIN'; kindEl.style.color = '#3d3a6b'; kindEl.style.borderColor = '#3d3a6b'; whyEl.textContent = `Todos los procesos terminaron en t=${data.ownFinish}.`; }
      // proceso seguido
      procs.forEach(p => tokens[p.id].follow.setAttribute('opacity', follow === p.id ? 1 : 0));
    }

    function place(tk, e){
      tk.zone = e.zone; tk.x = e.x; tk.y = e.y; tk.w = e.w; tk.h = e.h;
      tk.g.setAttribute('data-zone', e.zone);
      paint(tk);
    }

    let curT = 0, tl = null;

    function snap(t){
      const L = layout(t);
      procs.forEach(p => place(tokens[p.id], L.map[p.id]));
      updateStatic(L);
      setClock(t);
      curT = t;
    }

    function flash(rectEl, at, D, peak){
      tl.fromTo(rectEl, { opacity: 0 }, { opacity: peak || 0.7, duration: D * 0.12, yoyo: true, repeat: 1, ease: 'sine.inOut' }, at);
    }

    function animate(t, dir, seconds){
      const from = curT;
      const A = layout(from), B = layout(t);
      curT = t;
      const D = Math.max(0.1, seconds);
      const execD = dir > 0 && A.st.running ? D * 0.22 : 0;
      const moveD = D * 0.56;
      tl = g.gsap.timeline({ onComplete: () => { tl = null; snap(t); } });

      // ciclo de reloj
      const clk = { v: from };
      tl.to(clk, { v: t, duration: D * 0.9, ease: 'power1.inOut', onUpdate: () => setClock(clk.v) }, 0);

      // ejecución de una unidad de tiempo en el núcleo
      if(execD && A.st.running){
        flash(aluFlash, 0, D, 0.85);
        tl.fromTo(coreRect, { attr: { 'stroke-width': 1.6 } }, { attr: { 'stroke-width': 3.4 }, duration: execD * 0.5, yoyo: true, repeat: 1 }, 0);
      }

      // cambio de contexto: guardar PCB del que sale, cargar el del que entra
      const outId = A.st.running ? A.st.running.id : null;
      const inId = B.st.running ? B.st.running.id : null;
      if(outId !== inId){
        flash(ucFlash, execD, D, 0.8);
        if(outId !== null) flash(tiles[outId].flash, execD, D, 0.55);
        if(inId !== null) flash(tiles[inId].flash, execD + D * 0.2, D, 0.55);
      }

      // recorrido de las fichas
      procs.forEach(p => {
        const tk = tokens[p.id], a = A.map[p.id], b = B.map[p.id];
        const moved = a.zone !== b.zone || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.w - b.w) > 0.5;
        if(!moved) return;
        let pts;
        if(a.zone === b.zone) pts = [a, b];
        else pts = dir > 0 ? routeFwd(a.zone, a, b.zone, b) : routeFwd(b.zone, b, a.zone, a).slice().reverse();
        const path = makePath(pts);
        const delay = execD + (b.zone === 'core' ? D * 0.2 : (a.zone === b.zone ? D * 0.1 : 0));
        const o = { p: 0 };
        tl.to(o, {
          p: 1, duration: a.zone === b.zone ? moveD * 0.7 : moveD, ease: 'power2.inOut',
          onStart: () => {
            tk.zone = b.zone; tk.sub.textContent = b.sub;
            tk.g.parentNode.appendChild(tk.g); // la ficha viaja por encima de las demás
          },
          onUpdate: () => {
            const q = pointAt(path, o.p);
            tk.x = q.x; tk.y = q.y;
            tk.w = lerp(a.w, b.w, o.p); tk.h = lerp(a.h, b.h, o.p);
            paint(tk);
          },
        }, delay);
      });

      tl.call(() => updateStatic(B), null, execD + moveD * 0.55);
    }

    return {
      key, card, snap,
      get curT(){ return curT; },
      goTo(t, o){
        o = o || {};
        if(tl){ tl.kill(); tl = null; snap(curT); }
        if(t === curT) return;
        const visible = card.offsetParent !== null && !!g.gsap;
        if(o.animate && visible && Math.abs(t - curT) === 1) animate(t, t > curT ? 1 : -1, o.seconds || 1.3);
        else snap(t);
      },
      setFollow(id){ follow = id; updateStatic(layout(curT)); },
      destroy(){ if(tl) tl.kill(); card.remove(); },
    };
  }

  /* --------------------------- API del módulo --------------------------- */
  let cfg = null, chips = [], mode = 'all', lastT = 0, lastFollow = null;

  PV.init = function(opts){
    cfg = opts;
    if(cfg.modeBar){
      cfg.modeBar.addEventListener('click', e => {
        const b = e.target.closest('button[data-mode]');
        if(b) PV.setMode(b.dataset.mode);
      });
    }
  };

  PV.setSim = function(sim){
    chips.forEach(c => c.destroy());
    cfg.container.innerHTML = '';
    chips = cfg.algoOrder.map(key => {
      const chip = createChip({ container: cfg.container, key, meta: cfg.algoMeta[key], sim, colorOf: cfg.colorOf });
      chip.card.querySelector('.chip-head').addEventListener('click', () => PV.setMode(mode === 'all' ? key : 'all'));
      return chip;
    });
    lastFollow = null; lastT = 0;
    PV.setMode(mode === 'all' || cfg.algoOrder.includes(mode) ? mode : 'all');
    chips.forEach(c => c.snap(0));
  };

  PV.setMode = function(m){
    mode = m;
    cfg.container.classList.toggle('single', m !== 'all');
    chips.forEach(c => c.card.classList.toggle('hidden', m !== 'all' && c.key !== m));
    if(cfg.modeBar) cfg.modeBar.querySelectorAll('button[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  };

  PV.goTo = function(t, o){ lastT = t; chips.forEach(c => c.goTo(t, o)); };
  PV.snapAll = function(t){ lastT = t; chips.forEach(c => c.goTo(t, { animate: false })); };
  PV.setFollow = function(id){ lastFollow = id; chips.forEach(c => c.setFollow(id)); };
  PV.getMode = () => mode;
})(globalThis);
