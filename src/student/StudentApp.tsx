import {type FormEvent, type ReactNode, type TextareaHTMLAttributes, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {backend, configured} from '../backend.ts';
import {openDatabase} from '../lib/fb.ts';
import {ImageError, prepareImage} from '../lib/image.ts';
import {merge3, shiftCaret} from '../lib/merge.ts';
import {
  AMOUNT_LABEL,
  type Amount,
  type BuilderBranch,
  type FrameBranch,
  type Preset,
  TREND_ADVERBS,
  TREND_VERBS,
  WHEN_OPTIONS,
  adverbsFor,
  amountsFor,
  getPreset,
  titleParts,
} from '../lib/presets.ts';
import {EMPTY_PICK, type TrendPick, composeFrames, composeTrend, fixPick, frameParts, parseBlanks, parsePick} from '../lib/compose.ts';
import {LIMITS, type Post, isPosted} from '../lib/types.ts';
import {type JoinError, JoinFailed, WallClient, type WallState, checkMember, checkName, defaultGroupName, peekWall} from '../lib/wall-client.ts';
import {orderedTeams} from '../lib/wall-host.ts';
import {APP_NAME, Bi, CARD_TINTS, ChartCard, DbImage, Passage, PostBody, Rich, Spinner} from '../ui/common.tsx';
import {Tile} from '../ui/tiles.tsx';

/** `me` = which member this phone is (only for "you" on the screen). */
type Saved = {code: string; tid: string; name: string; me?: string};
const SAVED = 'cw:team';
function loadSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? 'null');
  } catch {
    return null;
  }
}
function save(s: Saved | null) {
  try {
    if (s) localStorage.setItem(SAVED, JSON.stringify(s));
    else localStorage.removeItem(SAVED);
  } catch {
    /* private mode: a reload just won't remember the group */
  }
}

const JOIN_ERRORS: Record<JoinError, [string, string]> = {
  'not-found': ['No wall with this code — check the code on the screen.', 'ไม่พบบอร์ดนี้ ตรวจสอบรหัสบนจออีกครั้ง'],
  locked: ['New groups are closed — ask your teacher (or tap your group above).', 'ปิดรับกลุ่มใหม่แล้ว ถามอาจารย์ (หรือแตะชื่อกลุ่มของคุณด้านบน)'],
  revealed: ['The wall is already open — new groups can\'t join now.', 'บอร์ดเปิดแล้ว เพิ่มกลุ่มใหม่ไม่ได้'],
  ended: ['This wall has ended.', 'บอร์ดนี้จบแล้ว'],
  taken: ['That group name is taken — tap your group above, or add a letter.', 'มีกลุ่มชื่อนี้แล้ว แตะชื่อกลุ่มด้านบน หรือเปลี่ยนชื่อ'],
  removed: ['Your teacher removed this group.', 'อาจารย์ลบกลุ่มนี้ออกแล้ว'],
  gone: ['That group is no longer on the wall.', 'กลุ่มนี้ไม่อยู่บนบอร์ดแล้ว'],
  network: ['No connection — check your internet and try again.', 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
};

const NAME_ERRORS: Record<string, [string, string]> = {
  empty: ['Type a nickname.', 'กรุณาใส่ชื่อเล่น'],
  long: ['That name is too long.', 'ชื่อยาวเกินไป'],
  chars: ['Letters, numbers, spaces and & + - _ only.', 'ใช้ได้เฉพาะตัวอักษร ตัวเลข เว้นวรรค และ & + - _'],
  digits: ["No long numbers — don't use a student ID.", 'ห้ามใส่ตัวเลขยาว ๆ และห้ามใช้รหัสนักศึกษา'],
};

let db: ReturnType<typeof openDatabase>['db'] | null = null;
function getDb() {
  db ??= openDatabase(backend).db;
  return db;
}

export function StudentApp() {
  const urlCode = (new URLSearchParams(location.search).get('w') ?? '').replace(/\D/g, '').slice(0, 6);
  const [code, setCode] = useState(() => urlCode || loadSaved()?.code || '');
  const [entered, setEntered] = useState(!!code);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  if (!configured) return <div className="phone screen center"><p>Not configured.</p></div>;
  if (!entered) return <CodeForm onCode={(c) => { setCode(c); setEntered(true); history.replaceState(null, '', `?w=${c}`); }} />;
  return (
    <Wall
      key={code}
      code={code}
      onLeave={() => {
        save(null);
        history.replaceState(null, '', location.pathname);
        setCode('');
        setEntered(false);
      }}
    />
  );
}

function CodeForm({onCode}: {onCode: (c: string) => void}) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = v.replace(/\D/g, '');
    setBusy(true);
    setErr(null);
    try {
      const pub = await peekWall(getDb(), c);
      if (!pub || pub.ended) setErr(JOIN_ERRORS[pub ? 'ended' : 'not-found']);
      else onCode(c);
    } catch {
      setErr(JOIN_ERRORS.network);
    }
    setBusy(false);
  }
  return (
    <div className="phone screen center pad">
      <h1 className="app-name">{APP_NAME}</h1>
      <form className="code-form" onSubmit={submit}>
        <label htmlFor="code">
          <Bi en="Ladpet code (on the screen)" th="รหัส Ladpet (บนจอ)" />
        </label>
        <input id="code" inputMode="numeric" autoComplete="off" maxLength={7} value={v} onChange={(e) => setV(e.target.value)} placeholder="123 456" />
        <button className="btn primary big" disabled={busy || v.replace(/\D/g, '').length !== 6}>
          {busy ? '…' : 'Open'}
        </button>
        {err && <Bi className="error" en={err[0]} th={err[1]} />}
      </form>
    </div>
  );
}

