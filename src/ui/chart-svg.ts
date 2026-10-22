import type {Chart} from '../lib/presets.ts';

/** One line chart (SVG markup), as on the Week 14 slides. Plain colours so the saved file can use it too. */
export function chartSvg(chart: Chart, opts: {compact?: boolean; accent?: string} = {}): string {
  const accent = opts.accent ?? '#d9480f';
  const W = 360;
  const H = opts.compact ? 190 : 230;
  const fmt = (v: number) => (chart.comma ? v.toLocaleString('en-US') : String(v));
  const steps: number[] = [];
  for (let v = chart.lo; v <= chart.hi; v += chart.step) steps.push(v);
  const left = 14 + Math.max(...steps.map((v) => fmt(v).length)) * 7.2;
  const right = W - 12;
  const top = 26;
  const bottom = H - 26;
  const n = chart.values.length;
  const x = (i: number) => left + ((i + 0.5) * (right - left)) / n;
  const y = (v: number) => bottom - ((v - chart.lo) / (chart.hi - chart.lo)) * (bottom - top);
  const font = "font-family=\"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif\"";
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts: string[] = [];
  for (const v of steps) {
    parts.push(`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748b" ${font}>${fmt(v)}</text>`);
  }
  chart.labels.forEach((l, i) =>
    parts.push(`<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="#334155" ${font}>${esc(l)}</text>`),
  );
  const pts = chart.values.map((v, i) => [x(i), y(v)] as const);
  parts.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round"/>`);
  pts.forEach(([px, py], i) => {
    const v = chart.values[i];
    const nb = [chart.values[i - 1], chart.values[i + 1]].filter((u) => u !== undefined);
    const below = nb.some((u) => u - v > 0.08 * (chart.hi - chart.lo)) && bottom - py > 22;
    parts.push(`<circle cx="${px}" cy="${py}" r="4.5" fill="${accent}"/>`);
    parts.push(`<text x="${px}" y="${below ? py + 17 : py - 9}" text-anchor="middle" font-size="11" font-weight="800" fill="#0b3b3c" ${font}>${fmt(v)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(chart.title)}" style="width:100%;height:auto;display:block">${parts.join('')}</svg>`;
}
