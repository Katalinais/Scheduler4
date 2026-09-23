/**
 * Vista paso a paso: para un instante t muestra, en tarjetas paralelas, qué
 * hace cada algoritmo con los MISMOS procesos (quién tiene la CPU, quién
 * espera y en qué orden, quién terminó o aún no llega) y por qué.
 *
 * El estado se DERIVA de los resultados que ya calcularon los algoritmos
 * (segmentos + métricas), así que nunca puede contradecir al diagrama de Gantt.
 * stateAt() es una función pura: no toca el DOM y se puede probar en Node.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const StepView = g.Scheduler.StepView = g.Scheduler.StepView || {};

  /**
   * Estado de un algoritmo al inicio de la unidad de tiempo t
   * (es decir, quién corre durante [t, t+1)).
   * @param {string} key FCFS | SJF | SRTF | RR
   * @param {{segments:Array, metrics:{per:Array}}} data resultado del algoritmo
   * @param {number} t instante entero
   */
  function stateAt(key, data, t){
    const segs = data.segments;
    const info = data.metrics.per.map(p => {
      let executed = 0, lastEnd = null;
      for(const s of segs){
        if(s.id !== p.id) continue;
        if(s.start < t) executed += Math.min(s.end, t) - s.start;
        if(s.end <= t) lastEnd = lastEnd === null ? s.end : Math.max(lastEnd, s.end);
      }
      return { id: p.id, arrival: p.arrival, burst: p.burst, completion: p.completion,
               remaining: p.burst - executed, executed, lastEnd };
    });

    const runSeg = segs.find(s => s.start <= t && t < s.end);
    const runningId = runSeg ? runSeg.id : null;

    const done = info.filter(p => p.completion <= t);
    const notArrived = info.filter(p => p.arrival > t);
    const ready = info.filter(p => p.arrival <= t && p.completion > t && p.id !== runningId);

    // Orden en el que la cola de listos sería atendida
    const cmp = {
      FCFS: (a,b) => a.arrival-b.arrival || a.id-b.id,
      SJF:  (a,b) => a.remaining-b.remaining || a.arrival-b.arrival || a.id-b.id,
      SRTF: (a,b) => a.remaining-b.remaining || a.arrival-b.arrival || a.id-b.id,
      // RR: entra a la cola en orden de llegada; los que llegan mientras otro
      // termina su quantum entran ANTES de que ese otro se reencole.
      RR:   (a,b) => {
        const ka = a.lastEnd === null ? [a.arrival, 0] : [a.lastEnd, 1];
        const kb = b.lastEnd === null ? [b.arrival, 0] : [b.lastEnd, 1];
        return ka[0]-kb[0] || ka[1]-kb[1] || a.arrival-b.arrival || a.id-b.id;
      },
    }[key];
    ready.sort(cmp);

    const byId = id => info.find(p => p.id === id);
    return {
      t,
      running: runningId === null ? null : { id: runningId, remaining: byId(runningId).remaining },
      ready: ready.map(p => ({ id: p.id, remaining: p.remaining })),
      notArrived: notArrived.map(p => ({ id: p.id, arrival: p.arrival })),
      done: done.map(p => p.id),
      allDone: done.length === info.length,
      procInfo: byId,
    };
  }

  /** Quién corre en cada t (null = CPU libre o ya terminó) por algoritmo. */
  function runningTable(algoOrder, algos, maxTime){
    const table = [];
    for(let t = 0; t <= maxTime; t++){
      const row = {};
      algoOrder.forEach(k => {
        const s = algos[k].segments.find(x => x.start <= t && t < x.end);
        row[k] = s ? s.id : null;
      });
      table.push(row);
    }
    return table;
  }

  function differs(row, algoOrder){
    const first = row[algoOrder[0]];
    return algoOrder.some(k => row[k] !== first);
  }

  /** Estado de un proceso seguido, en una frase. */
  function followText(st, id){
    const p = st.procInfo(id);
    if(p.arrival > st.t) return `aún no llega (llega en t=${p.arrival})`;
    if(p.completion <= st.t) return `terminó en t=${p.completion}, esperó ${p.completion - p.arrival - p.burst}`;
    const waited = (st.t - p.arrival) - p.executed;
    if(st.running && st.running.id === id) return `ejecutándose, le quedan ${p.remaining} (ha esperado ${waited})`;
    const pos = st.ready.findIndex(r => r.id === id) + 1;
    return `esperando, posición ${pos} de ${st.ready.length} en la cola, le quedan ${p.remaining} (ha esperado ${waited})`;
  }

  StepView.stateAt = stateAt;
  StepView.runningTable = runningTable;
  StepView.differs = differs;
  StepView.followText = followText;

  /* ------------------------------------------------------------------
     Parte con DOM (solo navegador)
     ------------------------------------------------------------------ */
  let ctx = null;

  StepView.init = function(opts){
    ctx = Object.assign({ sim: null, table: [], diffTimes: [], t: 0, follow: null }, opts);
    const { els } = ctx;
    els.btnPrev.addEventListener('click', () => ctx.onJump(ctx.t - 1));
    els.btnNext.addEventListener('click', () => ctx.onJump(ctx.t + 1));
    els.btnDiff.addEventListener('click', () => {
      if(!ctx.diffTimes.length) return;
      const next = ctx.diffTimes.find(x => x > ctx.t);
      ctx.onJump(next !== undefined ? next : ctx.diffTimes[0]);
    });
    els.followSel.addEventListener('change', () => {
      ctx.follow = els.followSel.value === '' ? null : Number(els.followSel.value);
      ctx.onFollow(ctx.follow);
      StepView.render(ctx.t);
    });
    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if(!ctx.sim || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if(e.key === 'ArrowRight') ctx.onJump(ctx.t + 1);
      if(e.key === 'ArrowLeft') ctx.onJump(ctx.t - 1);
    });
  };

  StepView.setSim = function(sim){
    ctx.sim = sim;
    ctx.table = runningTable(ctx.algoOrder, sim.algos, sim.maxTime);
    ctx.diffTimes = [];
    for(let t = 0; t < sim.maxTime; t++) if(differs(ctx.table[t], ctx.algoOrder)) ctx.diffTimes.push(t);
    ctx.follow = null;
    ctx.els.followSel.innerHTML = '<option value="">Ninguno</option>' +
      sim.procs.map(p => `<option value="${p.id}">P${p.id}</option>`).join('');
    ctx.els.followSel.value = '';
    ctx.els.btnDiff.disabled = ctx.diffTimes.length === 0;
    ctx.onFollow(null);
  };

  const chip = (id, extra, follow) =>
    `<span class="pchip${follow === id ? ' followed' : ''}" style="--c:${ctx.colorOf(id)}">P${id}${extra !== undefined ? `<small>${extra}</small>` : ''}</span>`;

  StepView.render = function(t){
    if(!ctx || !ctx.sim) return;
    ctx.t = t;
    const { sim, algoOrder, algoMeta, els, follow } = ctx;
    els.badge.textContent = 't=' + String(t).padStart(3, '0');
    els.btnPrev.disabled = t <= 0;
    els.btnNext.disabled = t >= sim.maxTime;

    // Banner de divergencia
    const row = ctx.table[t];
    const diffCount = ctx.diffTimes.length;
    if(t >= sim.maxTime){
      els.diverge.className = 'step-diverge same';
      els.diverge.innerHTML = `<b>Fin de la simulación.</b> Los cuatro algoritmos discreparon en ${diffCount} de ${sim.maxTime} pasos.`;
    } else if(differs(row, algoOrder)){
      const groups = {};
      algoOrder.forEach(k => { const id = row[k]; (groups[id === null ? 'libre' : 'P'+id] = groups[id === null ? 'libre' : 'P'+id] || []).push(k); });
      const txt = Object.entries(groups).map(([who, ks]) => `<b>${who === 'libre' ? 'CPU libre' : who}</b> en ${ks.join(', ')}`).join('; ');
      els.diverge.className = 'step-diverge differ';
      els.diverge.innerHTML = `<b>Aquí se separan.</b> ${txt}. (${diffCount} de ${sim.maxTime} pasos son distintos.)`;
    } else {
      const id = row[algoOrder[0]];
      els.diverge.className = 'step-diverge same';
      els.diverge.innerHTML = `<b>Coinciden.</b> Los cuatro ejecutan ${id === null ? 'CPU libre' : 'P'+id} en este paso. (${diffCount} de ${sim.maxTime} pasos son distintos.)`;
    }

    // Tarjetas
    els.grid.classList.toggle('differ', t < sim.maxTime && differs(row, algoOrder));
    els.grid.innerHTML = algoOrder.map(key => {
      const data = sim.algos[key];
      const st = stateAt(key, data, t);
      const cpu = st.running
        ? `${chip(st.running.id, undefined, follow)}<span class="cpu-note">quedan ${st.running.remaining}</span>`
        : `<span class="cpu-idle">${st.allDone ? 'Terminó todo' : 'CPU libre'}</span>`;
      const queue = st.ready.length
        ? st.ready.map(r => chip(r.id, r.remaining, follow)).join('')
        : '<span class="empty">vacía</span>';
      const later = st.notArrived.length
        ? st.notArrived.map(n => chip(n.id, 'en ' + n.arrival, follow)).join('') : '<span class="empty">ninguno</span>';
      const fin = st.done.length ? st.done.map(id => chip(id, undefined, follow)).join('') : '<span class="empty">ninguno</span>';

      let lastLog = null;
      for(const e of data.log){ if(e.t <= t) lastLog = e; else break; }
      const why = lastLog ? lastLog.text : '';
      const followLine = follow !== null
        ? `<div class="step-follow">P${follow}: ${followText(st, follow)}</div>` : '';
      const orderNote = key === 'FCFS' ? 'por llegada' : key === 'RR' ? 'orden de la cola' : 'menor restante primero';

      return `<div class="step-card" style="--accent:${algoMeta[key].accent}">
        <h3>${algoMeta[key].label}</h3>
        <div class="step-label">CPU</div>
        <div class="cpu-box">${cpu}</div>
        <div class="step-label">Cola de listos <span>${orderNote}</span></div>
        <div class="chips">${queue}</div>
        <div class="step-label">Por llegar</div>
        <div class="chips">${later}</div>
        <div class="step-label">Terminados</div>
        <div class="chips">${fin}</div>
        ${followLine}
        <div class="step-why"><span>Decisión vigente</span>${why}</div>
      </div>`;
    }).join('');
  };
})(globalThis);
