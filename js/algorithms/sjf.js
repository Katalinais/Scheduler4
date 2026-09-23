/**
 * SJF — Shortest Job First (no expropiativo)
 * En cada instante en que la CPU queda libre, entre los procesos ya
 * llegados y no completados, elige el de menor ráfaga restante
 * (empate → menor llegada, luego menor id). Una vez que empieza,
 * corre hasta terminar sin interrupción.
 *
 * @param {Array<{id:number, arrival:number, burst:number}>} procs
 * @param {Array<object>} [log] bitácora opcional de decisiones.
 * @returns {{segments: Array, results: Array, log: Array}}
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  g.Scheduler.Algorithms = g.Scheduler.Algorithms || {};

  function simulateSJF(procs, log){
    log = log || [];
    const list = procs.map(p => ({ ...p, remaining: p.burst, completed: false, firstStart: null }));
    let t = 0, done = 0;
    const segments = [];
    const n = list.length;

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
      if(chosen.firstStart === null) chosen.firstStart = t;

      const cand = avail.map(p => `P${p.id}(${p.remaining})`).join(', ');
      log.push({ t, kind:'dispatch', text:`t=${t}: candidatos disponibles {${cand}} → elige P${chosen.id} por tener la menor ráfaga restante (${chosen.remaining}); correrá sin interrupción hasta t=${t+chosen.remaining}.` });

      segments.push({ id: chosen.id, start: t, end: t+chosen.remaining });
      t = t + chosen.remaining;
      chosen.completed = true;
      chosen.completionTime = t;
      chosen.remaining = 0;
      done++;
    }

    return { segments, results: list, log };
  }

  g.Scheduler.Algorithms.sjf = simulateSJF;
})(globalThis);