function Wall({code, onLeave}: {code: string; onLeave: () => void}) {
  const saved = loadSaved();
  const mine = saved?.code === code ? saved : null;
  const [client] = useState(() => new WallClient(getDb(), code, mine?.tid ?? null, mine?.name ?? ''));
  const [me, setMe] = useState(mine?.me ?? '');
  const [st, setSt] = useState<WallState>(client.state);
  // undefined = still asking the database whether this wall exists
  const [exists, setExists] = useState<boolean | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const everSeen = useRef(false);

  useEffect(() => {
    client.watch();
    const off = client.subscribe(setSt);
    let live = true;
    const ask = () =>
      peekWall(client.db, code).then(
        (p) => live && setExists(!!p),
        () => live && setTimeout(ask, 3000), // offline: keep the spinner and ask again
      );
    ask();
    return () => {
      live = false;
      off();
      client.stop();
    };
  }, [client, code]);

  const pub = st.pub;
  if (pub && !pub.ended) everSeen.current = true;
  const ended = !!pub?.ended || (!pub && (everSeen.current || (exists === false && !!mine)));
  useEffect(() => {
    if (ended) save(null);
  }, [ended]);
  if (!pub && exists !== false && !everSeen.current) return <div className="phone screen center"><Spinner /></div>;
  if (!pub || pub.ended)
    return (
      <div className="phone screen center pad">
        <h1 className="app-name">{APP_NAME}</h1>
        <Bi en={ended ? 'This wall has ended. Thank you!' : 'No wall with this code.'} th={ended ? 'บอร์ดนี้จบแล้ว ขอบคุณค่ะ' : 'ไม่พบบอร์ดนี้'} />
        <button className="btn" onClick={onLeave}>
          Enter another code
        </button>
      </div>
    );

  const preset = getPreset(pub.preset);
  const joined = !!client.tid && st.inWall !== false && !st.removed;
  const live = !!pub.live;
  const shown = pub.revealed || live;
  const rejoin = () => {
    save(null);
    client.forget();
    setMe('');
  };
  const {lead, title} = titleParts(preset, pub.title);
  const group = client.tid ? st.groups[client.tid] : undefined;
  const onJoined = (who: string) => {
    setMe(who);
    save({code, tid: client.tid!, name: client.name, me: who});
    setJoining(false);
  };

  return (
    <div className={`phone theme-${preset.theme}`}>
      <header className="phone-head">
        <div className="kicker">
          {APP_NAME} <span className="chip">{pub.section}</span>
        </div>
        <h1>
          {lead && <span className="lead">{lead} </span>}
          {title}
        </h1>
        {joined && (
          <div className="me">
            ✓ {client.name}
            {group?.members && group.members.length > 0 && defaultGroupName(group.members) !== client.name && <span className="me-members"> · {group.members.join(', ')}</span>}
            {me && (group?.members?.length ?? 0) > 1 && <span className="me-members"> · you: {me}</span>}
            {joined && (
              <button className="link me-switch" onClick={rejoin}>
                not your group?
              </button>
            )}
          </div>
        )}
        {!st.connected && <div className="offline">Offline — reconnecting… · กำลังเชื่อมต่อใหม่</div>}
      </header>
      <main className="phone-main">
        {st.removed && client.tid ? (
          <div className="notice">
            <Bi en="Your teacher removed this group. Join again if you need to." th="อาจารย์ลบกลุ่มนี้ออกแล้ว ถ้าต้องการให้เข้าร่วมใหม่" />
            <button className="btn primary" onClick={rejoin}>
              Join again
            </button>
          </div>
        ) : null}
        {pub.revealed && (
          <div className="revealed-head">
            <Bi en={`The wall is open — ${Object.values(st.posts).filter(isPosted).length} posts`} th="บอร์ดเปิดแล้ว ดูคำตอบของทุกคนได้เลย" />
          </div>
        )}
        {/* Wk13: the passage comes first, so the THINK screenshot needs no scrolling */}
        {!pub.revealed && preset.id === 'wk13-spot9' && <Spot9Material />}
        {!joined && !pub.revealed && (preset.charts ? <Bi className="intro-line" en={preset.intro} th={preset.introTh} /> : <Intro preset={preset} prompt={pub.prompt} />)}
        {joined && pub.prompt && <p className="prompt">{pub.prompt}</p>}
        {joined && preset.charts && <MyChart preset={preset} chart={st.chart} />}
        {joined ? (
          <Composer key={client.tid} client={client} st={st} preset={preset} photoAllowed={pub.photo} live={live} revealed={!!pub.revealed} />
        ) : !st.removed && (!pub.revealed || joining) ? (
          <GroupJoin client={client} st={st} preset={preset} locked={!!pub.locked || !!pub.revealed} onJoined={onJoined} />
        ) : !st.removed ? (
          <button className="btn" onClick={() => setJoining(true)}>
            Edit your group's post
          </button>
        ) : null}
        {!live && !pub.revealed && <Progress pub={pub} />}
        {joined && !live && !pub.revealed && !preset.charts && <Intro preset={preset} />}
        {shown && (
          <section className="live-wall">
            {live && <Bi className="live-head" en={`On the wall now — ${Object.values(st.posts).filter(isPosted).length} posts`} th="โพสต์บนบอร์ดตอนนี้" />}
            <Board client={client} st={st} preset={preset} />
          </section>
        )}
      </main>
    </div>
  );
}

