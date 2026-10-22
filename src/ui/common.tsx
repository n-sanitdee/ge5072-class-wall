import {type ReactNode, useEffect, useRef, useState} from 'react';
import {BAD_P, type Chart, type Preset} from '../lib/presets.ts';
import {chartSvg} from './chart-svg.ts';
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

export function LineChart({chart, compact}: {chart: Chart; compact?: boolean}) {
  return <div className="chart" dangerouslySetInnerHTML={{__html: chartSvg(chart, {compact})}} />;
}

/** A chart with its title on a card. */
export function ChartCard({chart, compact, label}: {chart: Chart; compact?: boolean; label?: string}) {
  return (
    <div className="chart-card">
      {label && <div className="chart-label">{label}</div>}
      <div className="chart-title">{chart.title}</div>
      <LineChart chart={chart} compact={compact} />
    </div>
  );
}

/**
 * Image from a loader (thumbs and photos come from the database on demand). With `lazy`, it loads only when it
 * scrolls near the screen, so a phone doesn't pull every thumbnail of the wall the moment it opens.
 */
export function DbImage({load, alt, className, onClick, lazy}: {load: () => Promise<string | null>; alt: string; className?: string; onClick?: () => void; lazy?: boolean}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  const [near, setNear] = useState(!lazy || typeof IntersectionObserver === 'undefined');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (near || !box.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), {rootMargin: '600px 0px'});
    io.observe(box.current);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let live = true;
    load().then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [load, near]);
  if (src === undefined) return <div ref={box} className={`img-loading ${className ?? ''}`} />;
  if (src === null) return <div className={`img-missing ${className ?? ''}`}>Photo unavailable</div>;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

/** The finished sentences of a post, as everyone sees them (the photo is handled by the caller). */
export function PostBody({post, preset, big, chart}: {post: Post; preset: Preset; big?: boolean; chart?: boolean}) {
  const f = (i: number) => post.fields?.[`f${i}`];
  const c = preset.charts && typeof post.choice === 'number' ? preset.charts[post.choice] : null;
  return (
    <div className={`post-body ${big ? 'big' : ''}`}>
      {/* Wk13 profile: one paragraph (Mew, 22 Oct 2026) */}
      {preset.frames && <p className="paragraph">{preset.frames.map((_, i) => f(i)).filter(Boolean).join(' ')}</p>}
      {preset.builder && (
        <dl className="branches">
          {preset.builder.map((b, i) =>
            f(i) ? (
              <div key={b.label} className="branch">
                <dt>{b.label}</dt>
                <dd>{f(i)}</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
      {preset.fields && (
        <>
          {chart && c && <ChartCard chart={c} compact />}
          {preset.fields.items.map((_, i) =>
            f(i) ? (
              <p key={i} className={i === 0 ? 'best' : 'more'}>
                {f(i)}
              </p>
            ) : null,
          )}
        </>
      )}
      {post.text && <p className="post-text">{post.text}</p>}
    </div>
  );
}

/** Rotating card colours (Padlet-like), light enough for dark text. */
export const CARD_TINTS = ['#fde2ec', '#e0e7ff', '#dcfce7', '#fef3c7', '#e0f2fe', '#f3e8ff', '#ffedd5', '#ccfbf1'];
