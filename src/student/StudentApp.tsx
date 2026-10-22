import {type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {backend, configured} from '../backend.ts';
import {openDatabase} from '../lib/fb.ts';
import {ImageError, prepareImage} from '../lib/image.ts';
import {type Preset, getPreset, whoWord} from '../lib/presets.ts';
import type {Draft, Post} from '../lib/types.ts';
import {type JoinError, JoinFailed, WallClient, type WallState, checkName, peekWall} from '../lib/wall-client.ts';
import {orderedTeams} from '../lib/wall-host.ts';
import {APP_NAME, Bi, CARD_TINTS, DbImage, LineChart, Passage, PostBody, Rich, Spinner} from '../ui/common.tsx';

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
          <Bi en="Wall code (on the screen)" th="รหัสบอร์ด (บนจอ)" />
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
  const rejoin = () => {
    save(null);
    client.forget();
  };

  return (
    <div className={`phone theme-${preset.theme}`}>
      <header className="phone-head">
        <div className="kicker">
          {[preset.week, preset.activity].filter(Boolean).join(' · ')} <span className="chip">{pub.section}</span>
        </div>
        <h1>{pub.title}</h1>
        {joined && <div className="me">✓ {client.name}</div>}
        {!st.connected && <div className="offline">Offline — reconnecting… · กำลังเชื่อมต่อใหม่</div>}
      </header>
      {pub.revealed ? (
        <Revealed client={client} st={st} preset={preset} />
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
          {!joined && <Intro preset={preset} prompt={pub.prompt} />}
          {joined && pub.prompt && <p className="prompt">{pub.prompt}</p>}
          {preset.charts && !joined && <Charts preset={preset} section={pub.section} />}
          {joined ? (
            <Composer client={client} st={st} preset={preset} photoAllowed={pub.photo} />
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
          <Progress pub={pub} preset={preset} />
          {joined && <Intro preset={preset} />}
        </main>
      )}
    </div>
  );
}

function Intro({preset, prompt}: {preset: Preset; prompt?: string}) {
  return (
    <section className="intro">
      {prompt ? <p className="prompt">{prompt}</p> : <Bi en={preset.intro} th={preset.introTh} />}
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

function Charts({preset, section, pick, onPick}: {preset: Preset; section: string; pick?: number; onPick?: (i: number) => void}) {
  return (
    <section className="charts">
      {preset.charts!.map((c, i) => {
        const body = (
          <>
            <div className="chart-title">
              {c.title}
              {c.sections.includes(section) && <span className="badge">your field</span>}
            </div>
            <LineChart chart={c} compact />
          </>
        );
        return onPick ? (
          <button key={c.title} type="button" className={`chart-card pick ${pick === i ? 'on' : ''}`} onClick={() => onPick(i)} aria-pressed={pick === i}>
            {body}
            <span className="pick-mark">{pick === i ? '✓ our chart' : 'Choose'}</span>
          </button>
        ) : (
          <div key={c.title} className="chart-card">
            {body}
          </div>
        );
      })}
    </section>
  );
}

function JoinForm({preset, locked, onJoin}: {preset: Preset; locked: boolean; onJoin: (name: string) => Promise<void>}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  const group = preset.who === 'group';
  if (locked)
    return (
      <div className="notice">
        <Bi en="Joining is closed — ask your teacher." th="ปิดรับคู่ใหม่แล้ว ถามอาจารย์" />
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
  return (
    <form className="join-form card-like" onSubmit={submit}>
      <h2>
        <Bi en={group ? 'Post as a group' : 'Post as a pair'} th={group ? 'โพสต์ในนามกลุ่ม (1 เครื่องต่อกลุ่ม)' : 'โพสต์ในนามคู่ (1 เครื่องต่อคู่)'} />
      </h2>
      <label htmlFor="team-name">{group ? 'Group name' : 'Pair name — both nicknames'}</label>
      <input
        id="team-name"
        value={name}
        maxLength={30}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        placeholder={group ? 'e.g. Sunny Tea team' : 'e.g. Mint & Ploy'}
      />
      <p className="hint" lang="th">
        ใช้ชื่อเล่น ห้ามใช้ชื่อจริงหรือรหัสนักศึกษา · One phone per {group ? 'group' : 'pair'}.
      </p>
      <button className="btn primary big" disabled={busy}>
        {busy ? 'Joining…' : 'Join'}
      </button>
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
    </form>
  );
}

function Composer({client, st, preset, photoAllowed}: {client: WallClient; st: WallState; preset: Preset; photoAllowed: boolean}) {
  const mine = st.mine;
  const [editing, setEditing] = useState(!mine);
  const [text, setText] = useState(mine?.text ?? '');
  const [fields, setFields] = useState<Record<string, string>>(mine?.fields ?? {});
  const [choice, setChoice] = useState<number | undefined>(mine?.choice);
  const [image, setImage] = useState<Draft['image']>(mine?.photo ? 'keep' : null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'photo' | 'send'>('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seen = useRef(!!mine);

  // The first time our post arrives (e.g. after a reload), show it instead of an empty form.
  useEffect(() => {
    if (mine && !seen.current) {
      seen.current = true;
      setEditing(false);
    }
  }, [mine]);

  function startEdit() {
    setText(mine?.text ?? '');
    setFields(mine?.fields ?? {});
    setChoice(mine?.choice);
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

  const items = preset.fields?.items ?? [];
  const filled = items.filter((_, i) => fields[`f${i}`]?.trim()).length;
  const hasText = !!text.trim();
  const hasImage = !!image;
  let missing: [string, string] | null = null;
  if (preset.charts && choice === undefined) missing = ['Choose your chart first.', 'เลือกกราฟก่อน'];
  else if (items.some((f, i) => f.required && !fields[`f${i}`]?.trim())) missing = ['Write your best sentence.', 'เขียนประโยคที่ดีที่สุดของคู่คุณ'];
  else if (preset.fields && !filled && !hasText) missing = ['Fill at least one box.', 'กรอกอย่างน้อย 1 ช่อง'];
  else if (preset.text?.required && !hasText && !hasImage) missing = ['Type your answer.', 'พิมพ์คำตอบ'];
  else if (!preset.fields && !hasText && !hasImage) missing = photoAllowed ? ['Add your photo (or type your fixes).', 'เพิ่มรูป (หรือพิมพ์คำที่แก้)'] : ['Type your answer.', 'พิมพ์คำตอบ'];

  async function send(e: FormEvent) {
    e.preventDefault();
    if (missing) return setErr(missing);
    setErr(null);
    setBusy('send');
    try {
      await client.post({text, fields, choice, image: photoAllowed ? image : undefined});
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
          <Bi en="Posted — hidden until everyone has posted." th="โพสต์แล้ว คำตอบจะซ่อนไว้จนกว่าทุกคู่จะส่ง" />
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
      {preset.charts && (
        <>
          <p className="field-label">1 · Choose your chart</p>
          <Charts preset={preset} section={st.pub?.section ?? ''} pick={choice} onPick={setChoice} />
        </>
      )}
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
              {busy === 'photo' ? 'Preparing photo…' : '📷 Add your marked screenshot'}
            </button>
          )}
        </div>
      )}
      {preset.fields && (
        <div className="fields">
          {preset.charts ? <p className="field-label">2 · {preset.fields.heading}</p> : <Bi className="field-heading" en={preset.fields.heading} th={preset.fields.th} />}
          {items.map((f, i) => (
            <label key={f.label} className="field">
              <span className="field-name">
                {f.label}
                {f.required && <span className="req"> *</span>}
                {f.hint && <span className="field-hint"> · {f.hint}</span>}
              </span>
              {f.frame && (
                <span className="frame">
                  <Rich text={f.frame} />
                </span>
              )}
              {f.example && (
                <span className="frame">
                  e.g. <Rich text={f.example} />
                </span>
              )}
              <textarea
                rows={preset.charts ? 2 : 2}
                maxLength={300}
                value={fields[`f${i}`] ?? ''}
                onChange={(e) => setFields({...fields, [`f${i}`]: e.target.value})}
              />
            </label>
          ))}
          {preset.tip && <p className="tip">{preset.tip}</p>}
        </div>
      )}
      {preset.text && (
        <label className="field">
          <span className="field-name">
            {photoAllowed && preset.id !== 'custom' ? preset.text.label : preset.text.label}
            <span className="th" lang="th">
              {' '}
              · {preset.text.th}
            </span>
          </span>
          <textarea rows={photoAllowed ? 3 : 5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={preset.text.placeholder} />
        </label>
      )}
      <button className="btn primary big" disabled={!!busy}>
        {busy === 'send' ? 'Posting…' : mine ? 'Save changes' : 'Post to the wall'}
      </button>
      {mine && (
        <button type="button" className="link center-link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      {err && <Bi className="error" en={err[0]} th={err[1]} />}
      <p className="hint">
        <Bi en="Hidden from the class until everyone has posted. You can change it until then." th="เพื่อนจะยังไม่เห็นจนกว่าทุกคู่จะส่ง และแก้ไขได้จนถึงตอนนั้น" />
      </p>
    </form>
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

function Progress({pub, preset}: {pub: NonNullable<WallState['pub']>; preset: Preset}) {
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
        <b>{done}</b> of {roster.length} {whoWord(preset, true)} have posted
        {waiting.length > 0 && waiting.length <= 12 && <span className="muted"> · waiting for {waiting.join(', ')}</span>}
      </p>
    </section>
  );
}

function Revealed({client, st, preset}: {client: WallClient; st: WallState; preset: Preset}) {
  const teams = orderedTeams(st.teams).filter(([id]) => st.posts[id]);
  const [open, setOpen] = useState<string | null>(null);
  const loaders = useMemo(() => new Map<string, () => Promise<string | null>>(), [client]);
  const thumbOf = (id: string) => {
    let l = loaders.get(id);
    if (!l) loaders.set(id, (l = () => client.thumb(id)));
    return l;
  };
  return (
    <main className="phone-main">
      <div className="revealed-head">
        <Bi en={`The wall is open — ${teams.length} posts`} th="บอร์ดเปิดแล้ว ดูคำตอบของทุกคู่ได้เลย" />
      </div>
      <div className="phone-board">
        {teams.map(([id, t], i) => {
          const p = st.posts[id];
          return (
            <article
              key={id}
              className={`card ${id === client.tid ? 'mine' : ''}`}
              style={{background: CARD_TINTS[i % CARD_TINTS.length]}}
              onClick={() => p.photo && setOpen(id)}
            >
              <h2>
                {t.name}
                {id === client.tid && <span className="you"> · you</span>}
              </h2>
              {p.photo && <DbImage load={thumbOf(id)} alt={t.name} className="thumb" />}
              <PostBody post={p} preset={preset} />
            </article>
          );
        })}
        {!teams.length && <p className="empty">No posts.</p>}
      </div>
      {open && (
        <PhotoViewer onClose={() => setOpen(null)} title={st.teams[open]?.name ?? ''}>
          <DbImage load={() => client.photo(open)} alt={st.teams[open]?.name ?? ''} />
        </PhotoViewer>
      )}
    </main>
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
