/**
 * FCFS — First-Come, First-Served
 * No expropiativo. Ordena por llegada (empate → menor id) y ejecuta cada
 * proceso de corrido hasta terminar, sin importar cuán larga sea su ráfaga.
 *
 * @param {Array<{id:number, arrival:number, burst:number}>} procs
 * @param {Array<object>} [log] arreglo opcional donde se registran las
 *        decisiones de planificación (bitácora), para fines pedagógicos.
 * @returns {{segments: Array, results: Array, log: Array}}
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  g.Scheduler.Algorithms = g.Scheduler.Algorithms || {};

  function simulateFCFS(procs, log){
    log = log || [];
    const list = procs.map(p => ({ ...p }));
    list.sort((a,b) => a.arrival-b.arrival || a.id-b.id);

    let t = 0;
    const segments = [];

    for(const p of list){
      if(t < p.arrival){
        log.push({ t, kind:'idle', text:`CPU inactiva de t=${t} a t=${p.arrival} (esperando la llegada de P${p.id}).` });
        t = p.arrival;
      }
      p.firstStart = t;
      log.push({ t, kind:'dispatch', text:`t=${t}: se despacha P${p.id} (llegó en ${p.arrival}, ráfaga ${p.burst}) — es el siguiente en orden de llegada y correrá de corrido hasta t=${t+p.burst}.` });
      segments.push({ id: p.id, start: t, end: t+p.burst });
      t = t + p.burst;
      p.completionTime = t;
    }

    return { segments, results: list, log };
  }

  g.Scheduler.Algorithms.fcfs = simulateFCFS;
})(globalThis);
