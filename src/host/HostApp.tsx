import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {backend, configured} from '../backend.ts';
import {buildWallHtml, download, exportFileName} from '../lib/export.ts';
import {openDatabase, signInHost} from '../lib/fb.ts';
import {GOOD_P, NINE, PRESETS, type Preset, fullTitle, getPreset, titleParts, whoWord} from '../lib/presets.ts';
import {SECTIONS, type PresetId} from '../lib/types.ts';
import {type HostView, WallHost, orderedTeams, revealBlocker} from '../lib/wall-host.ts';
import {APP_NAME, CARD_TINTS, ChartCard, DbImage, PostBody, Rich, Spinner, formatCode} from '../ui/common.tsx';
import {Qr} from '../ui/Qr.tsx';

const SAVED = 'cw:host';
const store = {
  get(): {code: string; section?: string} | null {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? 'null');
    } catch {
      return null;
    }
  },
  set(v: {code: string; section?: string} | null) {
    try {
      if (v) localStorage.setItem(SAVED, JSON.stringify(v));
      else localStorage.removeItem(SAVED);
    } catch {
      /* private mode */
    }
  },
  lastSection(): string {
    try {
      return localStorage.getItem('cw:section') ?? '';
    } catch {
      return '';
    }
  },
  rememberSection(s: string) {
    try {
      localStorage.setItem('cw:section', s);
    } catch {
      /* ignore */
    }
  },
};

function studentUrl(code?: string): string {
  const base = `${location.origin}${location.pathname}`;
  return code ? `${base}?w=${code}` : base;
}

