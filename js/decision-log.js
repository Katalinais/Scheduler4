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

  function cssVar(name, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** Colores según el tema activo — se resuelve de nuevo cada vez que se llama. */
  function kindMeta(){
    return {
      dispatch: { label: 'DESPACHO',      color: cssVar('--kind-dispatch', '#1f3a5f') },
      preempt:  { label: 'EXPROPIACIÓN',  color: cssVar('--kind-preempt', '#b0413e') },
      idle:     { label: 'INACTIVA',      color: cssVar('--kind-idle', '#8a877e') },
      admit:    { label: 'ADMISIÓN',      color: cssVar('--kind-admit', '#4f7942') },
      requeue:  { label: 'REENCOLA',      color: cssVar('--kind-requeue', '#96731c') },
      finish:   { label: 'FIN',           color: cssVar('--kind-finish', '#6b4c9a') },
    };
  }

  function render(container, log){
    const KIND = kindMeta();
    container.innerHTML = log.map((entry, i) => {
      const meta = KIND[entry.kind] || { label: entry.kind.toUpperCase(), color: cssVar('--ink-faint', '#8a877e') };
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

  DecisionLog.kindMeta = kindMeta;
  DecisionLog.render = render;
  DecisionLog.setActiveTime = setActiveTime;
})(globalThis);
