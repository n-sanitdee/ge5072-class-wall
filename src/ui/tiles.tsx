// The wall as tiles (Mew, 27 Oct 2026): every post is one tile and the projector fits ALL of them on the screen
// at once — small text is fine, photos get the most room.
import {type CSSProperties, type ReactNode, type RefObject, useLayoutEffect, useRef, useState} from 'react';
import type {Preset} from '../lib/presets.ts';
import type {Post} from '../lib/types.ts';
import {defaultGroupName} from '../lib/wall-client.ts';
import {DbImage, PostBody} from './common.tsx';

/** Does the post have any words (not only a photo)? */
export function hasWords(post: Post): boolean {
  return !!post.text?.trim() || Object.keys(post.fields ?? {}).some((k) => k.startsWith('f'));
}

/** The members line, unless the group's name already is the members' names. */
export function membersLine(name: string, members?: string[]): string {
  if (!members?.length || defaultGroupName(members) === name) return '';
  return members.join(', ');
}

/** Largest font size (px) at which the element's content still fits inside it. */
function useFitText(ref: RefObject<HTMLElement | null>, on: boolean, key: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!on) {
      // phone: the tile keeps its size; just mark a post that is cut off (tap for all of it)
      el.style.fontSize = '';
      el.classList.toggle('clipped', el.scrollHeight > el.clientHeight + 1);
      return;
    }
    const fit = () => {
      if (!el.clientHeight) return;
      const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
      let lo = 7;
      let hi = 34;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${lo}px`;
      // still too long at the smallest size: fade the end out (click the tile for the big view)
      el.classList.toggle('clipped', !fits());
    };
    fit();
    let w = el.clientWidth;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w && el.clientHeight === h) return;
      w = el.clientWidth;
      h = el.clientHeight;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on, key]);
}

export function Tile({
  name,
  members,
  post,
  preset,
  thumb,
  tint,
  you,
  fit,
  onClick,
  style,
  extra,
}: {
  name: string;
  members?: string[];
  post: Post;
  preset: Preset;
  thumb?: () => Promise<string | null>;
  tint: string;
  you?: boolean;
  /** Projector: the text shrinks to fit the tile. Phone: the tile grows with its text. */
  fit?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  extra?: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const words = hasWords(post);
  const who = membersLine(name, members);
  useFitText(body, !!fit && words, JSON.stringify([post.text, post.fields, post.photo]));
  const photo = post.photo && thumb;
  return (
    <article
      className={`ptile ${fit ? 'fit' : ''} ${photo ? 'has-photo' : ''} ${photo && !words ? 'photo-only' : ''} ${you ? 'mine' : ''}`}
      style={{background: tint, ...style}}
      onClick={onClick}
    >
      <header className="ptile-head">
        <b>{name}</b>
        {you && <span className="you"> · you</span>}
        {who && <span className="ptile-members">{who}</span>}
      </header>
      {photo && <DbImage key={post.at} load={thumb} alt={name} className="ptile-img" lazy={!fit} />}
      {words && (
        <div className="ptile-body" ref={body}>
          <PostBody post={post} preset={preset} />
        </div>
      )}
      {extra}
    </article>
  );
}

/** `chars` = how much text the tile holds (the layout gives longer posts more room). */
type Item = {id: string; photo: boolean; chars: number};
type Place = {r: number; c: number; s: number};

/** How many characters of room a photo is worth: photos come first (Mew, 27 Oct 2026). */
const PHOTO_ROOM = 1400;

export function itemFor(id: string, post: Post): Item {
  const chars = (post.text?.length ?? 0) + Object.entries(post.fields ?? {}).reduce((n, [k, v]) => n + (k.startsWith('f') ? v.length : 0), 0);
  return {id, photo: !!post.photo, chars};
}

/** Dense packing on a `cols`-wide grid; photo tiles take 2 × 2 cells when `span`. */
function pack(items: Item[], cols: number, span: boolean): {places: Place[]; rows: number} {
  const occ: boolean[][] = [];
  const free = (r: number, c: number, s: number) => {
    for (let i = r; i < r + s; i++) for (let j = c; j < c + s; j++) if (occ[i]?.[j]) return false;
    return true;
  };
  let rows = 0;
  const places = items.map((it) => {
    const s = span && it.photo && cols >= 2 ? 2 : 1;
    for (let r = 0; ; r++) {
      for (let c = 0; c + s <= cols; c++) {
        if (!free(r, c, s)) continue;
        for (let i = r; i < r + s; i++) for (let j = c; j < c + s; j++) (occ[i] ??= [])[j] = true;
        rows = Math.max(rows, r + s);
        return {r, c, s};
      }
    }
  });
  return {places, rows};
}

/**
 * Pick the grid where the most crowded tile still has the most room per character (so the smallest text on the
 * wall is as big as it can be). Photos count as PHOTO_ROOM characters, so they get 2 × 2 cells when they can.
 */
export function layoutTiles(items: Item[], w: number, h: number, gap: number) {
  let best = {score: -1, cols: 1, rows: 1, places: [] as Place[]};
  const photos = items.some((i) => i.photo);
  for (const span of photos ? [true, false] : [false]) {
    for (let cols = 1; cols <= Math.min(16, items.length * (span ? 2 : 1)); cols++) {
      const {places, rows} = pack(items, cols, span);
      const cw = (w - gap * (cols - 1)) / cols;
      const ch = (h - gap * (rows - 1)) / rows;
      if (cw < 60 || ch < 50) continue;
      let score = Infinity;
      items.forEach((it, i) => {
        const s = places[i].s;
        const tw = cw * s + gap * (s - 1);
        const th = ch * s + gap * (s - 1) - 30; // the name line
        // very tall, narrow tiles read badly: count at most 1.4 × the width as usable height; a photo in a wide,
        // short tile shrinks to a strip, so for photos count at most 1.8 × the height as usable width (1920 px
        // projector, 28 Oct 2026)
        const room = (it.photo ? Math.min(tw, th * 1.8) : tw) * Math.min(th, tw * 1.4);
        const need = Math.max(120, it.chars) + (it.photo ? PHOTO_ROOM : 0);
        score = Math.min(score, room / need);
      });
      if (score > best.score) best = {score, cols, rows, places};
    }
  }
  if (best.score < 0) {
    // no room measured yet: a plain square-ish grid until the next measurement
    const cols = Math.ceil(Math.sqrt(items.length));
    best = {score: 0, cols, ...pack(items, cols, false)};
  }
  return best;
}

/** All tiles on one screen, no scrolling. */
export function FitBoard({items, render, className}: {items: Item[]; render: (id: string, style: CSSProperties) => ReactNode; className?: string}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({w: el.clientWidth, h: el.clientHeight});
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = items.length > 30 ? 6 : items.length > 12 ? 10 : 14;
  const lay = size.w && items.length ? layoutTiles(items, size.w, size.h, gap) : null;
  return (
    <div
      ref={box}
      className={`fit-board ${className ?? ''}`}
      style={lay ? {gap, gridTemplateColumns: `repeat(${lay.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${lay.rows}, minmax(0, 1fr))`} : undefined}
    >
      {lay &&
        items.map((it, i) => {
          const p = lay.places[i];
          return render(it.id, {gridRow: `${p.r + 1} / span ${p.s}`, gridColumn: `${p.c + 1} / span ${p.s}`});
        })}
    </div>
  );
}
