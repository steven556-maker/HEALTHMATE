// رسم بسيط لزاوية الحركة على مدى الجلسة (بدون حفظ فيديو، ولا بيتحفظ في أي مكان: بيتعرض في ملخص الجلسة بس).
const NS = "http://www.w3.org/2000/svg";

export function downsample(values: number[], max = 200): number[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  return Array.from({ length: max }, (_, i) => values[Math.floor(i * step)]);
}

export function renderTrace(values: number[], guides: { up?: number; down?: number } = {}): SVGSVGElement | null {
  const data = downsample(values.filter(Number.isFinite));
  if (data.length < 3) return null;
  const W = 300, H = 100, pad = 6;
  const all = [...data, ...(guides.up !== undefined ? [guides.up] : []), ...(guides.down !== undefined ? [guides.down] : [])];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "trace-chart"); svg.setAttribute("role", "img");
  svg.setAttribute("dir", "ltr"); // الزمن بيمشي من الشمال لليمين دايمًا حتى في الواجهة العربية
  for (const value of [guides.up, guides.down]) {
    if (value === undefined) continue;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(pad)); line.setAttribute("x2", String(W - pad));
    line.setAttribute("y1", String(y(value))); line.setAttribute("y2", String(y(value)));
    line.setAttribute("class", "trace-guide"); svg.append(line);
  }
  const path = document.createElementNS(NS, "polyline");
  path.setAttribute("points", data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "));
  path.setAttribute("class", "trace-line"); svg.append(path);
  return svg;
}