function Intro({preset, prompt}: {preset: Preset; prompt?: string}) {
  return (
    <section className="intro">
      {prompt ? <p className="prompt">{prompt}</p> : preset.intro ? <Bi en={preset.intro} th={preset.introTh} /> : null}
      <ol className="steps">
        {preset.steps.map((s) => (
          <li key={s.label}>
            <span className={`step-label ${s.label.toLowerCase()}`}>{s.label}</span>
            {s.time && <span className="step-time">{s.time}</span>}
            <span className="step-text">{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Spot9Material() {
  return (
    <section className="material">
      <Bi className="screenshot-hint" en="📸 Screenshot this passage, then mark the mistakes in your Photos app." th="แคปหน้าจอข้อความนี้ แล้ววงคำผิดในแอปรูปภาพ" />
      <Passage />
      <p className="look-for">
        <b>Look for:</b> a missing verb · -s · plural · is / are · capitals · spaces · a comma between sentences · the last full stop
      </p>
    </section>
  );
}

/** Wk14: the chart Ladpet gave this group, then the steps. */
function MyChart({preset, chart}: {preset: Preset; chart: number | undefined}) {
  if (chart === undefined || !preset.charts![chart])
    return (
      <div className="notice center-notice">
        <Spinner />
        <Bi en="Getting your chart…" th="กำลังรับกราฟของคุณ…" />
      </div>
    );
  return (
    <section className="my-chart">
      <ChartCard chart={preset.charts![chart]} label={`Your chart · ${chart + 1} of ${preset.charts!.length}`} />
      <Intro preset={preset} />
    </section>
  );
}

/**
 * Participants first (Mew, 27 Oct 2026): the first phone of a group types everyone's nicknames; the others tap
 * their name under their group and join the same post.
 */
function GroupJoin({client, st, preset, locked, onJoined}: {client: WallClient; st: WallState; preset: Preset; locked: boolean; onJoined: (me: string) => void}) {
  const groups = orderedTeams(st.groups);
  const solo = preset.who === 'anyone';
  const [members, setMembers] = useState<string[]>(() => Array(preset.who === 'pair' ? 2 : solo ? 1 : 3).fill(''));
  const [groupName, setGroupName] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [extra, setExtra] = useState('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  const word = preset.who === 'pair' ? 'pair' : 'group';
  // Two ways in: tap your name in a group that is already on the wall, or start a new one.
  const [tab, setTab] = useState<'tap' | 'new' | null>(null);
  const showTap = groups.length > 0 && (locked || tab === 'tap');
  const showNew = !locked && (tab === 'new' || groups.length === 0);

  async function tap(tid: string, who: string, add = false) {
    if (add) {
      const c = checkMember(who);
      if (c.error) return setErr(NAME_ERRORS[c.error]);
      who = c.name;
    }
    setErr(null);
    setBusy(true);
    try {
      await client.joinGroup(tid, add ? who : undefined);
      onJoined(who);
    } catch (x) {
      setErr(JOIN_ERRORS[x instanceof JoinFailed ? x.code : 'network']);
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const list: string[] = [];
    for (const m of members) {
      if (!m.trim()) continue;
      const c = checkMember(m);
      if (c.error) return setErr(NAME_ERRORS[c.error]);
      if (!list.some((x) => x.toLowerCase() === c.name.toLowerCase())) list.push(c.name);
    }
    if (!list.length) return setErr(['Type at least one nickname.', 'ใส่ชื่อเล่นอย่างน้อย 1 ชื่อ']);
    const c = checkName(groupName.trim() || defaultGroupName(list));
    if (c.error) return setErr(NAME_ERRORS[c.error]);
    setErr(null);
    setBusy(true);
    try {
      await client.join(c.name, list);
      onJoined(list[0]);
    } catch (x) {
      setErr(JOIN_ERRORS[x instanceof JoinFailed ? x.code : 'network']);
      setBusy(false);
    }
  }

  return (
    <section className="group-join">
      {groups.length > 0 && !locked && (
        <div className="join-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'tap'} className={`join-tab ${tab === 'tap' ? 'on' : ''}`} onClick={() => setTab('tap')}>
            <Bi en={solo ? 'I\'m already on the wall' : `My ${word} is already here`} th="มีกลุ่มแล้ว แตะชื่อตัวเอง" />
          </button>
          <button type="button" role="tab" aria-selected={tab === 'new'} className={`join-tab ${tab === 'new' ? 'on' : ''}`} onClick={() => setTab('new')}>
            <Bi en={solo ? 'New post' : `Start a new ${word}`} th="สร้างกลุ่มใหม่" />
          </button>
        </div>
      )}
      {showTap && (
        <div className="card-like">
          <h2>
            <Bi en="Tap your name" th="แตะชื่อของคุณ" />
          </h2>
          <div className="group-list">
            {groups.map(([tid, g]) => (
              <div key={tid} className="group-row">
                <div className="group-name">{g.name}</div>
                <div className="group-members">
                  {(g.members?.length ? g.members : [g.name]).map((m) => (
                    <button key={m} type="button" className="chip-btn" disabled={busy} onClick={() => tap(tid, m)}>
                      {m}
                    </button>
                  ))}
                  {adding === tid ? (
                    <span className="add-me">
                      <input autoFocus value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Your nickname" />
                      <button type="button" className="btn small primary" disabled={busy || !extra.trim()} onClick={() => tap(tid, extra, true)}>
                        Join
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="chip-btn add-chip" onClick={() => { setAdding(tid); setExtra(''); }}>
                      + me
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {locked ? (
        <div className="notice">
          <Bi en="New groups are closed — tap your name above, or ask your teacher." th="ปิดรับกลุ่มใหม่แล้ว แตะชื่อของคุณด้านบน หรือถามอาจารย์" />
        </div>
      ) : !showNew ? null : (
        <form className="join-form card-like" onSubmit={create}>
          <h2>
            <Bi
              en={solo ? 'Who is writing?' : `Who is in your ${word}?`}
              th={solo ? 'ใครเป็นคนเขียน (คนเดียวหรือทั้งกลุ่ม)' : 'ใส่ชื่อเล่นของทุกคนในกลุ่ม'}
            />
          </h2>
          {members.map((m, i) => (
            <div key={i} className="member-row">
              <input
                value={m}
                autoComplete="off"
                aria-label={`Nickname ${i + 1}`}
                placeholder={i === 0 ? 'e.g. Mint' : i === 1 ? 'e.g. Ploy' : 'Nickname'}
                onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {members.length > 1 && (
                <button type="button" className="link" aria-label="Remove" onClick={() => setMembers(members.filter((_, j) => j !== i))}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {members.length < LIMITS.members && (
            <button type="button" className="link add-person" onClick={() => setMembers([...members, ''])}>
              + Add a person
            </button>
          )}
          <label htmlFor="group-name">
            <Bi en={`${solo ? 'Group' : word === 'pair' ? 'Pair' : 'Group'} name (optional)`} th="ชื่อกลุ่ม (ไม่ใส่ก็ได้)" />
          </label>
          <input
            id="group-name"
            value={groupName}
            autoComplete="off"
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={defaultGroupName(members.map((m) => m.trim()).filter(Boolean)) || (preset.who === 'group' ? 'e.g. your company name' : 'e.g. Mint & Ploy')}
          />
          <p className="hint">
            <Bi
              en={`Nicknames only — no student IDs.${solo ? '' : ` One phone starts the ${word}; the others choose "My ${word} is already here", tap their name and write on the same post.`}`}
              th={`ใช้ชื่อเล่น ห้ามใช้รหัสนักศึกษา${solo ? '' : ' · คนแรกสร้างกลุ่ม คนอื่นเลือก "มีกลุ่มแล้ว" แตะชื่อตัวเอง แล้วเขียนโพสต์เดียวกันได้'}`}
            />
          </p>
          <button className="btn primary big" disabled={busy}>
            {busy ? 'Starting…' : 'Start writing'}
          </button>
        </form>
      )}
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
    </section>
  );
}

type Msg = [string, string];

/**
 * A big text box that keeps the caret where it is when a co-editor's change arrives.
 * It grows with its text (never squeezed, Mew 27 Oct 2026).
 */
function CoText({value, onChange, onBlur, minRows = 8, ...rest}: {value: string; onChange: (v: string) => void; minRows?: number} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const el = useRef<HTMLTextAreaElement>(null);
  const shown = useRef(value);
  const sel = useRef<[number, number]>([value.length, value.length]);
  const grow = useCallback(() => {
    const t = el.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 4}px`;
  }, []);
  useLayoutEffect(() => {
    const t = el.current;
    if (t && value !== shown.current && document.activeElement === t) {
      const [a, b] = sel.current;
      const na = shiftCaret(shown.current, value, a);
      const nb = shiftCaret(shown.current, value, b);
      t.setSelectionRange(na, nb);
      sel.current = [na, nb];
    }
    shown.current = value;
    grow();
  }, [value, grow]);
  const remember = () => {
    const t = el.current;
    if (t) sel.current = [t.selectionStart, t.selectionEnd];
  };
  return (
    <textarea
      ref={el}
      rows={minRows}
      value={value}
      onChange={(e) => {
        shown.current = e.target.value;
        remember();
        onChange(e.target.value);
      }}
      onSelect={remember}
      onKeyUp={remember}
      onBlur={onBlur}
      {...rest}
    />
  );
}

/** The post's parts as strings: "text", f0…f9, b0…b9. */
function partsOf(p: Post | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (p?.text) out.text = p.text;
  for (const [k, v] of Object.entries(p?.fields ?? {})) out[k] = v;
  return out;
}

const SAVE_DELAY = 600;

/**
 * The group's one post, edited by every member at once (Mew, 27 Oct 2026). Every change saves by itself a moment
 * after typing stops; "Post on Ladpet" puts it on the wall, and it stays editable afterwards.
 */
function Composer({client, st, preset, photoAllowed, live, revealed}: {client: WallClient; st: WallState; preset: Preset; photoAllowed: boolean; live: boolean; revealed: boolean}) {
  const mine = st.mine;
  const [text, setText] = useState(mine?.text ?? '');
  const [lines, setLines] = useState<Record<string, string>>(mine?.fields ?? {});
  const [blanks, setBlanks] = useState<string[][]>(() => initBlanks(preset, mine));
  const [picks, setPicks] = useState<TrendPick[]>(() => initPicks(preset, mine));
  const [busy, setBusy] = useState<'' | 'photo' | 'post'>('');
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [err, setErr] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const synced = useRef<Record<string, string>>(partsOf(mine));
  const desired = useRef<Record<string, string>>({});
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const flushing = useRef(false);
  /** The save in progress (Post waits for it, so the post never goes up without the last words). */
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(mine !== undefined);

  // A "still missing" message goes as soon as they change something.
  useEffect(() => setErr(null), [text, lines, blanks, picks]);

  // Build what goes into the post, and say what is still missing.
  const fields: Record<string, string> = {};
  let missing: Msg | null = null;
  const company = blanks[0]?.[0] ?? '';
  if (preset.frames) {
    preset.frames.forEach((b, i) => {
      const sentence = composeFrames(b, blanks[i] ?? [], company);
      if (sentence) fields[`f${i}`] = sentence;
      if ((blanks[i] ?? []).some((v) => (v ?? '').trim())) fields[`b${i}`] = JSON.stringify(blanks[i]);
    });
    if (!Object.keys(fields).some((k) => k.startsWith('f'))) missing = ['Fill all the blanks of at least one branch.', 'เติมช่องว่างให้ครบอย่างน้อย 1 หัวข้อ'];
  } else if (preset.builder) {
    preset.builder.forEach((b, i) => {
      const t = picks[i] ?? EMPTY_PICK;
      const started = t.s !== -1 || t.v !== -1;
      if (!started) return;
      const r = composeTrend(b, t);
      fields[`b${i}`] = JSON.stringify(t);
      if (r.missing) missing ??= [`${b.label}: choose ${r.missing} (or Clear it).`, `หัวข้อ ${b.label}: ยังไม่ครบ เลือกให้ครบหรือกด Clear`];
      else fields[`f${i}`] = r.sentence;
    });
    if (!missing && !Object.keys(fields).some((k) => k.startsWith('f'))) missing = ['Build at least one sentence.', 'สร้างประโยคอย่างน้อย 1 ประโยค'];
  } else if (preset.fields) {
    preset.fields.items.forEach((_, i) => {
      const v = lines[`f${i}`];
      if (v?.trim()) fields[`f${i}`] = v;
    });
    if (preset.charts && st.chart === undefined) missing = ['Wait for your chart.', 'รอรับกราฟก่อน'];
    else if (!fields.f0) missing = ['Write your best sentence.', 'เขียนประโยคที่ดีที่สุดของคุณ'];
  } else if (!text.trim() && !mine?.photo) {
    missing = photoAllowed && preset.id === 'wk13-spot9' ? ['Add your photo (or type your fixes).', 'เพิ่มรูป (หรือพิมพ์คำที่แก้)'] : ['Type your answer.', 'พิมพ์คำตอบ'];
  }
  const want: Record<string, string> = {...fields};
  if (text.trim()) want.text = text;
  desired.current = want;

  /** Typed text merges with co-editors' typing; tap-built parts (b…) simply take the latest. */
  const mergeable = (k: string) => k === 'text' || (!!preset.fields && k.startsWith('f'));

  /** Show a value that came from the database (a co-editor's change) in the form. */
  const show = useCallback(
    (k: string, v: string) => {
      desired.current = {...desired.current, [k]: v};
      const i = Number(k.slice(1));
      if (k === 'text') setText(v);
      else if (preset.fields && k[0] === 'f') setLines((l) => ({...l, [k]: v}));
      else if (preset.frames && k[0] === 'b') setBlanks((all) => preset.frames!.map((_, j) => (j === i ? parseBlanks(v || undefined) : (all[j] ?? []))));
      else if (preset.builder && k[0] === 'b') setPicks((all) => preset.builder!.map((_, j) => (j === i ? parsePick(v || undefined) : (all[j] ?? EMPTY_PICK))));
    },
    [preset],
  );

  /** Take co-editors' changes for every part this phone has not changed itself. */
  const adopt = useCallback(() => {
    const remote = partsOf(mineRef.current);
    for (const k of new Set([...Object.keys(remote), ...Object.keys(synced.current)])) {
      const r = remote[k] ?? '';
      const base = synced.current[k] ?? '';
      if (r === base) continue;
      if ((desired.current[k] ?? '') === base) {
        synced.current[k] = r;
        show(k, r);
      }
    }
  }, [show]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (running.current) await running.current;
    flushing.current = true;
    let done!: () => void;
    running.current = new Promise<void>((r) => (done = r));
    try {
      const want = desired.current;
      const dirty = [...new Set([...Object.keys(want), ...Object.keys(synced.current)])].filter((k) => (want[k] ?? '') !== (synced.current[k] ?? ''));
      if (dirty.length) setSaveState('saving');
      for (const k of dirty) {
        const local = desired.current[k] ?? '';
        const saved = await client.saveField(k, synced.current[k] ?? '', local, mergeable(k));
        synced.current[k] = saved;
        // A co-editor typed too: show the combined text (keeping anything typed here since).
        if (saved !== local) show(k, mergeable(k) ? merge3(local, desired.current[k] ?? '', saved) : saved);
      }
      if (dirty.length) setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      throw e;
    } finally {
      flushing.current = false;
      running.current = null;
      done();
      adopt();
    }
  }, [client, adopt, show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Our own edits: save a moment after typing stops.
  const wantKey = JSON.stringify(want);
  useEffect(() => {
    if (!loaded.current) return;
    const dirty = Object.keys({...want, ...synced.current}).some((k) => (want[k] ?? '') !== (synced.current[k] ?? ''));
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), SAVE_DELAY);
  }, [wantKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Co-editors' edits.
  useEffect(() => {
    if (mine === undefined) return;
    if (!loaded.current) {
      // first load after a reload: fill the form from the database
      loaded.current = true;
      synced.current = partsOf(mine);
      for (const [k, v] of Object.entries(synced.current)) show(k, v);
      return;
    }
    if (!flushing.current) adopt();
  }, [mine, adopt, show]);

  // Save before the phone leaves the page.
  useEffect(() => {
    const out = () => void flush().catch(() => {});
    window.addEventListener('pagehide', out);
    return () => {
      window.removeEventListener('pagehide', out);
      if (timer.current) void flush().catch(() => {});
    };
  }, [flush]);

  // Wk14 chart: the group's post carries the chart Ladpet gave it.
  useEffect(() => {
    if (preset.charts && st.chart !== undefined && mine !== undefined && mine?.choice !== st.chart) client.setChoice(st.chart).catch(() => {});
  }, [preset.charts, st.chart, mine, client]);

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy('photo');
    try {
      const img = await prepareImage(f);
      await client.setPhoto(img);
    } catch (e) {
      setErr(
        e instanceof ImageError
          ? e.message === 'too-big'
            ? ['This photo is too big. Take a screenshot of it and post that.', 'รูปใหญ่เกินไป ลองแคปหน้าจอแล้วโพสต์แทน']
            : ["Can't read this photo. Try a screenshot (PNG or JPG).", 'เปิดรูปนี้ไม่ได้ ลองใช้ภาพแคปหน้าจอ (PNG หรือ JPG)']
          : ['Could not upload the photo — check your internet and try again.', 'อัปโหลดรูปไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
      );
    }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function removePhoto() {
    setBusy('photo');
    await client.setPhoto(null).catch(() => setErr(['Could not remove the photo — try again.', 'ลบรูปไม่สำเร็จ ลองใหม่']));
    setBusy('');
  }

  async function post(e: FormEvent) {
    e.preventDefault();
    if (missing) return setErr(missing);
    setErr(null);
    setBusy('post');
    try {
      await flush();
      await client.setDone(true);
    } catch (x) {
      const denied = String((x as {code?: string})?.code ?? x).toLowerCase().includes('permission');
      setErr(
        denied
          ? ['Could not post — the wall has ended or your group was removed.', 'โพสต์ไม่สำเร็จ บอร์ดจบแล้วหรือกลุ่มถูกลบ']
          : ['Could not post — check your internet and try again.', 'โพสต์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
      );
    }
    setBusy('');
  }

  const posted = isPosted(mine);
  const photoLoad = useMemo(() => () => client.thumb(client.tid!), [client, mine?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form className="composer card-like" onSubmit={post}>
      <div className="composer-head">
        <h2>
          <Bi en="Your group's post" th="โพสต์ของกลุ่ม" />
        </h2>
        <span className={`save-state ${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — check your internet' : saveState === 'saved' ? 'Saved ✓' : ''}
        </span>
      </div>
      <p className="hint">
        <Bi en="Everyone in your group can write here from their own phone — changes save by themselves." th="ทุกคนในกลุ่มเขียนตรงนี้ได้จากโทรศัพท์ของตัวเอง ระบบบันทึกให้อัตโนมัติ" />
      </p>
      {posted && (
        <div className="posted-head">
          <span className="tick">✓</span>
          {live || revealed ? (
            <Bi en="Posted — it's on the wall. You can still edit it." th="โพสต์แล้ว ขึ้นบอร์ดแล้ว ยังแก้ไขได้" />
          ) : (
            <Bi en="Posted — hidden until everyone has posted. You can still edit it." th="โพสต์แล้ว ซ่อนไว้จนกว่าทุกคนจะส่ง ยังแก้ไขได้" />
          )}
        </div>
      )}
      {photoAllowed && (
        <div className="photo-field">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          {mine?.photo ? (
            <div className="photo-preview">
              <DbImage key={mine.at} load={photoLoad} alt="Your photo" />
              <div className="photo-btns">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                  {busy === 'photo' ? 'Uploading…' : 'Change photo'}
                </button>
                <button type="button" className="link" onClick={removePhoto} disabled={!!busy}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn photo-btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === 'photo' ? 'Uploading photo…' : preset.id === 'wk13-spot9' ? '📷 Add your marked screenshot' : '📷 Add a photo'}
            </button>
          )}
        </div>
      )}
      {preset.frames && <FrameEditor frames={preset.frames} blanks={blanks} onChange={setBlanks} tip={preset.tip} />}
      {preset.builder && <TrendBuilder branches={preset.builder} picks={picks} onChange={setPicks} tip={preset.tip} />}
      {preset.fields && (
        <div className="fields">
          <Bi className="field-heading" en={preset.fields.heading} th={preset.fields.th} />
          {preset.fields.items.map((f, i) => (
            <label key={f.label} className="field">
              <span className="field-name">
                {f.label}
                {f.required && <span className="req"> *</span>}
                {f.hint && <span className="field-hint"> · {f.hint}</span>}
              </span>
              <CoText minRows={3} value={lines[`f${i}`] ?? ''} onChange={(v) => setLines((l) => ({...l, [`f${i}`]: v}))} onBlur={() => void flush().catch(() => {})} />
            </label>
          ))}
        </div>
      )}
      {preset.text && (
        <label className="field">
          <span className="field-name">
            {preset.text.label}
            <span className="th" lang="th">
              {' '}
              · {preset.text.th}
            </span>
          </span>
          <CoText minRows={photoAllowed ? 6 : 10} className="big-box" value={text} onChange={setText} onBlur={() => void flush().catch(() => {})} placeholder={preset.text.placeholder} />
        </label>
      )}
      {!posted ? (
        <button className="btn primary big" disabled={!!busy}>
          {busy === 'post' ? 'Posting…' : 'Post on Ladpet'}
        </button>
      ) : null}
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
      <p className="hint">
        {posted ? null : live ? (
          <Bi en="Your post appears on the wall when you press Post, and every change after that shows too." th="โพสต์จะขึ้นบอร์ดเมื่อกด Post และทุกการแก้ไขหลังจากนั้นจะแสดงด้วย" />
        ) : revealed ? null : (
          <Bi en="Hidden from the class until everyone has posted." th="เพื่อนจะยังไม่เห็นจนกว่าทุกคนจะส่ง" />
        )}
      </p>
    </form>
  );
}

function initBlanks(preset: Preset, mine: Post | null | undefined): string[][] {
  return (preset.frames ?? []).map((_, i) => parseBlanks(mine?.fields?.[`b${i}`]));
}
function initPicks(preset: Preset, mine: Post | null | undefined): TrendPick[] {
  return (preset.builder ?? []).map((_, i) => parsePick(mine?.fields?.[`b${i}`]));
}

/** Wk13: each branch's frame with the blanks to fill; the profile paragraph builds up underneath. */
function FrameEditor({frames, blanks, onChange, tip}: {frames: FrameBranch[]; blanks: string[][]; onChange: (b: string[][]) => void; tip?: string}) {
  const company = blanks[0]?.[0]?.trim() ?? '';
  const set = (i: number, k: number, v: string) => {
    const next = frames.map((_, j) => Array.from({length: Math.max(blanks[j]?.length ?? 0, j === i ? k + 1 : 0)}, (_, n) => blanks[j]?.[n] ?? ''));
    next[i][k] = v;
    onChange(next);
  };
  const paragraph = frames.map((b, i) => composeFrames(b, blanks[i] ?? [], company)).filter(Boolean).join(' ');
  return (
    <div className="frames">
      <Bi className="field-heading" en="Fill the blanks — one branch at a time" th="เติมคำในช่องว่างทีละหัวข้อ (ไม่ต้องครบทุกหัวข้อ)" />
      {frames.map((b, i) => {
        let k = 0;
        return (
          <div key={b.label} className="frame-card">
            <div className="frame-label">
              <span className="num">{i + 1}</span> {b.label}
            </div>
            {b.sentences.map((sentence, si) => {
              const {parts, blanks: n} = frameParts(sentence, k);
              k += n;
              return (
                <p key={si} className="frame-line">
                  {parts.map((part, pi) => {
                    // keep a blank and the full stop / comma after it on one line
                    const prev = parts[pi - 1];
                    const next = parts[pi + 1];
                    const glued = next && 'text' in next && /^[.,]/.test(next.text) ? next.text[0] : '';
                    if ('text' in part) {
                      const t = prev && !('text' in prev) && /^[.,]/.test(part.text) ? part.text.slice(1) : part.text;
                      return t ? <Rich key={pi} text={t} /> : null;
                    }
                    return (
                      <span key={pi} className="blank-wrap">
                      <input
                        className="blank"
                        aria-label={`${b.label}: ${part.placeholder}`}
                        value={blanks[i]?.[part.blank] ?? ''}
                       
                        style={{width: `${Math.min(26, Math.max(4, (blanks[i]?.[part.blank] || (part.name ? company || 'company name' : part.placeholder)).length) + 1.5)}ch`}}
                        placeholder={part.name ? company || 'company name' : part.placeholder}
                        onChange={(e) => set(i, part.blank, e.target.value)}
                      />
                      {glued}
                      </span>
                    );
                  })}
                </p>
              );
            })}
            {b.hint && <p className="frame-hint">{b.hint}</p>}
          </div>
        );
      })}
      <div className="paragraph-preview">
        <div className="preview-label">Your company profile</div>
        <p>{paragraph || <span className="muted">Your sentences appear here as you fill the blanks.</span>}</p>
      </div>
      {tip && <p className="tip">{tip}</p>}
    </div>
  );
}

/** Wk14: tap the parts of each trend sentence; the finished sentence shows as you go. */
function TrendBuilder({branches, picks, onChange, tip}: {branches: BuilderBranch[]; picks: TrendPick[]; onChange: (p: TrendPick[]) => void; tip?: string}) {
  const [open, setOpen] = useState<number | null>(() => {
    const i = picks.findIndex((t) => t.s === -1 && t.v === -1);
    return i === -1 ? null : i;
  });
  const set = (i: number, patch: Partial<TrendPick>) => onChange(picks.map((t, j) => (j === i ? fixPick({...t, ...patch}) : t)));
  return (
    <div className="builder">
      <Bi className="field-heading" en="Build one sentence per branch — tap the parts" th="สร้างประโยคทีละหัวข้อ แตะเลือกส่วนต่าง ๆ" />
      {branches.map((b, i) => {
        const t = picks[i] ?? EMPTY_PICK;
        const started = t.s !== -1 || t.v !== -1;
        const r = composeTrend(b, t);
        const verb = TREND_VERBS[t.v];
        const isOpen = open === i;
        return (
          <div key={b.label} className={`build-card ${isOpen ? 'open' : ''} ${started && !r.missing ? 'done' : ''}`}>
            <button type="button" className="build-head" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
              <span className="num">{started && !r.missing ? '✓' : i + 1}</span>
              <span className="build-title">
                <b>{b.label}</b>
                <span className={`build-preview ${started ? '' : 'muted'}`}>{started ? r.sentence : `Tap to build · ${b.hint}`}</span>
              </span>
            </button>
            {isOpen && (
              <div className="build-body">
                <Chips
                  label="1 · What changed?"
                  options={[...b.subjects, '✏️ other']}
                  value={t.s === -2 ? b.subjects.length : t.s}
                  onPick={(k) => set(i, {s: k === b.subjects.length ? -2 : k})}
                />
                {t.s === -2 && <input className="small-input" placeholder="e.g. Delivery orders" value={t.so ?? ''} onChange={(e) => set(i, {so: e.target.value})} />}
                <div className="chips-block">
                  <div className="chips-label">2 · Verb (past)</div>
                  {(['up', 'down', 'flat'] as const).map((dir) => (
                    <div key={dir} className="chips verbs">
                      <span className="dir">{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span>
                      {TREND_VERBS.map((v, k) =>
                        v.dir === dir ? (
                          <button type="button" key={v.base} className={`chip-btn ${t.v === k ? 'on' : ''}`} onClick={() => set(i, {v: k})} aria-pressed={t.v === k}>
                            {v.past}
                            <span className="th" lang="th">
                              {v.th}
                            </span>
                          </button>
                        ) : null,
                      )}
                    </div>
                  ))}
                </div>
                {verb && adverbsFor(verb).length > 0 && (
                  <Chips
                    label="3 · How? (optional)"
                    options={['—', ...adverbsFor(verb)]}
                    value={t.a === -1 ? 0 : adverbsFor(verb).indexOf(TREND_ADVERBS[t.a]) + 1}
                    onPick={(k) => set(i, {a: k === 0 ? -1 : TREND_ADVERBS.indexOf(adverbsFor(verb)[k - 1])})}
                  />
                )}
                {verb && (
                  <>
                    <Chips
                      label="4 · How much? (optional)"
                      options={amountsFor(verb).map((a) => AMOUNT_LABEL[a])}
                      value={amountsFor(verb).indexOf(t.p)}
                      onPick={(k) => set(i, {p: amountsFor(verb)[k] as Amount})}
                    />
                    <AmountInputs b={b} t={t} onChange={(patch) => set(i, patch)} />
                  </>
                )}
                <Chips
                  label="5 · When? (optional)"
                  options={['—', ...WHEN_OPTIONS, '✏️ other']}
                  value={t.w === -1 ? 0 : t.w === -2 ? WHEN_OPTIONS.length + 1 : t.w + 1}
                  onPick={(k) => set(i, {w: k === 0 ? -1 : k === WHEN_OPTIONS.length + 1 ? -2 : k - 1})}
                />
                {t.w === -2 && <input className="small-input" placeholder="e.g. in the first quarter" value={t.wo ?? ''} onChange={(e) => set(i, {wo: e.target.value})} />}
                <div className={`sentence-preview ${r.missing ? 'todo' : 'ok'}`}>
                  {r.sentence}
                  {r.missing && started && <span className="todo-note">Still to choose: {r.missing}</span>}
                </div>
                <div className="build-actions">
                  <button type="button" className="link" onClick={() => onChange(picks.map((x, j) => (j === i ? EMPTY_PICK : x)))}>
                    Clear
                  </button>
                  <button type="button" className="btn" onClick={() => setOpen(i + 1 < branches.length ? i + 1 : null)}>
                    {i + 1 < branches.length ? 'Next branch →' : 'Done'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {tip && <p className="tip">{tip}</p>}
    </div>
  );
}

function Chips({label, options, value, onPick}: {label: string; options: string[]; value: number; onPick: (i: number) => void}) {
  return (
    <div className="chips-block">
      <div className="chips-label">{label}</div>
      <div className="chips">
        {options.map((o, k) => (
          <button type="button" key={o} className={`chip-btn ${value === k ? 'on' : ''}`} onClick={() => onPick(k)} aria-pressed={value === k}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function AmountInputs({b, t, onChange}: {b: BuilderBranch; t: TrendPick; onChange: (p: Partial<TrendPick>) => void}) {
  if (t.p === 'none') return null;
  const box = (key: 'x' | 'y', ph: string) => (
    <input className="small-input amount" placeholder={ph} value={t[key] ?? ''} onChange={(e) => onChange({[key]: e.target.value})} />
  );
  return (
    <div className="amount-row">
      {t.p === 'by' && <>by {box('x', b.by)}</>}
      {(t.p === 'to' || t.p === 'at') && <>{t.p} {box('x', b.to)}</>}
      {t.p === 'fromto' && <>from {box('x', b.from)} to {box('y', b.to)}</>}
      {t.p === 'between' && <>between {box('x', b.from)} and {box('y', b.to)}</>}
    </div>
  );
}

function Progress({pub}: {pub: NonNullable<WallState['pub']>}) {
  const roster = pub.roster ?? [];
  if (!roster.length) return null;
  const done = roster.filter((r) => r.p).length;
  const waiting = roster.filter((r) => !r.p).map((r) => r.n);
  return (
    <section className="progress-phone">
      <div className="progress">
        <div style={{width: `${(100 * done) / roster.length}%`}} />
      </div>
      <p>
        <b>{done}</b> of {roster.length} have posted
        {waiting.length > 0 && waiting.length <= 12 && <span className="muted"> · waiting for {waiting.join(', ')}</span>}
      </p>
    </section>
  );
}


/** Everyone's posts (after the reveal, or all the time on a live wall) as tiles. Wk14 chart: grouped under each chart. */
function Board({client, st, preset}: {client: WallClient; st: WallState; preset: Preset}) {
  const teams = orderedTeams(st.teams).filter(([id]) => isPosted(st.posts[id]));
  const [open, setOpen] = useState<string | null>(null);
  const loaders = useMemo(() => new Map<string, () => Promise<string | null>>(), [client]);
  const thumbOf = (id: string, at: number) => {
    let l = loaders.get(`${id}@${at}`);
    if (!l) loaders.set(`${id}@${at}`, (l = () => client.thumb(id)));
    return l;
  };
  const tile = ([id, t]: (typeof teams)[number], i: number) => {
    const p = st.posts[id];
    return (
      <Tile
        key={id}
        name={t.name}
        members={t.members}
        post={p}
        preset={preset}
        thumb={thumbOf(id, p.at)}
        tint={CARD_TINTS[i % CARD_TINTS.length]}
        you={id === client.tid}
        onClick={() => setOpen(id)}
      />
    );
  };
  return (
    <div className="phone-board">
      {preset.charts
        ? preset.charts.map((c, ci) => {
            const group = teams.filter(([id]) => st.posts[id].choice === ci);
            return group.length ? (
              <section key={c.title} className="chart-group">
                <ChartCard chart={c} compact />
                {group.map(tile)}
              </section>
            ) : null;
          })
        : teams.map(tile)}
      {!teams.length && <p className="empty">No posts yet.</p>}
      {open && (
        <PhotoViewer onClose={() => setOpen(null)} title={st.teams[open]?.name ?? ''}>
          {st.posts[open]?.photo && <DbImage load={() => client.photo(open)} alt={st.teams[open]?.name ?? ''} />}
          {st.posts[open] && (
            <div className="viewer-text">
              <PostBody post={st.posts[open]} preset={preset} />
            </div>
          )}
        </PhotoViewer>
      )}
    </div>
  );
}

function PhotoViewer({children, onClose, title}: {children: ReactNode; onClose: () => void; title: string}) {
  return (
    <div className="overlay phone-viewer" onClick={onClose}>
      <div className="viewer-head">
        <span>{title}</span>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="viewer-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
