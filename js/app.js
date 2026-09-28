/**
 * Aplicación principal: estado, tabla de procesos, validación, orquestación
 * de los 4 algoritmos (js/algorithms/*.js), render de los 4 diagramas de
 * Gantt + regla + comparativo (js/render.js), bitácora de decisiones
 * (js/decision-log.js) y visor de código (js/code-viewer.js).
 */
(function(){
"use strict";

const Algorithms = Scheduler.Algorithms;
const Metrics = Scheduler.Metrics;
const Render = Scheduler.Render;
const DecisionLog = Scheduler.DecisionLog;

const ALGO_META = {
  FCFS: { label:'FCFS', full:'First-Come, First-Served', accent:'#1f3a5f' },
  SJF:  { label:'SJF',  full:'Shortest Job First (no expropiativo)', accent:'#7a2331' },
  SRTF: { label:'SRTF', full:'Shortest Remaining Time First (expropiativo)', accent:'#2f5233' },
  RR:   { label:'RR',   full:'Round Robin', accent:'#3d3a6b' },
};
const ALGO_ORDER = ['FCFS','SJF','SRTF','RR'];
const RUN = { FCFS: Algorithms.fcfs, SJF: Algorithms.sjf, SRTF: Algorithms.srtf, RR: Algorithms.rr };

/* ============================================================
   ESTADO
   ============================================================ */
let rows = [ {arrival:0,burst:8}, {arrival:1,burst:4}, {arrival:2,burst:9}, {arrival:3,burst:5} ];
let sim = null;
let cursorTime = 0;
let playing = false;
let playSpeed = 1;
let playTimer = null;
let hoverProcId = null;
let focusProcId = null; // proceso seguido desde el panel paso a paso
let currentView = 'procesador'; // 'procesador' | 'dashboard'

/* ============================================================
   REFERENCIAS DOM
   ============================================================ */
const $ = (id) => document.getElementById(id);
const procBody = $('procBody');
const procCount = $('procCount');
const errorBox = $('errorBox');
const errorList = $('errorList');
const emptyState = $('emptyState');
const resultsLive = $('resultsLive');
const resultsSub = $('resultsSub');
const legendStrip = $('legendStrip');
const channelsWrap = $('channelsWrap');
const rulerWrap = $('rulerWrap');
const rulerCanvas = $('rulerCanvas');
const timeSlider = $('timeSlider');
const timeReadout = $('timeReadout');
const btnPlay = $('btnPlay');
const playIcon = $('playIcon');
const speedGroup = $('speedGroup');
const tooltip = $('tooltip');
const statusText = $('statusText');
const clockText = $('clockText');
const verdictsEl = $('verdicts');
const compareCanvas = $('compareCanvas');

/* ============================================================
   TABLA DE PROCESOS
   ============================================================ */
function renderRows(){
  procBody.innerHTML = '';
  rows.forEach((row, i) => {
    const id = i+1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="proc-id-cell"><span class="proc-dot" style="background:${Render.colorOf(id)}"></span>P${id}</div></td>
      <td><input type="number" class="in-arrival" min="0" step="1" value="${row.arrival}" data-idx="${i}"></td>
      <td><input type="number" class="in-burst" min="1" step="1" value="${row.burst}" data-idx="${i}"></td>
      <td><button class="row-del" data-idx="${i}" title="Eliminar proceso" ${rows.length<=1?'disabled':''}>✕</button></td>
    `;
    procBody.appendChild(tr);
  });
  procCount.textContent = rows.length + (rows.length===1 ? ' fila' : ' filas');

  procBody.querySelectorAll('.in-arrival').forEach(inp => {
    inp.addEventListener('input', e => { rows[+e.target.dataset.idx].arrival = e.target.value; markStale(); });
  });
  procBody.querySelectorAll('.in-burst').forEach(inp => {
    inp.addEventListener('input', e => { rows[+e.target.dataset.idx].burst = e.target.value; markStale(); });
  });
  procBody.querySelectorAll('.row-del').forEach(btn => {
    btn.addEventListener('click', e => {
      rows.splice(+e.target.dataset.idx, 1);
      renderRows(); markStale();
    });
  });
}

$('btnAddRow').addEventListener('click', () => {
  rows.push({ arrival:0, burst:1 });
  renderRows(); markStale();
});

$('btnRandom').addEventListener('click', () => {
  const n = Math.max(rows.length, 4);
  rows = Array.from({length:n}, () => ({
    arrival: Math.floor(Math.random()*11),
    burst: Math.floor(Math.random()*15)+1,
  }));
  renderRows(); markStale();
});

/* ============================================================
   VALIDACIÓN
   ============================================================ */
function validate(){
  const errs = [];
  if(rows.length === 0) errs.push('Debe existir al menos un proceso en la tabla.');
  rows.forEach((r,i)=>{
    const id = i+1;
    const a = Number(r.arrival), b = Number(r.burst);
    if(r.arrival === '' || Number.isNaN(a)) errs.push(`P${id}: la llegada no puede estar vacía.`);
    else if(!Number.isInteger(a)) errs.push(`P${id}: la llegada debe ser un entero.`);
    else if(a < 0) errs.push(`P${id}: la llegada no puede ser negativa.`);
    if(r.burst === '' || Number.isNaN(b)) errs.push(`P${id}: la ráfaga no puede estar vacía.`);
    else if(!Number.isInteger(b)) errs.push(`P${id}: la ráfaga debe ser un entero.`);
    else if(b <= 0) errs.push(`P${id}: la ráfaga debe ser mayor que 0.`);
  });
  const q = Number($('quantumInput').value);
  if($('quantumInput').value === '' || Number.isNaN(q)) errs.push('El quantum de Round Robin no puede estar vacío.');
  else if(!Number.isInteger(q) || q <= 0) errs.push('El quantum de Round Robin debe ser un entero mayor que 0.');
  return errs;
}

function showErrors(errs){
  if(errs.length === 0){ errorBox.classList.remove('show'); errorList.innerHTML=''; return; }
  errorList.innerHTML = errs.map(e=>`<li>${e}</li>`).join('');
  errorBox.classList.add('show');
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */
let layout = { pxPerUnit: 24 };
const wrapEls = {}; // {FCFS: {wrap, canvas, logBox}, ...}

function buildChannelsDOM(){
  channelsWrap.innerHTML = '';
  ALGO_ORDER.forEach(key=>{
    const meta = ALGO_META[key];
    const el = document.createElement('div');
    el.className = 'channel';
    el.style.setProperty('--accent', meta.accent);
    el.innerHTML = `
      <div class="channel-head">
        <div class="channel-title"><h3>${meta.label}</h3><span class="full">${meta.full}</span></div>
        <div class="metrics-row" id="metrics-${key}"></div>
      </div>
      <div id="starve-${key}"></div>
      <div class="gantt-wrap" id="wrap-${key}"><canvas id="canvas-${key}"></canvas></div>
      <details class="proc-detail"><summary>Ver detalle por proceso</summary><div id="detail-${key}"></div></details>
      <details class="proc-detail log-detail"><summary>Bitácora de decisiones</summary><div class="log-list" id="log-${key}"></div></details>
    `;
    channelsWrap.appendChild(el);
    wrapEls[key] = {
      wrap: el.querySelector('#wrap-'+key),
      canvas: el.querySelector('#canvas-'+key),
      logBox: el.querySelector('#log-'+key),
    };
  });
}

function renderLegend(procs){
  legendStrip.innerHTML = procs.map(p=>`
    <div class="legend-chip"><span class="sw" style="background:${Render.colorOf(p.id)}"></span>P${p.id}: llegada ${p.arrival}, ráfaga ${p.burst}</div>
  `).join('');
}

function renderMetrics(key, metrics){
  const box = $('metrics-'+key);
  box.innerHTML = `
    <div class="metric"><span class="val">${metrics.avgWaiting.toFixed(2)}</span><span class="lbl">ESPERA PROM.</span></div>
    <div class="metric"><span class="val">${metrics.avgTurnaround.toFixed(2)}</span><span class="lbl">RETORNO PROM.</span></div>
    <div class="metric"><span class="val">${metrics.avgResponse.toFixed(2)}</span><span class="lbl">RESPUESTA PROM.</span></div>
    <div class="metric"><span class="val">${metrics.contextSwitches}</span><span class="lbl">CAMBIOS DE CONTEXTO</span></div>
  `;
  const starveBox = $('starve-'+key);
  starveBox.innerHTML = metrics.starving.length
    ? `<div class="starve-badge">Posible inanición: ${metrics.starving.map(id=>'P'+id).join(', ')}</div>`
    : '';
  const detail = $('detail-'+key);
  detail.innerHTML = `
    <table class="detail-table">
      <thead><tr><th>PROC</th><th>Llegada</th><th>Ráfaga</th><th>Inicio</th><th>Fin</th><th>Respuesta</th><th>Espera</th><th>Retorno</th></tr></thead>
      <tbody>
        ${metrics.per.map(p=>`
          <tr class="${metrics.starving.includes(p.id)?'starving':''}">
            <td>P${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.start}</td><td>${p.completion}</td>
            <td>${p.response}</td><td>${p.waiting}</td><td>${p.turnaround}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

function computePxPerUnit(){
  const refWidth = wrapEls.FCFS.wrap.clientWidth || 600;
  const minPx = 20;
  const px = Math.max(minPx, (refWidth-6) / Math.max(1, sim.maxTime));
  return { pxPerUnit: px, refWidth };
}

function redrawAll(){
  if(!sim || currentView !== 'dashboard') return;
  const { pxPerUnit } = computePxPerUnit();
  layout.pxPerUnit = pxPerUnit;
  const totalW = Math.max(1, sim.maxTime * pxPerUnit);

  const rctx = Render.setupHiDPI(rulerCanvas, totalW, 30);
  Render.drawRuler(rctx, totalW, 30, sim.maxTime, pxPerUnit, cursorTime);

  ALGO_ORDER.forEach(key=>{
    const data = sim.algos[key];
    const canvas = wrapEls[key].canvas;
    const ctx = Render.setupHiDPI(canvas, totalW, 76);
    Render.drawGanttTrack(ctx, {
      width: totalW, height: 76, segments: data.segments, maxTime: sim.maxTime,
      pxPerUnit, cursorTime, hoverId: hoverProcId !== null ? hoverProcId : focusProcId, ownFinish: data.ownFinish, mode:'live'
    });
    DecisionLog.setActiveTime(wrapEls[key].logBox, cursorTime);
  });
}

function syncScroll(source){
  const targets = [rulerWrap, ...ALGO_ORDER.map(k=>wrapEls[k].wrap)];
  targets.forEach(el=>{ if(el !== source) el.scrollLeft = source.scrollLeft; });
}

function updateCursor(t, opts){
  opts = opts || {};
  const prev = cursorTime;
  cursorTime = Math.max(0, Math.min(sim ? sim.maxTime : 0, t));
  timeSlider.value = cursorTime;
  timeReadout.textContent = String(cursorTime).padStart(3,'0');
  redrawAll();
  Scheduler.StepView.render(cursorTime);
  fitProcPanel(); // el aviso de diferencias cambia de texto y puede mover el panel
  // La animación del chip dura menos que el intervalo de reproducción para que nunca se acumule.
  const seconds = playing ? Math.min(1.3, 0.85 * 650 / playSpeed / 1000) : 1.3;
  Scheduler.ProcessorView.goTo(cursorTime, { animate: !!opts.animate && currentView === 'procesador', seconds });
}

function setView(v){
  currentView = v;
  resultsLive.dataset.view = v;
  document.querySelectorAll('#viewTabs .view-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  setFit(!!sim && v === 'procesador');
  if(sim && v === 'dashboard'){ redrawAll(); renderCompare(); }
  if(sim && v === 'procesador') Scheduler.ProcessorView.snapAll(cursorTime);
}
function fitProcPanel(){
  const p = $('procPanel');
  if(!(sim && currentView === 'procesador')){ p.style.height = ''; return; }
  const top = p.getBoundingClientRect().top + window.scrollY;
  p.style.height = Math.max(500, window.innerHeight - top - 10) + 'px';
}

function setFit(on){
  document.body.classList.toggle('fit', on);
  const layoutEl = document.querySelector('.layout');
  layoutEl.classList.toggle('wide', on);
  if(!on){ layoutEl.classList.remove('drawer-open'); $('btnEntrada').classList.remove('open'); }
  fitProcPanel();
}

$('btnEntrada').addEventListener('click', ()=>{
  const open = document.querySelector('.layout').classList.toggle('drawer-open');
  $('btnEntrada').classList.toggle('open', open);
});

$('viewTabs').addEventListener('click', (e)=>{
  const b = e.target.closest('.view-tab');
  if(b) setView(b.dataset.view);
});

/* ============================================================
   SIMULACIÓN PRINCIPAL
   ============================================================ */
function runSimulation(){
  const errs = validate();
  showErrors(errs);
  if(errs.length) return;

  stopPlaying();
  setStatus('busy', 'Calculando…');

  setTimeout(()=>{
    const procs = rows.map((r,i)=>({ id: i+1, arrival: Number(r.arrival), burst: Number(r.burst) }));
    const quantum = Number($('quantumInput').value);

    const raw = {
      FCFS: RUN.FCFS(procs),
      SJF: RUN.SJF(procs),
      SRTF: RUN.SRTF(procs),
      RR: RUN.RR(procs, quantum),
    };

    const algos = {};
    let maxTime = 0;
    ALGO_ORDER.forEach(key=>{
      const segments = Metrics.mergeSegments(raw[key].segments);
      const metrics = Metrics.computeMetrics(raw[key].results, key === 'SJF' || key === 'SRTF');
      const ownFinish = segments.length ? Math.max(...segments.map(s=>s.end)) : 0;
      metrics.contextSwitches = Math.max(0, segments.length - 1);
      algos[key] = { segments, metrics, ownFinish, log: raw[key].log };
      maxTime = Math.max(maxTime, ownFinish);
    });

    sim = { procs, algos, maxTime, quantum };

    emptyState.style.display = 'none';
    resultsLive.classList.add('show');
    resultsSub.textContent = `${procs.length} procesos, quantum ${quantum}, t_max ${maxTime}`;

    buildChannelsDOM();
    renderLegend(procs);
    ALGO_ORDER.forEach(key=>{
      renderMetrics(key, algos[key].metrics);
      DecisionLog.render(wrapEls[key].logBox, algos[key].log);
      wrapEls[key].wrap.addEventListener('scroll', ()=>syncScroll(wrapEls[key].wrap));
      wireHover(key);
    });

    timeSlider.max = maxTime;
    document.querySelector('.layout').classList.remove('drawer-open'); $('btnEntrada').classList.remove('open');
    setFit(currentView === 'procesador');
    Scheduler.ProcessorView.setSim(sim);
    Scheduler.StepView.setSim(sim);
    updateCursor(0);
    if(currentView === 'dashboard') renderCompare();
    setStatus('ready', 'Listo.');
  }, 220);
}

function renderCompare(){
  const data = ALGO_ORDER.map(key=>({
    label: ALGO_META[key].label,
    avgWaiting: sim.algos[key].metrics.avgWaiting,
    avgTurnaround: sim.algos[key].metrics.avgTurnaround,
  }));
  const w = compareCanvas.parentElement.clientWidth || 700;
  const h = 220;
  const ctx = Render.setupHiDPI(compareCanvas, w, h);
  Render.drawComparisonChart(ctx, w, h, data);

  const bestWaiting = data.reduce((a,b)=> b.avgWaiting < a.avgWaiting ? b : a);
  const bestTurn = data.reduce((a,b)=> b.avgTurnaround < a.avgTurnaround ? b : a);
  verdictsEl.innerHTML = `
    <div class="verdict-badge">MENOR ESPERA PROMEDIO: ${bestWaiting.label} (${bestWaiting.avgWaiting.toFixed(2)})</div>
    <div class="verdict-badge">MENOR RETORNO PROMEDIO: ${bestTurn.label} (${bestTurn.avgTurnaround.toFixed(2)})</div>
  `;
}

function markStale(){
  if(sim) setStatus('stale', 'Datos modificados — vuelve a simular.');
}

function setStatus(kind, text){
  statusText.className = 'status-text status-' + kind;
  statusText.textContent = text;
}

/* ============================================================
   TOOLTIP + HOVER ENTRE CANALES
   ============================================================ */
function wireHover(key){
  const canvas = wrapEls[key].canvas;
  canvas.addEventListener('mousemove', (e)=>{
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = x / layout.pxPerUnit;
    const segs = sim.algos[key].segments;
    const hit = segs.find(s=> t >= s.start && t < s.end);
    if(hit){
      hoverProcId = hit.id;
      tooltip.style.display = 'block';
      tooltip.innerHTML = `<b>P${hit.id}</b> — inicio ${hit.start}, fin ${hit.end}, duración ${hit.end-hit.start}`;
      tooltip.style.left = (e.clientX+14)+'px'; tooltip.style.top = (e.clientY+14)+'px';
    } else {
      hoverProcId = null;
      tooltip.style.display = 'none';
    }
    redrawAll();
  });
  canvas.addEventListener('mouseleave', ()=>{
    hoverProcId = null; tooltip.style.display = 'none'; redrawAll();
  });
}

/* ============================================================
   CONTROLES DE REPRODUCCIÓN
   ============================================================ */
btnPlay.addEventListener('click', ()=>{
  if(!sim) return;
  playing ? stopPlaying() : startPlaying();
});

function startPlaying(){
  if(!sim || cursorTime >= sim.maxTime) updateCursor(0);
  playing = true;
  playIcon.className = 'icon-pause';
  playIcon.innerHTML = '<span></span><span></span>';
  tick();
}
function stopPlaying(){
  playing = false;
  clearTimeout(playTimer);
  playIcon.className = 'icon-play';
  playIcon.innerHTML = '';
}
function tick(){
  if(!playing) return;
  if(cursorTime >= sim.maxTime){ stopPlaying(); return; }
  updateCursor(cursorTime+1, { animate: true });
  playTimer = setTimeout(tick, 650/playSpeed);
}

speedGroup.querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    speedGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    playSpeed = Number(btn.dataset.speed);
  });
});

timeSlider.addEventListener('input', (e)=>{
  stopPlaying();
  updateCursor(Number(e.target.value));
});

/* ============================================================
   EXPORTAR PNG
   ============================================================ */
$('btnExport').addEventListener('click', ()=>{
  if(!sim) return;
  const px = Math.max(10, Math.min(40, 1400/sim.maxTime));
  const trackW = sim.maxTime*px;
  const marginX = 40;
  const width = trackW + marginX*2;
  const headerH = 90, legendH = 26, channelBlockH = 116, chartH = 240;
  const height = headerH + legendH + channelBlockH*4 + chartH + 40;

  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = width*dpr; c.height = height*dpr;
  c.style.width = width+'px'; c.style.height = height+'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = '#fdfcfa'; ctx.fillRect(0,0,width,height);

  ctx.fillStyle = '#1c1c1a';
  ctx.font = '700 20px "PT Serif", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Panel de Planificación de CPU — Reporte de Simulación', marginX, 34);
  ctx.font = 'italic 11px "PT Serif", Georgia, serif';
  ctx.fillStyle = '#8a877e';
  ctx.fillText(new Date().toLocaleString(), marginX, 52);
  ctx.fillText(`${sim.procs.length} procesos, quantum RR ${$('quantumInput').value}, t_max ${sim.maxTime}`, marginX, 68);

  let y = headerH;
  ctx.font = '500 11px "JetBrains Mono", monospace';
  let lx = marginX;
  sim.procs.forEach(p=>{
    ctx.fillStyle = Render.colorOf(p.id); ctx.fillRect(lx, y, 9, 9);
    ctx.strokeStyle = '#1c1c1a'; ctx.lineWidth = 1; ctx.strokeRect(lx+0.5, y+0.5, 9, 9);
    ctx.fillStyle = '#4a4a46';
    const label = `P${p.id} L${p.arrival}/R${p.burst}`;
    ctx.fillText(label, lx+13, y+9);
    lx += ctx.measureText(label).width + 36;
  });
  y += legendH + 6;

  ALGO_ORDER.forEach(key=>{
    const meta = ALGO_META[key];
    const data = sim.algos[key];
    const m = data.metrics;
    ctx.fillStyle = meta.accent;
    ctx.fillRect(marginX-14, y, 3, 60);
    ctx.font = '700 15px "PT Serif", Georgia, serif';
    ctx.fillStyle = '#1c1c1a';
    ctx.fillText(`${meta.label} — ${meta.full}`, marginX, y+14);
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#4a4a46';
    ctx.fillText(
      `Espera ${m.avgWaiting.toFixed(2)}   Retorno ${m.avgTurnaround.toFixed(2)}   Respuesta ${m.avgResponse.toFixed(2)}   Cambios ${m.contextSwitches}` +
      (m.starving.length ? `   Inanición: ${m.starving.map(i=>'P'+i).join(',')}` : ''),
      marginX, y+30
    );
    ctx.save();
    ctx.translate(marginX, y+38);
    Render.drawGanttTrack(ctx, {
      width: trackW, height: 60, segments: data.segments, maxTime: sim.maxTime,
      pxPerUnit: px, cursorTime: null, hoverId: null, ownFinish: data.ownFinish, mode:'static'
    });
    ctx.restore();
    y += channelBlockH;
  });

  ctx.save();
  ctx.translate(marginX-6, y);
  const compareData = ALGO_ORDER.map(key=>({
    label: ALGO_META[key].label,
    avgWaiting: sim.algos[key].metrics.avgWaiting,
    avgTurnaround: sim.algos[key].metrics.avgTurnaround,
  }));
  Render.drawComparisonChart(ctx, trackW+12, chartH-20, compareData);
  ctx.restore();

  ctx.fillStyle = '#8a877e';
  ctx.font = 'italic 10px "PT Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Simulador académico de planificación de CPU — Sistemas Operativos', width/2, height-14);

  const link = document.createElement('a');
  link.download = 'simulacion-cpu.png';
  link.href = c.toDataURL('image/png');
  link.click();
});

/* ============================================================
   RELOJ Y RESIZE
   ============================================================ */
function tickClock(){
  const d = new Date();
  clockText.textContent = d.toLocaleTimeString('es-CO', { hour12:false });
}
setInterval(tickClock, 1000); tickClock();

let resizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{
    if(sim && currentView === 'dashboard'){ redrawAll(); renderCompare(); }
    fitProcPanel();
  }, 150);
});

/* ============================================================
   WIRING FINAL
   ============================================================ */
$('quantumInput').addEventListener('input', markStale);
$('btnSimulate').addEventListener('click', runSimulation);
rulerWrap.addEventListener('scroll', ()=>syncScroll(rulerWrap));

renderRows();

Scheduler.StepView.init({
  algoOrder: ALGO_ORDER,
  algoMeta: ALGO_META,
  colorOf: Render.colorOf,
  els: { badge: $('stepBadge'), grid: $('stepGrid'), diverge: $('stepDiverge'),
         btnPrev: $('btnStepPrev'), btnNext: $('btnStepNext'), btnDiff: $('btnStepDiff'), followSel: $('followSel') },
  onJump: (t) => { if(!sim) return; stopPlaying(); updateCursor(t, { animate: true }); },
  onFollow: (id) => { focusProcId = id; redrawAll(); Scheduler.ProcessorView.setFollow(id); },
});

Scheduler.ProcessorView.init({
  container: $('procGrid'),
  modeBar: $('procModes'),
  algoOrder: ALGO_ORDER,
  algoMeta: ALGO_META,
  colorOf: Render.colorOf,
});

Scheduler.CodeViewer.init({
  algoOrder: ALGO_ORDER,
  algoMeta: ALGO_META,
  algorithms: { fcfs: Algorithms.fcfs, sjf: Algorithms.sjf, srtf: Algorithms.srtf, rr: Algorithms.rr },
  els: { tabsBox: $('algoTabs'), desc: $('algoDesc'), meta: $('codeMeta'), codeBlock: $('codeBlock'), copyBtn: $('btnCopyCode') },
});

})();
