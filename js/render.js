/**
 * Dibujo en <canvas>: paleta de procesos, diagramas de Gantt, regla de
 * tiempo y gráfico comparativo de barras. Sin dependencias externas.
 */
(function(g){
  g.Scheduler = g.Scheduler || {};
  const Render = g.Scheduler.Render = g.Scheduler.Render || {};

  const PROCESS_COLORS = ['#ff6b6b','#4ecdc4','#ffd23f','#a78bfa','#3ea6ff','#ff9f43','#37d67a','#ff7edb'];

  function colorOf(id){ return PROCESS_COLORS[(id-1) % PROCESS_COLORS.length]; }

  function hexToRgba(hex, a){
    const v = hex.replace('#','');
    const r = parseInt(v.substring(0,2),16), gg = parseInt(v.substring(2,4),16), b = parseInt(v.substring(4,6),16);
    return `rgba(${r},${gg},${b},${a})`;
  }

  function setupHiDPI(canvas, cssW, cssH){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssW*dpr));
    canvas.height = Math.max(1, Math.round(cssH*dpr));
    canvas.style.width = cssW+'px';
    canvas.style.height = cssH+'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return ctx;
  }

  function drawGrid(ctx, w, h, maxTime, pxPerUnit){
    const step = pxPerUnit >= 26 ? 1 : (pxPerUnit >= 12 ? 5 : 10);
    ctx.save();
    for(let t=0; t<=maxTime; t += step){
      const x = t*pxPerUnit;
      ctx.strokeStyle = (t % (step*5) === 0) ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x+0.5, 0); ctx.lineTo(x+0.5, h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGanttTrack(ctx, opts){
    const { width, height, segments, maxTime, pxPerUnit, cursorTime, hoverId, ownFinish, mode } = opts;
    const top = 6, trackH = height - 12;

    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, top, width, trackH);
    drawGrid(ctx, width, height, maxTime, pxPerUnit);

    const sorted = [...segments].sort((a,b) => a.start-b.start);
    let prevEnd = 0;
    const idleRanges = [];
    for(const s of sorted){ if(s.start > prevEnd) idleRanges.push([prevEnd, s.start]); prevEnd = Math.max(prevEnd, s.end); }
    if(prevEnd < maxTime) idleRanges.push([prevEnd, maxTime]);

    idleRanges.forEach(([a,b]) => {
      const x = a*pxPerUnit, w = (b-a)*pxPerUnit;
      const isMidSchedule = a < ownFinish;
      if(isMidSchedule){
        ctx.save();
        ctx.beginPath(); ctx.rect(x, top, w, trackH); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for(let d = -trackH; d < w; d += 7){
          ctx.beginPath(); ctx.moveTo(x+d, top+trackH); ctx.lineTo(x+d+trackH, top); ctx.stroke();
        }
        ctx.restore();
      }
    });

    segments.forEach(seg => {
      const x = seg.start*pxPerUnit, w = Math.max(1,(seg.end-seg.start)*pxPerUnit);
      const color = colorOf(seg.id);
      let state = 'full';
      if(mode === 'live' && cursorTime !== null){
        if(seg.end <= cursorTime) state='past';
        else if(seg.start <= cursorTime && cursorTime < seg.end) state='current';
        else state='future';
      }
      const alpha = { past:0.28, future:0.6, current:1, full:0.88 }[state];
      ctx.fillStyle = hexToRgba(color, alpha);
      ctx.fillRect(x, top, w, trackH);

      if(state === 'current'){
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 16;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.strokeRect(x+1, top+1, w-2, trackH-2);
        ctx.restore();
        ctx.fillStyle = color;
        ctx.fillRect(x, top, w, 3);
      }

      if(hoverId !== null && seg.id === hoverId){
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x+1, top+1, w-2, trackH-2);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x+0.5, top); ctx.lineTo(x+0.5, top+trackH); ctx.stroke();

      if(w >= 22){
        ctx.fillStyle = '#0a0d12';
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('P'+seg.id, x+w/2, top+trackH/2+1);
      }
    });

    if(ownFinish < maxTime - 0.001){
      const fx = ownFinish*pxPerUnit;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(fx, top); ctx.lineTo(fx, top+trackH); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = fx > width-40 ? 'right' : 'left';
      ctx.fillText('fin '+ownFinish, fx + (fx>width-40?-4:4), top-2 < 8 ? 10 : 8);
    }

    if(mode === 'live' && cursorTime !== null){
      const cx = cursorTime*pxPerUnit;
      ctx.strokeStyle = '#52d6d0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();
    }
  }

  function drawRuler(ctx, width, height, maxTime, pxPerUnit, cursorTime){
    ctx.clearRect(0,0,width,height);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, height-10); ctx.lineTo(width, height-10); ctx.stroke();
    const step = pxPerUnit >= 26 ? 1 : (pxPerUnit >= 12 ? 5 : 10);
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8d99b0';
    for(let t=0; t<=maxTime; t+=step){
      const x = t*pxPerUnit;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(x, height-14); ctx.lineTo(x, height-10); ctx.stroke();
      ctx.textAlign = t===0 ? 'left' : (t>=maxTime ? 'right' : 'center');
      ctx.fillText(String(t), x, height-16);
    }
    if(cursorTime !== null){
      const cx = cursorTime*pxPerUnit;
      ctx.strokeStyle = '#52d6d0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();
      ctx.fillStyle = '#52d6d0';
      ctx.beginPath(); ctx.moveTo(cx-5, 0); ctx.lineTo(cx+5, 0); ctx.lineTo(cx, 6); ctx.closePath(); ctx.fill();
    }
  }

  function drawComparisonChart(ctx, width, height, data){
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, width, height);
    const padL = 46, padR = 16, padT = 26, padB = 30;
    const chartW = width - padL - padR, chartH = height - padT - padB;
    const maxVal = Math.max(1, ...data.flatMap(d => [d.avgWaiting, d.avgTurnaround])) * 1.15;
    const groupW = chartW / data.length;
    const barW = Math.min(34, groupW*0.3);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#56607a';
    ctx.textAlign = 'right';
    for(let i=0;i<=4;i++){
      const y = padT + chartH - (chartH*i/4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+chartW, y); ctx.stroke();
      ctx.fillText((maxVal*i/4).toFixed(1), padL-8, y+3);
    }

    data.forEach((d,i) => {
      const cx = padL + groupW*i + groupW/2;
      [ ['avgWaiting','#ffb454'], ['avgTurnaround','#52d6d0'] ].forEach(([key,color], j) => {
        const val = d[key];
        const h = (val/maxVal)*chartH;
        const x = cx - barW - 4 + j*(barW+8);
        const y = padT + chartH - h;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barW, h);
        ctx.fillStyle = '#e7ebf2';
        ctx.font = '600 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(val.toFixed(1), x+barW/2, y-6);
      });
      ctx.fillStyle = '#e7ebf2';
      ctx.font = '600 12px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, cx, padT+chartH+18);
    });

    ctx.textAlign = 'left';
    ctx.font = '500 10.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffb454'; ctx.fillRect(width-150, 6, 9, 9);
    ctx.fillStyle = '#8d99b0'; ctx.fillText('Espera', width-136, 14);
    ctx.fillStyle = '#52d6d0'; ctx.fillRect(width-70, 6, 9, 9);
    ctx.fillStyle = '#8d99b0'; ctx.fillText('Retorno', width-56, 14);
  }

  Render.PROCESS_COLORS = PROCESS_COLORS;
  Render.colorOf = colorOf;
  Render.hexToRgba = hexToRgba;
  Render.setupHiDPI = setupHiDPI;
  Render.drawGrid = drawGrid;
  Render.drawGanttTrack = drawGanttTrack;
  Render.drawRuler = drawRuler;
  Render.drawComparisonChart = drawComparisonChart;
})(globalThis);
