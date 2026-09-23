/**
 * SRTF — Shortest Remaining Time First (expropiativo)
 * Simulación unidad de tiempo por unidad de tiempo: en cada instante t,
 * entre los procesos llegados y no completados, elige el de menor tiempo
 * restante (empate → menor llegada, luego menor id), ejecuta 1 unidad y
 * decrementa su remaining. Si llega un proceso más corto, se expropia
 * de inmediato. Al final fusiona las unidades consecutivas del mismo
 * proceso en bloques para el diagrama de Gantt.
 *
 * @param {Array<{id:number, arrival:number, burst:number}>} procs
 * @param {Array<object>} [log] bitácora opcional de decisiones.
 * @returns {{segments: Array, results: Array, log: Array}}
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  g.Scheduler.Algorithms = g.Scheduler.Algorithms || {};

  function simulateSRTF(procs, log){
    log = log || [];
    const list = procs.map(p => ({ ...p, remaining: p.burst, completed: false, firstStart: null }));
    let t = 0, done = 0;
    const n = list.length;
    const timeline = [];
    let lastRunning = null; // id del proceso que corrió en el tick anterior (para detectar expropiación)

    while(done < n){
      const avail = list.filter(p => !p.completed && p.arrival <= t);

      if(avail.length === 0){
        const next = Math.min(...list.filter(p => !p.completed).map(p => p.arrival));
        log.push({ t, kind:'idle', text:`t=${t}: no hay procesos listos, CPU inactiva hasta t=${next}.` });
        t = next;
        continue;
      }

      avail.sort((a,b) => a.remaining-b.remaining || a.arrival-b.arrival || a.id-b.id);
      const chosen = avail[0];

      // La lógica de selección arriba es la única fuente de verdad; lo
      // siguiente sólo registra la decisión, no la modifica.
      if(chosen.id !== lastRunning){
        const cand = avail.map(p => `P${p.id}(${p.remaining})`).join(', ');
        if(lastRunning !== null){
          log.push({ t, kind:'preempt', text:`t=${t}: candidatos {${cand}} → P${chosen.id} tiene menos tiempo restante que P${lastRunning} (que estaba corriendo) → SRTF lo expropía y toma la CPU.` });
        } else {
          log.push({ t, kind:'dispatch', text:`t=${t}: candidatos {${cand}} → elige P${chosen.id} por tener el menor tiempo restante (${chosen.remaining}).` });
        }
        lastRunning = chosen.id;
      }

      if(chosen.firstStart === null) chosen.firstStart = t;
      chosen.remaining -= 1;
      timeline.push({ id: chosen.id, t });
      t += 1;

      if(chosen.remaining === 0){
        chosen.completed = true;
        chosen.completionTime = t;
        done++;
        log.push({ t, kind:'finish', text:`t=${t}: P${chosen.id} termina su ráfaga.` });
        lastRunning = null;
      }
    }

    // fusiona unidades consecutivas del mismo proceso en bloques para el Gantt
    const segments = [];
    for(const ev of timeline){
      const last = segments[segments.length-1];
      if(last && last.id === ev.id && last.end === ev.t) last.end = ev.t+1;
      else segments.push({ id: ev.id, start: ev.t, end: ev.t+1 });
    }

    return { segments, results: list, log };
  }

  g.Scheduler.Algorithms.srtf = simulateSRTF;
})(globalThis);
