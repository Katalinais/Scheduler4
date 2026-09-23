/**
 * Utilidades de métricas: fusión de segmentos consecutivos del mismo
 * proceso (necesario sobre todo para Round Robin, cuando un proceso
 * queda solo en la cola y se despacha varias veces seguidas) y cálculo
 * de espera / retorno / respuesta promedio por algoritmo.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const Metrics = g.Scheduler.Metrics = g.Scheduler.Metrics || {};

  function mergeSegments(segments){
    const merged = [];
    for(const seg of segments){
      const last = merged[merged.length-1];
      if(last && last.id === seg.id && last.end === seg.start) last.end = seg.end;
      else merged.push({ ...seg });
    }
    return merged;
  }

  /**
   * @param {Array} results salida de un simulate*() (con completionTime, firstStart, arrival, burst)
   * @param {boolean} checkStarvation si se debe marcar procesos con espera muy por encima del promedio
   */
  function computeMetrics(results, checkStarvation){
    const n = results.length;
    const per = results.map(p => {
      const waiting = p.completionTime - p.arrival - p.burst;
      const turnaround = p.completionTime - p.arrival;
      const response = p.firstStart - p.arrival;
      return { id: p.id, arrival: p.arrival, burst: p.burst, start: p.firstStart, completion: p.completionTime, waiting, turnaround, response };
    });
    const avg = arr => arr.reduce((a,b) => a+b, 0) / arr.length;
    const avgWaiting = avg(per.map(p => p.waiting));
    const avgTurnaround = avg(per.map(p => p.turnaround));
    const avgResponse = avg(per.map(p => p.response));
    const starving = (checkStarvation && n > 1)
      ? per.filter(p => p.waiting > avgWaiting*1.5 && p.waiting > 0).map(p => p.id)
      : [];
    return { per, avgWaiting, avgTurnaround, avgResponse, starving };
  }

  Metrics.mergeSegments = mergeSegments;
  Metrics.computeMetrics = computeMetrics;
})(globalThis);
