// Hand-drawn line chart on <canvas>, devicePixelRatio aware.
function drawChart(cv, pts, start, marks){
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
  if (!pts.length) return;
  const vs = pts.map(p => p.value).concat([start]); let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const t0 = new Date(pts[0].ts).getTime(), t1 = Math.max(t0 + 1, new Date(pts[pts.length - 1].ts).getTime());
  const X = t => 4 + (w - 8) * (new Date(t).getTime() - t0) / (t1 - t0), Y = v => 26 + (h - 34) * (1 - (v - lo) / (hi - lo));
  c.setLineDash([4, 4]); c.strokeStyle = 'rgba(235,235,245,.3)'; c.beginPath(); c.moveTo(0, Y(start)); c.lineTo(w, Y(start)); c.stroke(); c.setLineDash([]);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,211,90,.25)'); g.addColorStop(1, 'rgba(0,211,90,0)');
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p.ts), Y(p.value)) : c.moveTo(X(p.ts), Y(p.value)));
  c.lineWidth = 2; c.strokeStyle = '#00d35a'; c.stroke();
  c.lineTo(X(pts[pts.length - 1].ts), h); c.lineTo(X(pts[0].ts), h); c.closePath(); c.fillStyle = g; c.fill();
  let rows = []; c.font = '11px -apple-system';
  (marks || []).forEach(m => { const x = X(m.ts); if (x < 0) return; const txt = m.kind === 'bought' ? m.title : m.value;
    const col = m.kind === 'bought' ? '#0a84ff' : (m.kind === 'stopped' ? '#ff453a' : '#00d35a'); const tw = c.measureText(txt).width;
    let r = 0; while (rows[r] && rows[r] > x - 4) r++; rows[r] = x + tw; c.fillStyle = col; c.fillText(txt, Math.min(x, w - tw - 2), 12 + r * 13); });
}