export default function HostApp() {
  const conn = useMemo(() => (configured ? openDatabase(backend) : null), []);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<WallHost | null>(null);
  const [view, setView] = useState<HostView | null>(null);

  useEffect(() => {
    document.title = `${APP_NAME} · teacher`;
    if (!conn) return;
    signInHost(conn.app, backend)
      .then((id) => {
        setUid(id);
        // Best effort: delete walls nobody finished (older than 3 h).
        WallHost.cleanupStale(conn.db, Date.now()).catch(() => {});
      })
      .catch((e) => setError(`Could not sign in: ${e.message ?? e}`));
  }, [conn]);

  useEffect(() => {
    if (!host) return setView(null);
    return host.subscribe(setView);
  }, [host]);

  if (!conn) return <div className="host screen center"><p>Firebase is not configured.</p></div>;
  if (error) return <div className="host screen center"><p className="error">{error}</p></div>;
  if (!uid) return <div className="host screen center"><Spinner /></div>;
  if (host && view)
    return (
      <WallScreen
        host={host}
        view={view}
        onClose={() => {
          store.set(null);
          setHost(null);
        }}
      />
    );
  return (
    <Setup
      onOpen={async (w) => {
        const h = await WallHost.create(conn.db, uid, w);
        store.set({code: h.view.code, section: w.section});
        store.rememberSection(w.section);
        setHost(h);
      }}
      onResume={async (code) => {
        const h = await WallHost.resume(conn.db, uid, code);
        if (!h) {
          store.set(null);
          return false;
        }
        setHost(h);
        return true;
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────── setup
function Setup({
  onOpen,
  onResume,
}: {
  onOpen: (w: {preset: PresetId; section: string; title?: string; prompt?: string; photo?: boolean}) => Promise<void>;
  onResume: (code: string) => Promise<boolean>;
}) {
  const [section, setSection] = useState(store.lastSection());
  const [presetId, setPresetId] = useState<PresetId | ''>('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [photo, setPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const saved = store.get();
  const [resumeGone, setResumeGone] = useState(false);
  const preset = presetId ? getPreset(presetId) : null;
  const ready = section && preset && (preset.id !== 'custom' || (title.trim() && prompt.trim()));

  async function open() {
    if (!ready || !preset) return;
    setBusy(true);
    setErr('');
    try {
      await onOpen({
        preset: preset.id,
        section,
        ...(preset.id === 'custom' ? {title: title.trim(), prompt: prompt.trim(), photo} : {}),
      });
    } catch (e) {
      setErr(`Could not open the wall: ${(e as Error).message ?? e}`);
      setBusy(false);
    }
  }

  const groups: [string, Preset[]][] = [
    ['Week 13 · Company Profile', PRESETS.filter((p) => p.week === 'Week 13')],
    ['Week 14 · Describing Trends', PRESETS.filter((p) => p.week === 'Week 14')],
    ['Any lesson', PRESETS.filter((p) => p.id === 'custom')],
  ];

  return (
    <div className="host setup">
      <header className="setup-head">
        <Logo />
        <div>
          <h1>{APP_NAME}</h1>
          <p>GE5072 class wall · everyone posts from their phone. Posts stay hidden — only names show — until everyone has posted (the custom wall shows posts straight away).</p>
        </div>
      </header>

      {saved && !resumeGone && (
        <div className="resume">
          <span>
            Wall <b>{formatCode(saved.code)}</b>
            {saved.section ? ` (${saved.section})` : ''} is still open on this computer.
          </span>
          <button
            className="btn primary"
            onClick={async () => {
              setBusy(true);
              if (!(await onResume(saved.code))) setResumeGone(true);
              setBusy(false);
            }}
            disabled={busy}
          >
            Resume wall
          </button>
        </div>
      )}

      <section>
        <h2>
          <span className="step-no">1</span> Section
        </h2>
        <div className="sections">
          {SECTIONS.map((s) => (
            <button key={s} className={`section-btn ${section === s ? 'on' : ''}`} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>
          <span className="step-no">2</span> Activity
        </h2>
        {groups.map(([label, list]) => (
          <div key={label} className="preset-group">
            <h3>{label}</h3>
            <div className="presets">
              {list.map((p) => (
                <button
                  key={p.id}
                  className={`preset-card theme-${p.theme} ${presetId === p.id ? 'on' : ''}`}
                  onClick={() => setPresetId(p.id)}
                >
                  <span className="preset-kind">{p.id === 'custom' ? p.activity : `${p.week} · ${p.activity}:`}</span>
                  <span className="preset-title">{p.id === 'custom' ? 'Your own question' : p.title}</span>
                  <span className="preset-meta">
                    {p.id === 'custom'
                      ? 'your title + question · posts show straight away'
                      : p.charts
                        ? 'Pairs · Ladpet gives each name a chart'
                        : p.frames
                          ? 'Project groups · fill-in sentences → one paragraph'
                          : p.builder
                            ? 'Project groups · tap-to-build trend sentences'
                            : `${p.who === 'group' ? 'Project groups' : 'Pairs'} · ${p.photo ? 'photo or text' : 'text only'}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {preset?.id === 'custom' && (
          <div className="custom">
            <label>
              Title (on the projector)
              <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Best slogan for our café" />
            </label>
            <label>
              Question for the phones
              <textarea value={prompt} maxLength={600} rows={3} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Write one slogan for the UTCC Coffee Corner." />
            </label>
            <label className="check">
              <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Allow a photo with the answer
            </label>
          </div>
        )}
      </section>

      <div className="setup-go">
        <button className="btn primary big" disabled={!ready || busy} onClick={open}>
          {busy ? 'Opening…' : 'Open Ladpet'}
        </button>
        {!section && <span className="muted">Pick your section.</span>}
        {section && !preset && <span className="muted">Pick an activity.</span>}
        {err && <span className="error">{err}</span>}
      </div>
      <p className="setup-foot">
        Students scan the Ladpet QR on the next screen and type a name — nicknames only, no student IDs. Everything is
        deleted when you press Finish &amp; delete, or 3 hours after the Ladpet was opened.
      </p>
    </div>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <rect x="9" y="10" width="20" height="24" rx="4" fill="#fde2ec" />
      <rect x="35" y="10" width="20" height="16" rx="4" fill="#fef3c7" />
      <rect x="9" y="39" width="20" height="15" rx="4" fill="#dcfce7" />
      <rect x="35" y="31" width="20" height="23" rx="4" fill="#e0f2fe" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── the wall (projector)
function WallScreen({host, view, onClose}: {host: WallHost; view: HostView; onClose: () => void}) {
  const preset = getPreset(view.pub.preset);
  const teams = orderedTeams(view.teams);
  const live = !!view.pub.live;
  const shown = view.pub.revealed || live;
  // Wk14 chart: cards sit under their chart, so the board and the big view go chart by chart
  const postedIds = teams
    .filter(([id]) => view.posts[id])
    .map(([id]) => id)
    .sort((x, y) => (preset.charts ? (view.posts[x].choice ?? 99) - (view.posts[y].choice ?? 99) : 0));
  const blocker = revealBlocker(view);
  const [spot, setSpot] = useState<number | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [joinPanel, setJoinPanel] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumbs = useMemo(() => new Map<string, () => Promise<string | null>>(), [host]);
  const thumbOf = (id: string) => {
    const key = `${id}@${view.posts[id]?.at}`;
    let l = thumbs.get(key);
    if (!l) thumbs.set(key, (l = () => host.thumb(id)));
    return l;
  };

  useEffect(() => {
    document.title = `${fullTitle(preset, view.pub.title)} · ${view.pub.section} · ${APP_NAME}`;
  }, [preset, view.pub.title, view.pub.section]);

  async function save() {
    setSaving(true);
    try {
      const photos: Record<string, string | null> = {};
      await Promise.all(postedIds.filter((id) => view.posts[id].photo).map(async (id) => (photos[id] = await host.photo(id))));
      download(exportFileName(preset, view.pub), buildWallHtml({preset, pub: view.pub, teams, posts: view.posts, photos}));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    const msg =
      saved || !postedIds.length || !shown
        ? 'Finish and delete this Ladpet? Phones will show "This wall has ended".'
        : 'You have not saved this Ladpet yet. Finish and delete it anyway?';
    if (!confirm(msg)) return;
    setBusy(true);
    await host.finish().catch(() => {});
    onClose();
  }

  const card = (id: string, i: number) => {
    const t = view.teams[id];
    const p = view.posts[id];
    return (
      <article key={id} className="card" style={{background: CARD_TINTS[i % CARD_TINTS.length]}} onClick={() => setSpot(postedIds.indexOf(id))}>
        <h2>{t.name}</h2>
        {p.photo && <DbImage load={thumbOf(id)} alt={t.name} className="thumb" />}
        <PostBody post={p} preset={preset} />
      </article>
    );
  };
  const notPosted = teams.filter(([id]) => !view.posts[id]).map(([, t]) => t.name);

  const joinAside = (
    <aside className="join-panel">
      <Qr text={studentUrl(view.code)} className="qr" />
      <div className="join-url">{studentUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>
      <div className="join-code-label">Ladpet code</div>
      <div className="join-code">{formatCode(view.code)}</div>
      <ol className="join-steps">
        <li>Scan the Ladpet QR</li>
        <li>Type your name{preset.who === 'pair' ? ' (a pair: both nicknames)' : preset.who === 'group' ? ' (a group: your group name)' : ''}</li>
        <li>
          {preset.id === 'wk13-spot9'
            ? 'Post one marked screenshot per pair'
            : preset.charts
              ? 'Ladpet gives you a chart — post your best sentence'
              : live
                ? 'Post — it appears here straight away'
                : `Post${preset.who === 'anyone' ? '' : ` one answer per ${whoWord(preset)}`}`}
        </li>
      </ol>
    </aside>
  );

  return (
    <div className={`host wall-screen theme-${preset.theme}`}>
      <header className="wall-bar">
        <div className="wall-title">
          <div className="kicker">
            {APP_NAME}
            <span className="chip">{view.pub.section}</span>
          </div>
          <Title preset={preset} pubTitle={view.pub.title} />
        </div>
        <div className="wall-actions">
          <span className={`conn ${view.connected ? 'ok' : 'off'}`} title={view.connected ? 'Connected' : 'Offline — reconnecting'}>
            {view.connected ? '●' : '○ offline'}
          </span>
          {view.pub.revealed && preset.id === 'wk13-spot9' && (
            <button className="btn" onClick={() => host.setFixes(!view.pub.fixes)}>
              {view.pub.fixes ? 'Hide the fixes' : 'Show the nine fixes'}
            </button>
          )}
          {live && (
            <button className="btn" onClick={() => host.setLocked(!view.pub.locked)}>
              {view.pub.locked ? 'Open joining' : 'Close joining'}
            </button>
          )}
          {(view.pub.revealed || (live && !joinPanel)) && (
            <button className="btn" onClick={() => (live ? setJoinPanel(true) : setShowQr(true))}>
              QR
            </button>
          )}
          {shown && (
            <button className="btn" onClick={save} disabled={saving || !postedIds.length}>
              {saving ? 'Saving…' : saved ? 'Saved ✓ (save again)' : 'Save the Ladpet'}
            </button>
          )}
          <button className="btn quiet" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Full screen">
            ⛶
          </button>
          <button className="btn danger" onClick={finish} disabled={busy}>
            Finish &amp; delete
          </button>
        </div>
      </header>

      {live ? (
        // Custom wall: posts show as they arrive (Mew, 22 Oct 2026) — the QR stays beside the wall until hidden
        <div className={`live ${joinPanel ? 'with-join' : ''}`}>
          {joinPanel && (
            <div className="live-side">
              {joinAside}
              <button className="link" onClick={() => setJoinPanel(false)}>
                Hide the QR
              </button>
            </div>
          )}
          <div className="live-main">
            {view.pub.prompt && <p className="live-prompt">{view.pub.prompt}</p>}
            <p className="status-line">
              <b>{postedIds.length}</b> posts
              {notPosted.length > 0 && ` · writing: ${notPosted.slice(0, 12).join(', ')}${notPosted.length > 12 ? ' …' : ''}`}
              {view.pub.locked ? ' · joining closed' : ''}
            </p>
            <main className="board inner">
              {postedIds.map(card)}
              {!postedIds.length && <p className="empty">Posts appear here as soon as they are sent.</p>}
            </main>
          </div>
        </div>
      ) : !view.pub.revealed ? (
        <div className="collect">
          {joinAside}
          <section className="pairs-panel">
            <div className="pairs-head">
              <div className="count">
                <b>{postedIds.length}</b> / {teams.length} posted
              </div>
              <div className="expected" title="How many posts to wait for. Ladpet opens by itself when this many names have all posted.">
                <span>Expected posts</span>
                <button className="btn small" onClick={() => host.setExpected((view.pub.expected ?? 0) - 1)} aria-label="fewer">
                  −
                </button>
                <span className="exp-n" title="Not set">
                  {view.pub.expected || '?'}
                </span>
                <button className="btn small" onClick={() => host.setExpected((view.pub.expected ?? 0) + 1)} aria-label="more">
                  +
                </button>
              </div>
              <button className="btn" onClick={() => host.setLocked(!view.pub.locked)}>
                {view.pub.locked ? 'Open joining' : 'Close joining'}
              </button>
              <button className="btn primary" onClick={() => host.reveal()} disabled={!postedIds.length}>
                Reveal now
              </button>
            </div>
            <div className="progress">
              <div style={{width: `${teams.length ? (100 * postedIds.length) / teams.length : 0}%`}} />
            </div>
            <p className="status-line">{statusLine(blocker, view, postedIds.length, teams.length)}</p>
            <div className="tiles">
              {teams.map(([id, t], i) => {
                const done = !!view.posts[id];
                const c = preset.charts ? view.assign[id] : undefined;
                return (
                  <button
                    key={id}
                    className={`tile ${done ? 'done' : ''}`}
                    style={{background: done ? CARD_TINTS[i % CARD_TINTS.length] : undefined}}
                    title="Click to remove this name"
                    onClick={() => confirm(`Remove "${t.name}"? (Use this for a duplicate or someone who left.)`) && host.remove(id)}
                  >
                    <span className="tile-name">{t.name}</span>
                    <span className="tile-state">
                      {done ? '✓ posted' : 'writing…'}
                      {c !== undefined && <span className="tile-chart"> · chart {c + 1}</span>}
                    </span>
                  </button>
                );
              })}
              {!teams.length && <div className="empty">Names appear here as people join.</div>}
            </div>
            {view.pub.locked && <p className="locked-note">Joining is closed.</p>}
            {teams.length > 0 && <p className="tiles-hint">Click a name to remove a duplicate or someone who left.</p>}
          </section>
        </div>
      ) : preset.charts ? (
        <main className="chart-board">
          {preset.charts.map((c, ci) => {
            const ids = postedIds.filter((id) => view.posts[id].choice === ci);
            return (
              <section key={c.title} className="chart-col">
                <ChartCard chart={c} label={`Chart ${ci + 1}`} />
                {ids.map((id) => card(id, postedIds.indexOf(id)))}
                {!ids.length && <p className="empty small">No posts for this chart.</p>}
              </section>
            );
          })}
          {notPosted.length > 0 && <p className="not-posted">Not posted: {notPosted.join(', ')}</p>}
        </main>
      ) : (
        <main className="board">
          {postedIds.map(card)}
          {!postedIds.length && <p className="empty">Nobody posted.</p>}
          {notPosted.length > 0 && <p className="not-posted">Not posted: {notPosted.join(', ')}</p>}
        </main>
      )}

      {spot !== null && postedIds[spot] && (
        <Spotlight
          host={host}
          view={view}
          preset={preset}
          ids={postedIds}
          index={spot}
          onIndex={setSpot}
          onRemove={async (id) => {
            if (!confirm(`Remove "${view.teams[id]?.name}" from the wall?`)) return;
            setSpot(null);
            await host.remove(id);
          }}
        />
      )}
      {view.pub.fixes && preset.id === 'wk13-spot9' && <Fixes onClose={() => host.setFixes(false)} />}
      {showQr && (
        <div className="overlay" onClick={() => setShowQr(false)}>
          <div className="qr-pop">
            <Qr text={studentUrl(view.code)} className="qr" />
            <div className="join-code">{formatCode(view.code)}</div>
            <p>See the wall on your phone</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Title({preset, pubTitle}: {preset: Preset; pubTitle: string}) {
  const {lead, title} = titleParts(preset, pubTitle);
  return (
    <h1>
      {lead && <span className="lead">{lead} </span>}
      {title}
    </h1>
  );
}

function statusLine(blocker: string | null, view: HostView, posted: number, joined: number): string {
  const exp = view.pub.expected ?? 0;
  switch (blocker) {
    case 'nobody':
      return 'Waiting for the first name to join.';
    case 'waiting':
      return exp > 0 || view.pub.locked
        ? `Opens by itself when all ${Math.max(exp, joined)} have posted.`
        : `${joined - posted} still writing. Set "Expected posts" (or close joining) and Ladpet opens by itself when all have posted.`;
    case 'open':
      return exp > joined
        ? `All ${joined} have posted — waiting for ${exp - joined} more to join (or press Reveal now).`
        : `All ${joined} have posted. Close joining or press Reveal now.`;
    default:
      return 'Opening…';
  }
}

function Spotlight({
  host,
  view,
  preset,
  ids,
  index,
  onIndex,
  onRemove,
}: {
  host: WallHost;
  view: HostView;
  preset: Preset;
  ids: string[];
  index: number;
  onIndex: (i: number | null) => void;
  onRemove: (id: string) => void;
}) {
  const id = ids[index];
  const t = view.teams[id];
  const p = view.posts[id];
  const [zoom, setZoom] = useState(false);
  const load = useCallback(() => host.photo(id), [host, id]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setZoom(false), [id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null);
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') onIndex((index + 1) % ids.length);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') onIndex((index - 1 + ids.length) % ids.length);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, ids.length, onIndex]);
  if (!t || !p) return null;
  return (
    <div className="overlay spot" onClick={() => onIndex(null)}>
      <div className={`spot-box ${p.photo ? 'has-photo' : ''}`} onClick={(e) => e.stopPropagation()} ref={box}>
        {p.photo && (
          <div className={`spot-photo ${zoom ? 'zoom' : ''}`}>
            <DbImage load={load} alt={t.name} onClick={() => setZoom(!zoom)} />
          </div>
        )}
        <div className="spot-text">
          <div className="spot-name">{t.name}</div>
          <PostBody post={p} preset={preset} big chart />
          <div className="spot-nav">
            <button className="btn" onClick={() => onIndex((index - 1 + ids.length) % ids.length)}>
              ← Back
            </button>
            <span>
              {index + 1} / {ids.length}
            </span>
            <button className="btn" onClick={() => onIndex((index + 1) % ids.length)}>
              Next →
            </button>
          </div>
          <div className="spot-foot">
            {p.photo && <span className="muted">Click the photo to zoom.</span>}
            <button className="link" onClick={() => onRemove(id)}>
              Remove
            </button>
            <button className="btn" onClick={() => onIndex(null)}>
              Close (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fixes({onClose}: {onClose: () => void}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="fixes-box" onClick={(e) => e.stopPropagation()}>
        <h2>Check: all nine mistakes</h2>
        <p className="good">
          <Rich text={GOOD_P} mark="fix" />
        </p>
        <ol className="nine">
          {NINE.map((n) => (
            <li key={n}>
              <Rich text={n} mark="fix" />
            </li>
          ))}
        </ol>
        <button className="btn primary" onClick={onClose}>
          Back to the wall
        </button>
      </div>
    </div>
  );
}
