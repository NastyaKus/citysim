// Мини-графики на canvas.
export function sparkline(canvas: HTMLCanvasElement, data: number[], color: string, min?: number, max?: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const lo = min ?? Math.min(...data);
  const hi = max ?? Math.max(...data, lo + 1);
  const pad = 4;
  const X = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const Y = (v: number) => h - pad - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - pad * 2);
  g.beginPath();
  data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.stroke();
  g.lineTo(X(data.length - 1), h);
  g.lineTo(X(0), h);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fill();
  const last = data[data.length - 1];
  g.fillStyle = color;
  g.beginPath();
  g.arc(X(data.length - 1), Y(last), 3, 0, Math.PI * 2);
  g.fill();
  g.font = '10px system-ui';
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.textAlign = 'right';
  g.fillText(String(Math.round(last)), w - 8, 12);
}
