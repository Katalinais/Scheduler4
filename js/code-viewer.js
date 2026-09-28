/**
 * Visor de código: muestra el código fuente REAL de cada algoritmo
 * (obtenido con toString() sobre la función que de verdad corre),
 * para que nunca se desincronice de js/algorithms/*.js.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const CodeViewer = g.Scheduler.CodeViewer = g.Scheduler.CodeViewer || {};

  function init({ algoOrder, algoMeta, algorithms, els }){
    const INFO = {
      FCFS: { fn: algorithms.fcfs, desc: 'No expropiativo. Ordena los procesos por llegada (empate → menor id) y ejecuta cada uno de corrido hasta terminar, sin importar cuán larga sea su ráfaga ni si llega algo más corto después.' },
      SJF:  { fn: algorithms.sjf,  desc: 'No expropiativo. Cada vez que la CPU queda libre, elige entre los procesos ya llegados el de menor ráfaga restante (empate → menor llegada, luego menor id). Una vez inicia, corre hasta el final sin interrupción.' },
      SRTF: { fn: algorithms.srtf, desc: 'Expropiativo. Reevalúa unidad de tiempo por unidad de tiempo: si llega un proceso con menos tiempo restante que el que está corriendo, lo desaloja de inmediato. Al final fusiona las unidades consecutivas del mismo proceso para el diagrama.' },
      RR:   { fn: algorithms.rr,   desc: 'Expropiativo por quantum fijo. Cola FIFO: cada proceso corre como máximo "quantum" unidades; si no termina, los que llegaron durante ese turno se admiten a la cola antes de que él vuelva a entrar al final.' },
    };
    let currentTab = algoOrder[0];

    function escapeHtml(s){
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function highlightJS(src){
      let s = escapeHtml(src);
      s = s.replace(/(\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>');
      s = s.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, '<span class="tok-string">$1</span>');
      s = s.replace(/\b(\d+)\b/g, '<span class="tok-number">$1</span>');
      s = s.replace(/\b(function|const|let|var|if|else|while|for|of|return|continue|break|new|true|false|null)\b/g, '<span class="tok-keyword">$1</span>');
      return s;
    }

    function selectTab(key){
      currentTab = key;
      els.tabsBox.querySelectorAll('.algo-tab').forEach(b => b.classList.toggle('active', b.dataset.key===key));
      const info = INFO[key];
      const src = info.fn.toString();
      els.desc.textContent = info.desc;
      els.codeBlock.innerHTML = highlightJS(src);
      els.meta.textContent = `${info.fn.name}() — ${src.split('\n').length} líneas`;
    }

    els.tabsBox.innerHTML = algoOrder.map(key =>
      `<button class="algo-tab" data-key="${key}" style="--tab-accent:${algoMeta[key].accent}">${algoMeta[key].label}</button>`
    ).join('');
    els.tabsBox.querySelectorAll('.algo-tab').forEach(btn => {
      btn.addEventListener('click', () => selectTab(btn.dataset.key));
    });

    els.copyBtn.addEventListener('click', () => {
      const src = INFO[currentTab].fn.toString();
      const restore = els.copyBtn.textContent;
      const done = () => { els.copyBtn.textContent = '✓ Copiado'; setTimeout(() => { els.copyBtn.textContent = restore; }, 1200); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(src).then(done).catch(done);
      } else {
        const ta = document.createElement('textarea');
        ta.value = src; document.body.appendChild(ta); ta.select();
        try{ document.execCommand('copy'); } catch(e){}
        document.body.removeChild(ta);
        done();
      }
    });

    selectTab(currentTab);
  }

  CodeViewer.init = init;
})(globalThis);
