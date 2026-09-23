/**
 * Bitácora de decisiones: traduce el arreglo `log` que cada algoritmo
 * produce (por qué eligió cada proceso, cuándo expropia, cuándo admite
 * o reencola) en una lista legible, y la sincroniza con el cursor de
 * tiempo compartido de la simulación para que la fila activa siga la
 * reproducción.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const DecisionLog = g.Scheduler.DecisionLog = g.Scheduler.DecisionLog || {};

  const KIND_META = {
    dispatch: { label: 'DESPACHO',      color: '#52d6d0' },
    preempt:  { label: 'EXPROPIACIÓN',  color: '#ff5c72' },
    idle:     { label: 'INACTIVA',      color: '#56607a' },
    admit:    { label: 'ADMISIÓN',      color: '#59d68a' },
    requeue:  { label: 'REENCOLA',      color: '#ffb454' },
    finish:   { label: 'FIN',           color: '#9d8bff' },
  };

  function render(container, log){
    container.innerHTML = log.map((entry, i) => {
      const meta = KIND_META[entry.kind] || { label: entry.kind.toUpperCase(), color: '#8d99b0' };
      return `<div class="log-entry" data-idx="${i}" data-t="${entry.t}">
        <span class="log-time">t=${String(entry.t).padStart(3,'0')}</span>
        <span class="log-kind" style="color:${meta.color}; border-color:${meta.color}">${meta.label}</span>
        <span class="log-text">${entry.text}</span>
      </div>`;
    }).join('');
  }

  function setActiveTime(container, cursorTime){
    const entries = container.querySelectorAll('.log-entry');
    let candidate = null;
    entries.forEach(el => {
      const t = Number(el.dataset.t);
      el.classList.toggle('past', t < cursorTime);
      el.classList.remove('active');
      if(t <= cursorTime) candidate = el;
    });
    if(candidate){
      candidate.classList.add('active');
      if(container.offsetParent !== null){
        candidate.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  DecisionLog.KIND_META = KIND_META;
  DecisionLog.render = render;
  DecisionLog.setActiveTime = setActiveTime;
})(globalThis);
