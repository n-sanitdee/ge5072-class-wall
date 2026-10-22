// "Save the Ladpet": one self-contained HTML file (photos embedded) — KPI teaching-technique evidence.
import {GOOD_P, NINE, type Preset, fullTitle, titleParts} from './presets.ts';
import {chartSvg} from '../ui/chart-svg.ts';
import type {Post, Pub, Team} from './types.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);
const rich = (s: string) =>
  esc(s)
    .split('**')
    .map((p, i) => (i % 2 ? `<mark>${p}</mark>` : p))
    .join('');

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ladpet_Week13_Think-Pair-Share_Spot-the-Nine-Mistakes_CA48_2026-11-04.html */
export function exportFileName(preset: Preset, pub: Pub, d = new Date()): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9฀-๿ &-]+/g, ' ').trim().replace(/\s+/g, '-').replace(/&/g, 'and');
  const parts = preset.id === 'custom' ? [pub.title] : [preset.week.replace(/\s+/g, ''), preset.activity, preset.title];
  return ['Ladpet', ...parts.map(clean), clean(pub.section), localDate(d)].filter(Boolean).join('_') + '.html';
}

export function buildWallHtml(opts: {
  preset: Preset;
  pub: Pub;
  teams: [string, Team][];
  posts: Record<string, Post>;
  photos: Record<string, string | null>;
  date?: Date;
}): string {
  const {preset, pub, teams, posts, photos} = opts;
  const date = opts.date ?? new Date();
  const posted = teams.filter(([id]) => posts[id]);
  const when = date.toLocaleString('en-GB', {dateStyle: 'full', timeStyle: 'short'});
  const accent = preset.theme === 'teal' ? '#0f766e' : '#4f46e5';
  const card = ([id, t]: [string, Team]) => {
    const p = posts[id];
    const parts: string[] = [];
    const img = photos[id];
    const f = (i: number) => p.fields?.[`f${i}`];
    if (img) parts.push(`<img src="${img}" alt="${esc(t.name)}">`);
    if (preset.frames) parts.push(`<p class="para">${esc(preset.frames.map((_, i) => f(i)).filter(Boolean).join(' '))}</p>`);
    if (preset.builder) {
      const rows = preset.builder.map((b, i) => (f(i) ? `<dt>${esc(b.label)}</dt><dd>${esc(f(i)!)}</dd>` : '')).join('');
      if (rows) parts.push(`<dl>${rows}</dl>`);
    }
    if (preset.fields) parts.push(...preset.fields.items.map((_, i) => (f(i) ? `<p class="${i ? 'more' : 'best'}">${esc(f(i)!)}</p>` : '')));
    if (p.text) parts.push(`<p class="text">${esc(p.text)}</p>`);
    return `<article><h2>${esc(t.name)}</h2>${parts.join('')}</article>`;
  };
  const accentHi = preset.theme === 'teal' ? '#d9480f' : '#db2777';
  const cards = preset.charts
    ? preset.charts
        .map((c, ci) => {
          const group = posted.filter(([id]) => posts[id].choice === ci);
          return group.length
            ? `<section class="chart"><div class="chart-head">Chart ${ci + 1} · ${esc(c.title)}</div>${chartSvg(c, {accent: accentHi})}</section>\n${group.map(card).join('\n')}`
            : '';
        })
        .join('\n')
    : posted.map(card).join('\n');
  const missing = teams.filter(([id]) => !posts[id]).map(([, t]) => esc(t.name));
  const fixes =
    preset.id === 'wk13-spot9'
      ? `<section class="fixes"><h2>Check: all nine mistakes</h2><p class="good">${rich(GOOD_P)}</p><ol>${NINE.map((n) => `<li>${rich(n)}</li>`).join('')}</ol></section>`
      : '';
  const {lead, title} = titleParts(preset, pub.title);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`Ladpet · ${fullTitle(preset, pub.title)} — ${pub.section} — ${localDate(date)}`)}</title>
<style>
:root{--accent:${accent}}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Sarabun,'Leelawadee UI',Thonburi,sans-serif;background:#f5f6fc;color:#1e1b4b}
header{background:var(--accent);color:#fff;padding:20px 28px}
header .k{opacity:.85;font-size:14px;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
header h1{margin:4px 0 6px;font-size:28px}header h1 .lead{font-weight:600;opacity:.85}
header p{margin:0;opacity:.9}
main{padding:20px 28px;columns:4 280px;column-gap:16px}
article{break-inside:avoid;background:#fff;border:1px solid #e3e5f1;border-radius:14px;padding:12px 14px;margin:0 0 16px;box-shadow:none}
article h2{font-size:17px;margin:0 0 8px;color:var(--accent)}
article img{width:100%;border-radius:8px;border:1px solid #e3e5f1;display:block;margin-bottom:8px}
.tag{font-size:13px;font-weight:700;color:#475569;margin-bottom:6px}
.best{font-size:17px;font-weight:600;margin:4px 0}.more{margin:4px 0;color:#334155}
dl{margin:0}dt{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-top:6px}dd{margin:2px 0 0}
.text{white-space:pre-wrap;margin:4px 0}
.para{margin:2px 0;line-height:1.5}
section.chart{break-inside:avoid;background:#fff;border:2px solid var(--accent);border-radius:14px;padding:10px 12px;margin:0 0 16px}
.chart-head{font-weight:800;font-size:15px;margin-bottom:4px}
.fixes{margin:0 28px 28px;background:#fff;border:1px solid #e3e5f1;border-radius:14px;padding:14px 18px}
mark{background:none;color:#db2777;font-weight:700}
footer{padding:0 28px 28px;color:#64748b;font-size:13px}
@media print{main{columns:3}article{border-color:#ccc}}
</style></head><body>
<header><div class="k">Ladpet · ${esc(pub.section)}</div><h1>${lead ? `<span class="lead">${esc(lead)}</span> ` : ''}${esc(title)}</h1>
<p>${esc(when)} · ${posted.length} ${posted.length === 1 ? 'post' : 'posts'}${missing.length ? ` · not posted: ${missing.join(', ')}` : ''}</p></header>
${pub.prompt ? `<p style="margin:16px 28px 0;font-size:18px">${esc(pub.prompt)}</p>` : ''}
<main>
${cards || '<p>No posts.</p>'}
</main>
${fixes}
<footer>Saved from Ladpet (GE5072) · names are the nicknames students chose.</footer>
</body></html>
`;
}

export function download(name: string, html: string) {
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
