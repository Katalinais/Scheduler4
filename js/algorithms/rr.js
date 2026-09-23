/**
 * Round Robin — cola FIFO con quantum fijo.
 * Al llegar, los procesos se admiten a la cola en orden de arrival
 * (empate → id). Se saca el primero de la cola, corre min(quantum,
 * remaining), y antes de volver a encolarlo (si no terminó) se
 * admiten a la cola los procesos que llegaron durante ese quantum.
 * Si la cola queda vacía y aún faltan procesos por llegar, avanza el
 * tiempo hasta la siguiente llegada.
 *
 * @param {Array<{id:number, arrival:number, burst:number}>} procs
 * @param {number} quantum
 * @param {Array<object>} [log] bitácora opcional de decisiones.
 * @returns {{segments: Array, results: Array, log: Array}}
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  g.Scheduler.Algorithms = g.Scheduler.Algorithms || {};

  function simulateRR(procs, quantum, log){
    log = log || [];
    const list = procs.map(p => ({ ...p, remaining: p.burst, completed: false, firstStart: null, admitted: false }));
    let t = 0, done = 0;
    const n = list.length;
    const queue = [];
    const segments = [];

    function admit(upTo){
      const arrivals = list.filter(p => !p.admitted && !p.completed && p.arrival <= upTo);
      arrivals.sort((a,b) => a.arrival-b.arrival || a.id-b.id);
      for(const p of arrivals){
        p.admitted = true;
        queue.push(p);
        log.push({ t: upTo, kind:'admit', text:`t=${upTo}: P${p.id} llega y se admite al final de la cola.` });
      }
    }

    admit(0);

    while(done < n){
      if(queue.length === 0){
        const next = Math.max(t, Math.min(...list.filter(p => !p.completed).map(p => p.arrival)));
        if(next > t) log.push({ t, kind:'idle', text:`t=${t}: la cola está vacía, CPU inactiva hasta t=${next}.` });
        t = next;
        admit(t);
        continue;
      }

      const proc = queue.shift();
      if(proc.firstStart === null) proc.firstStart = t;
      const run = Math.min(quantum, proc.remaining);
      const queueSnapshot = queue.map(p => 'P'+p.id).join(', ') || '—';
      log.push({ t, kind:'dispatch', text:`t=${t}: se despacha P${proc.id} de la cola (resto de la cola: ${queueSnapshot}); correrá min(quantum=${quantum}, restante=${proc.remaining}) = ${run} unidades.` });

      segments.push({ id: proc.id, start: t, end: t+run });
      t = t + run;
      proc.remaining -= run;
      admit(t);

      if(proc.remaining > 0){
        queue.push(proc);
        log.push({ t, kind:'requeue', text:`t=${t}: P${proc.id} no terminó (quedan ${proc.remaining}), vuelve al final de la cola.` });
      } else {
        proc.completed = true;
        proc.completionTime = t;
        done++;
        log.push({ t, kind:'finish', text:`t=${t}: P${proc.id} termina su ráfaga.` });
      }
    }

    return { segments, results: list, log };
  }

  g.Scheduler.Algorithms.rr = simulateRR;
})(globalThis);
