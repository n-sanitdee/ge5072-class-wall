import {type ReactNode, useEffect, useState} from 'react';
import {BAD_P, type Chart, type Preset} from '../lib/presets.ts';
import type {Post} from '../lib/types.ts';

/** Mew named it, 22 Oct 2026. */
export const APP_NAME = 'Ladpet';

/** English line with the Thai under it. */
export function Bi({en, th, className}: {en: ReactNode; th: ReactNode; className?: string}) {
  return (
    <span className={`bi ${className ?? ''}`}>
      <span className="en">{en}</span>
      <span className="th" lang="th">
        {th}
      </span>
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

/** `**bold**` → <b>, `___` stays a blank. */
export function Rich({text, mark = 'b'}: {text: string; mark?: 'b' | 'fix'}) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          mark === 'fix' ? (
            <mark key={i} className="fix">
              {p}
            </mark>
          ) : (
            <b key={i}>{p}</b>
          )
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The Wk13 passage on a clean card, sized for a phone screenshot. */
export function Passage() {
  return (
    <div className="passage" lang="en">
      <div className="passage-tag">Company profile</div>
      <p>{BAD_P}</p>
    </div>
  );
}

/** One line chart (SVG), as on the Week 14 slides. */
export function LineChart({chart, compact}: {chart: Chart; compact?: boolean}) {
  const W = 360;
  const H = compact ? 190 : 230;
  const fmt = (v: number) => (chart.comma ? v.toLocaleString('en-US') : String(v));
  const left = 14 + Math.max(...rangeSteps(chart).map((v) => fmt(v).length)) * 7.2;
  const right = W - 12;
  const top = 26;
  const bottom = H - 26;
  const n = chart.values.length;
  const x = (i: number) => left + ((i + 0.5) * (right - left)) / n;
  const y = (v: number) => bottom - ((v - chart.lo) / (chart.hi - chart.lo)) * (bottom - top);
  const pts = chart.values.map((v, i) => [x(i), y(v)] as const);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
      {rangeSteps(chart).map((v) => (
        <g key={v}>
          <line x1={left} x2={right} y1={y(v)} y2={y(v)} className="grid" />
          <text x={left - 6} y={y(v) + 4} textAnchor="end" className="ylab">
            {fmt(v)}
          </text>
        </g>
      ))}
      {chart.labels.map((l, i) => (
        <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className="xlab">
          {l}
        </text>
      ))}
      <polyline points={pts.map((p) => p.join(',')).join(' ')} className="line" />
      {pts.map(([px, py], i) => {
        const v = chart.values[i];
        const nb = [chart.values[i - 1], chart.values[i + 1]].filter((u) => u !== undefined);
        const below = nb.some((u) => u - v > 0.08 * (chart.hi - chart.lo)) && bottom - py > 22;
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={4.5} className="dot" />
            <text x={px} y={below ? py + 17 : py - 9} textAnchor="middle" className="vlab">
              {fmt(v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function rangeSteps(c: Chart): number[] {
  const out: number[] = [];
  for (let v = c.lo; v <= c.hi; v += c.step) out.push(v);
  return out;
}

/** Lazy image from a loader (thumbs and photos come from the database on demand). */
export function DbImage({load, alt, className, onClick}: {load: () => Promise<string | null>; alt: string; className?: string; onClick?: () => void}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    load().then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [load]);
  if (src === undefined) return <div className={`img-loading ${className ?? ''}`} />;
  if (src === null) return <div className={`img-missing ${className ?? ''}`}>Photo unavailable</div>;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

/** The text part of a post (photo handled by the caller). */
export function PostBody({post, preset, big}: {post: Post; preset: Preset; big?: boolean}) {
  const fields = preset.fields?.items ?? [];
  const chart = preset.charts && typeof post.choice === 'number' ? preset.charts[post.choice] : null;
  const filled = fields.map((f, i) => [f, post.fields?.[`f${i}`]] as const).filter(([, v]) => v);
  return (
    <div className={`post-body ${big ? 'big' : ''}`}>
      {chart && <div className="chart-tag">📈 {chart.title}</div>}
      {preset.id === 'wk14-chart'
        ? filled.map(([, v], i) => (
            <p key={i} className={i === 0 ? 'best' : 'more'}>
              {v}
            </p>
          ))
        : filled.length > 0 && (
            <dl className="branches">
              {filled.map(([f, v]) => (
                <div key={f.label} className="branch">
                  <dt>{f.label}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
      {post.text && <p className="post-text">{post.text}</p>}
    </div>
  );
}

/** Rotating card colours (Padlet-like), light enough for dark text. */
export const CARD_TINTS = ['#fde2ec', '#e0e7ff', '#dcfce7', '#fef3c7', '#e0f2fe', '#f3e8ff', '#ffedd5', '#ccfbf1'];
