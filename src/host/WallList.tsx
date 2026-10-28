// The host page's "Your walls" list (Mew, 28 Oct 2026): every wall, newest first, Open or Closed. Open walls are
// entered live (resumed if this computer opened them, view-only if not); closed walls show their saved board from
// the ge5072-ladpet-boards site. Sources: wallIndex (walls still open), the boards site's walls.json (saved boards,
// plus open walls that were taken off wallIndex so the 3 h cleanup keeps them), and this computer's history.
// A closed wall with no saved board is not listed, and drops out of the history (Mew, 28 Oct 2026).
import {type Database, get, ref} from 'firebase/database';
import {useEffect, useState} from 'react';
import {fullTitle, getPreset} from '../lib/presets.ts';
import type {Pub} from '../lib/types.ts';
import {WallHost} from '../lib/wall-host.ts';
import {Spinner, formatCode} from '../ui/common.tsx';

export const BOARDS = 'https://n-sanitdee.github.io/ge5072-ladpet-boards/';

export type WallRow = {
  key: string;
  when: number;
  section: string;
  title: string;
  open: boolean;
  /** Open, but the host pressed Close joining. */
  locked?: boolean;
  code?: string;
  /** This computer opened it, so it can be resumed with the host buttons. */
  mine?: boolean;
  /** Saved board page, relative to BOARDS. */
  board?: string;
};

type Saved = {week: string; section: string; title: string; when: string | null; board?: string; wall?: string};
type Local = {code: string; section: string; title: string; createdAt: number};

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

async function loadRows(db: Database, uid: string, history: Local[]): Promise<{rows: WallRow[]; forget: string[]}> {
  const [open, saved] = await Promise.all([
    WallHost.listOpen(db).catch(() => []),
    fetch(`${BOARDS}walls.json`, {cache: 'no-store'})
      .then((r) => (r.ok ? (r.json() as Promise<Saved[]>) : []))
      .catch(() => [] as Saved[]),
  ]);
  const rows: WallRow[] = open.map((w) => ({
    key: w.code,
    when: w.createdAt,
    section: w.pub.section,
    title: fullTitle(getPreset(w.pub.preset), w.pub.title),
    open: true,
    locked: !!w.pub.locked,
    code: w.code,
    mine: w.hostUid === uid,
  }));
  const byCode = new Map(rows.map((r) => [r.code!, r]));

  for (const s of saved) {
    const when = s.when ? Date.parse(s.when) : 0;
    const row = s.wall ? byCode.get(s.wall) : undefined;
    if (row) {
      row.board ??= s.board;
      continue;
    }
    let pub: Pub | null = null;
    let meta: {hostUid?: string; createdAt?: number} | null = null;
    if (s.wall) {
      pub = (await get(ref(db, `walls/${s.wall}/pub`)).catch(() => null))?.val() ?? null;
      if (pub && !pub.ended) meta = (await get(ref(db, `walls/${s.wall}/meta`)).catch(() => null))?.val() ?? null;
    }
    const isOpen = !!pub && !pub.ended;
    if (!isOpen && !s.board) continue; // its wall is gone and no board was saved
    const r: WallRow = {
      key: s.wall ?? `${s.week}-${s.section}`,
      when: meta?.createdAt ?? when,
      section: s.section,
      title: isOpen ? fullTitle(getPreset(pub!.preset), pub!.title) : s.title,
      open: isOpen,
      locked: isOpen && !!pub!.locked,
      code: s.wall,
      mine: isOpen && meta?.hostUid === uid,
      board: s.board,
    };
    rows.push(r);
    if (s.wall) byCode.set(s.wall, r);
  }

  // This computer's walls that are neither open nor saved as a board are finished and gone: forget them.
  const forget = history
    .filter((h) => !byCode.has(h.code) && !rows.some((r) => !r.open && r.section === h.section && sameDay(r.when, h.createdAt)))
    .map((h) => h.code);
  return {rows: rows.sort((a, b) => b.when - a.when), forget};
}

function when(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).replace(',', '');
}

export function WallList({
  db,
  uid,
  history,
  onEnter,
  onBoard,
  onForget,
}: {
  db: Database;
  uid: string;
  history: Local[];
  onEnter: (code: string, mine: boolean) => Promise<boolean>;
  onBoard: (row: WallRow) => void;
  onForget: (codes: string[]) => void;
}) {
  const [rows, setRows] = useState<WallRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    loadRows(db, uid, history).then(({rows: r, forget}) => {
      if (forget.length) onForget(forget);
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [db, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enter(r: WallRow) {
    if (r.open && r.code && !gone.has(r.key)) {
      setBusy(r.key);
      const ok = await onEnter(r.code, !!r.mine);
      setBusy('');
      if (!ok) {
        // it ended meanwhile: show it as closed, or drop it if no board was saved
        setGone(new Set(gone).add(r.key));
        if (!r.board) {
          setRows((rs) => rs?.filter((x) => x.key !== r.key) ?? rs);
          if (r.code) onForget([r.code]);
        }
      }
      return;
    }
    if (r.board) onBoard(r);
  }

  return (
    <section className="wall-list">
      <div className="wall-list-head">
        <h2>Your walls</h2>
        <a className="btn primary" href="#new-wall" onClick={(e) => (e.preventDefault(), document.getElementById('new-wall')?.scrollIntoView({behavior: 'smooth'}))}>
          + New wall
        </a>
      </div>
      {!rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="muted">No walls yet.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const open = r.open && !gone.has(r.key);
            const can = open || !!r.board;
            return (
              <li key={r.key} className={open ? 'open' : 'closed'}>
                <span className="wl-when">{when(r.when)}</span>
                <span className="wl-sec">{r.section}</span>
                <span className="wl-title">
                  {r.title}
                  {open && r.code && <span className="wl-code"> · {formatCode(r.code)}</span>}
                </span>
                <span className={`wl-status ${open ? (r.locked ? 'locked' : 'open') : 'closed'}`}>
                  {open ? (r.locked ? '◐ Joining closed' : '● Open') : '○ Closed'}
                </span>
                <button className={`btn small ${open ? 'primary' : ''}`} disabled={!can || !!busy} onClick={() => enter(r)} title={can ? undefined : 'No saved board for this wall'}>
                  {busy === r.key ? 'Opening…' : can ? (open && !r.mine ? 'Enter (view)' : 'Enter') : 'Not saved'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A closed wall: its saved board, with the way back. */
export function BoardView({row, onBack}: {row: WallRow; onBack: () => void}) {
  useEffect(() => {
    document.title = `${row.title} · ${row.section} · Ladpet`;
  }, [row]);
  return (
    <div className={`host board-view sec-${row.section}`}>
      <header className="board-view-bar">
        <button className="back-link" onClick={onBack}>
          ← Host page
        </button>
        <span className="chip">{row.section}</span>
        <span className="board-view-title">{row.title}</span>
        <span className="wl-status closed">○ Closed</span>
      </header>
      <iframe src={`${BOARDS}${row.board}`} title={`${row.section} saved board`} allow="fullscreen" />
    </div>
  );
}
