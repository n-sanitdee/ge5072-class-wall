import {type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {backend, configured} from '../backend.ts';
import {openDatabase} from '../lib/fb.ts';
import {ImageError, prepareImage} from '../lib/image.ts';
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
import type {Draft, Post} from '../lib/types.ts';
import {type JoinError, JoinFailed, WallClient, type WallState, checkName, peekWall} from '../lib/wall-client.ts';
import {orderedTeams} from '../lib/wall-host.ts';
import {APP_NAME, Bi, CARD_TINTS, ChartCard, DbImage, Passage, PostBody, Rich, Spinner} from '../ui/common.tsx';

type Saved = {code: string; tid: string; name: string};
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
    /* private mode: a reload just won't remember the pair */
  }
}

const JOIN_ERRORS: Record<JoinError, [string, string]> = {
  'not-found': ['No wall with this code — check the code on the screen.', 'ไม่พบบอร์ดนี้ ตรวจสอบรหัสบนจออีกครั้ง'],
  locked: ['Joining is closed — ask your teacher.', 'ปิดรับคู่ใหม่แล้ว ถามอาจารย์'],
  revealed: ['The wall is already open — you can look, but not post.', 'บอร์ดเปิดแล้ว ดูได้แต่โพสต์ไม่ได้'],
  ended: ['This wall has ended.', 'บอร์ดนี้จบแล้ว'],
  taken: ['That name is taken — add a letter or try another.', 'มีคนใช้ชื่อนี้แล้ว ลองชื่ออื่น'],
  removed: ['Your teacher removed this name.', 'อาจารย์ลบชื่อนี้ออกแล้ว'],
  network: ['No connection — check your internet and try again.', 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
};

const NAME_ERRORS: Record<string, [string, string]> = {
  empty: ['Type a name.', 'กรุณาใส่ชื่อ'],
  long: ['24 characters at most.', 'ไม่เกิน 24 ตัวอักษร'],
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
  const [st, setSt] = useState<WallState>(client.state);
  // undefined = still asking the database whether this wall exists
  const [exists, setExists] = useState<boolean | undefined>(undefined);
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
  const rejoin = () => {
    save(null);
    client.forget();
  };
  const {lead, title} = titleParts(preset, pub.title);

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
        {joined && <div className="me">✓ {client.name}</div>}
        {!st.connected && <div className="offline">Offline — reconnecting… · กำลังเชื่อมต่อใหม่</div>}
      </header>
      {pub.revealed ? (
        <main className="phone-main">
          <div className="revealed-head">
            <Bi en={`The wall is open — ${Object.keys(st.posts).length} posts`} th="บอร์ดเปิดแล้ว ดูคำตอบของทุกคนได้เลย" />
          </div>
          <Board client={client} st={st} preset={preset} />
        </main>
      ) : (
        <main className="phone-main">
          {st.removed && client.tid ? (
            <div className="notice">
              <Bi en="Your teacher removed this name. Join again with a new name if you need to." th="อาจารย์ลบชื่อนี้ออกแล้ว ถ้าต้องการให้เข้าร่วมใหม่ด้วยชื่อใหม่" />
              <button className="btn primary" onClick={rejoin}>
                Join again
              </button>
            </div>
          ) : null}
          {/* Wk13: the passage comes first, so the THINK screenshot needs no scrolling */}
          {preset.id === 'wk13-spot9' && <Spot9Material />}
          {/* Wk14 chart: page 1 takes a name only (Mew, 22 Oct 2026); the chart comes after joining */}
          {!joined && (preset.charts ? <Bi className="intro-line" en={preset.intro} th={preset.introTh} /> : <Intro preset={preset} prompt={pub.prompt} />)}
          {joined && pub.prompt && <p className="prompt">{pub.prompt}</p>}
          {joined && preset.charts && <MyChart preset={preset} chart={st.chart} />}
          {joined ? (
            <Composer client={client} st={st} preset={preset} photoAllowed={pub.photo} live={live} />
          ) : !st.removed ? (
            <JoinForm
              preset={preset}
              locked={!!pub.locked}
              onJoin={async (name) => {
                await client.join(name);
                save({code, tid: client.tid!, name});
              }}
            />
          ) : null}
          {!live && <Progress pub={pub} />}
          {joined && !live && !preset.charts && <Intro preset={preset} />}
          {live && (
            <section className="live-wall">
              <Bi className="live-head" en={`On the wall now — ${Object.keys(st.posts).length} posts`} th="โพสต์บนบอร์ดตอนนี้" />
              <Board client={client} st={st} preset={preset} />
            </section>
          )}
        </main>
      )}
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

/** Wk14: the chart Ladpet gave this name, then the steps. */
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

function JoinForm({preset, locked, onJoin}: {preset: Preset; locked: boolean; onJoin: (name: string) => Promise<void>}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  if (locked)
    return (
      <div className="notice">
        <Bi en="Joining is closed — ask your teacher." th="ปิดรับชื่อใหม่แล้ว ถามอาจารย์" />
      </div>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = checkName(name);
    if (c.error) return setErr(NAME_ERRORS[c.error]);
    setErr(null);
    setBusy(true);
    try {
      await onJoin(c.name);
    } catch (x) {
      setErr(JOIN_ERRORS[x instanceof JoinFailed ? x.code : 'network']);
      setBusy(false);
    }
  }
  // "Name" works for one person, a pair or a group (Mew, 22 Oct 2026).
  const together =
    preset.who === 'pair'
      ? ['Working as a pair? Put both nicknames (e.g. Mint & Ploy) and use one phone.', 'ทำเป็นคู่ ใส่ชื่อเล่นทั้งสองคน แล้วใช้โทรศัพท์เครื่องเดียว']
      : preset.who === 'group'
        ? ['Working as a group? Use your group name and one phone.', 'ทำเป็นกลุ่ม ใช้ชื่อกลุ่ม แล้วใช้โทรศัพท์เครื่องเดียว']
        : null;
  return (
    <form className="join-form card-like" onSubmit={submit}>
      <label htmlFor="team-name">
        <Bi en="Your name" th="ชื่อของคุณ" />
      </label>
      <input
        id="team-name"
        value={name}
        maxLength={30}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        placeholder={preset.who === 'group' ? 'e.g. Sunny Tea team' : preset.who === 'pair' ? 'e.g. Mint & Ploy' : 'e.g. Mint'}
      />
      <p className="hint">
        <Bi en={`Nickname only — no student ID.${together ? ' ' + together[0] : ''}`} th={`ใช้ชื่อเล่น ห้ามใช้ชื่อจริงหรือรหัสนักศึกษา${together ? ' · ' + together[1] : ''}`} />
      </p>
      <button className="btn primary big" disabled={busy}>
        {busy ? 'Joining…' : 'Join'}
      </button>
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
    </form>
  );
}

type Msg = [string, string];

function Composer({client, st, preset, photoAllowed, live}: {client: WallClient; st: WallState; preset: Preset; photoAllowed: boolean; live: boolean}) {
  const mine = st.mine;
  const [editing, setEditing] = useState(!mine);
  const [text, setText] = useState(mine?.text ?? '');
  const [lines, setLines] = useState<Record<string, string>>(mine?.fields ?? {});
  const [blanks, setBlanks] = useState<string[][]>(() => initBlanks(preset, mine));
  const [picks, setPicks] = useState<TrendPick[]>(() => initPicks(preset, mine));
  const [image, setImage] = useState<Draft['image']>(mine?.photo ? 'keep' : null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'photo' | 'send'>('');
  const [err, setErr] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seen = useRef(!!mine);

  // A "still missing" message goes as soon as they change something.
  useEffect(() => setErr(null), [text, lines, blanks, picks, image]);

  // The first time our post arrives (e.g. after a reload), show it instead of an empty form.
  useEffect(() => {
    if (mine && !seen.current) {
      seen.current = true;
      setEditing(false);
    }
  }, [mine]);

  function startEdit() {
    setText(mine?.text ?? '');
    setLines(mine?.fields ?? {});
    setBlanks(initBlanks(preset, mine));
    setPicks(initPicks(preset, mine));
    setImage(mine?.photo ? 'keep' : null);
    setPreview(null);
    setErr(null);
    setEditing(true);
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy('photo');
    try {
      const img = await prepareImage(f);
      setImage(img);
      setPreview(img.thumb);
    } catch (e) {
      setErr(
        e instanceof ImageError && e.message === 'too-big'
          ? ['This photo is too big. Take a screenshot of it and post that.', 'รูปใหญ่เกินไป ลองแคปหน้าจอแล้วโพสต์แทน']
          : ["Can't read this photo. Try a screenshot (PNG or JPG).", 'เปิดรูปนี้ไม่ได้ ลองใช้ภาพแคปหน้าจอ (PNG หรือ JPG)'],
      );
    }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  }

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
      const v = lines[`f${i}`]?.trim();
      if (v) fields[`f${i}`] = v;
    });
    if (preset.charts && st.chart === undefined) missing = ['Wait for your chart.', 'รอรับกราฟก่อน'];
    else if (!fields.f0) missing = ['Write your best sentence.', 'เขียนประโยคที่ดีที่สุดของคุณ'];
  } else if (!text.trim() && !image) {
    missing = photoAllowed && preset.id === 'wk13-spot9' ? ['Add your photo (or type your fixes).', 'เพิ่มรูป (หรือพิมพ์คำที่แก้)'] : ['Type your answer.', 'พิมพ์คำตอบ'];
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (missing) return setErr(missing);
    setErr(null);
    setBusy('send');
    try {
      await client.post({text, fields, choice: preset.charts ? st.chart : undefined, image: photoAllowed ? image : undefined});
      seen.current = true;
      setEditing(false);
    } catch (x) {
      const denied = String((x as {code?: string})?.code ?? x).toLowerCase().includes('permission');
      setErr(
        denied
          ? ['Too late — the wall has opened or your name was removed.', 'ช้าไปแล้ว บอร์ดเปิดแล้วหรือชื่อถูกลบ']
          : ['Could not post — check your internet and try again.', 'โพสต์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
      );
    }
    setBusy('');
  }

  if (!editing && mine) {
    return (
      <section className="posted card-like">
        <div className="posted-head">
          <span className="tick">✓</span>
          {live ? (
            <Bi en="Posted — it's on the wall now." th="โพสต์แล้ว ขึ้นบอร์ดเรียบร้อย" />
          ) : (
            <Bi en="Posted — hidden until everyone has posted." th="โพสต์แล้ว คำตอบจะซ่อนไว้จนกว่าทุกคนจะส่ง" />
          )}
        </div>
        <MyPost client={client} post={mine} preset={preset} />
        <button className="btn" onClick={startEdit}>
          Edit / replace
        </button>
      </section>
    );
  }

  return (
    <form className="composer card-like" onSubmit={send}>
      <h2>
        <Bi en={mine ? 'Edit your post' : 'Your post'} th={mine ? 'แก้ไขโพสต์' : 'โพสต์ของคุณ'} />
      </h2>
      {photoAllowed && (
        <div className="photo-field">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          {image ? (
            <div className="photo-preview">
              {preview ? <img src={preview} alt="Your photo" /> : <DbImage load={() => client.thumb(client.tid!)} alt="Your photo" />}
              <div className="photo-btns">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                  Change photo
                </button>
                <button type="button" className="link" onClick={() => { setImage(null); setPreview(null); }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn photo-btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === 'photo' ? 'Preparing photo…' : preset.id === 'wk13-spot9' ? '📷 Add your marked screenshot' : '📷 Add a photo'}
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
              <textarea rows={2} maxLength={300} value={lines[`f${i}`] ?? ''} onChange={(e) => setLines({...lines, [`f${i}`]: e.target.value})} />
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
          <textarea rows={photoAllowed ? 3 : 5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={preset.text.placeholder} />
        </label>
      )}
      <button className="btn primary big" disabled={!!busy}>
        {busy === 'send' ? 'Posting…' : mine ? 'Save changes' : 'Post on Ladpet'}
      </button>
      {mine && (
        <button type="button" className="link center-link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
      <p className="hint">
        {live ? (
          <Bi en="Your post appears on the wall straight away. You can still edit it." th="โพสต์จะขึ้นบอร์ดทันที และยังแก้ไขได้" />
        ) : (
          <Bi en="Hidden from the class until everyone has posted. You can change it until then." th="เพื่อนจะยังไม่เห็นจนกว่าทุกคนจะส่ง และแก้ไขได้จนถึงตอนนั้น" />
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
                        maxLength={80}
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
                {t.s === -2 && <input className="small-input" placeholder="e.g. Delivery orders" maxLength={40} value={t.so ?? ''} onChange={(e) => set(i, {so: e.target.value})} />}
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
                {t.w === -2 && <input className="small-input" placeholder="e.g. in the first quarter" maxLength={40} value={t.wo ?? ''} onChange={(e) => set(i, {wo: e.target.value})} />}
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
    <input className="small-input amount" placeholder={ph} maxLength={25} value={t[key] ?? ''} onChange={(e) => onChange({[key]: e.target.value})} />
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

function MyPost({client, post, preset}: {client: WallClient; post: Post; preset: Preset}) {
  const load = useMemo(() => () => client.thumb(`${client.tid}`), [client, post.at]); // eslint-disable-line
  return (
    <div className="my-post">
      {post.photo && <DbImage key={post.at} load={load} alt="Your photo" className="thumb" />}
      <PostBody post={post} preset={preset} />
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

/** Everyone's posts (after the reveal, or all the time on a live wall). Wk14 chart: grouped under each chart. */
function Board({client, st, preset}: {client: WallClient; st: WallState; preset: Preset}) {
  const teams = orderedTeams(st.teams).filter(([id]) => st.posts[id]);
  const [open, setOpen] = useState<string | null>(null);
  const loaders = useMemo(() => new Map<string, () => Promise<string | null>>(), [client]);
  const thumbOf = (id: string, at: number) => {
    let l = loaders.get(`${id}@${at}`);
    if (!l) loaders.set(`${id}@${at}`, (l = () => client.thumb(id)));
    return l;
  };
  const card = ([id, t]: (typeof teams)[number], i: number) => {
    const p = st.posts[id];
    return (
      <article key={id} className={`card ${id === client.tid ? 'mine' : ''}`} style={{background: CARD_TINTS[i % CARD_TINTS.length]}} onClick={() => p.photo && setOpen(id)}>
        <h2>
          {t.name}
          {id === client.tid && <span className="you"> · you</span>}
        </h2>
        {p.photo && <DbImage load={thumbOf(id, p.at)} alt={t.name} className="thumb" lazy />}
        <PostBody post={p} preset={preset} />
      </article>
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
                {group.map(card)}
              </section>
            ) : null;
          })
        : teams.map(card)}
      {!teams.length && <p className="empty">No posts yet.</p>}
      {open && (
        <PhotoViewer onClose={() => setOpen(null)} title={st.teams[open]?.name ?? ''}>
          <DbImage load={() => client.photo(open)} alt={st.teams[open]?.name ?? ''} />
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
