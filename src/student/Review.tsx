// Week 16 · Peer Review: Final Project — the group's phone. Ladpet hands the group another section's project as a
// paragraph. Redesign (Mew, 23 Nov 2026, after CA48): no per-sentence marks and no error types — the group either
// screenshots the paragraph, writes the fixes on the screenshot and uploads it, or copies the paragraph into the box
// and fixes it there (or both). After posting, the phone shows the group's version next to Ajarn's. Up to three
// projects per group. See src/lib/review.ts for the data.
import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import {ImageError, prepareImage} from '../lib/image.ts';
import {
  CRITERIA,
  DED_GROUPS,
  type Ded,
  type DedCode,
  type Handout,
  type KeyOut,
  MAX_PROJECTS,
  MAX_SHOTS,
  SHOT_CHARS,
  AJARN_RULE,
  OTHER_GRAMMAR,
  ajarnCell,
  ajarnDed,
  ajarnScore,
  ajarnUnits,
  copyText,
  dedKey,
  dedScore,
  fmt,
  groupCell,
  groupOff,
  groupScore,
  paragraphs,
  parseDed,
  parseJson,
  pointsOff,
  rowDiffers,
  shotKey,
  shotsOf,
  textKey,
} from '../lib/review.ts';
import type {WallClient, WallState} from '../lib/wall-client.ts';
import {Bi, Spinner} from '../ui/common.tsx';

export function ReviewComposer({client, st}: {client: WallClient; st: WallState}) {
  const handouts: Handout[] = [];
  for (let k = 0; k < MAX_PROJECTS; k++) {
    const h = parseJson<Handout>(st.review?.[k]);
    if (!h) break;
    handouts.push(h);
  }
  const posted = (k: number) => !!st.mine?.fields?.[`f${k}`];
  const firstOpen = handouts.findIndex((_, k) => !posted(k));
  const [tab, setTab] = useState<number | null>(null);
  const start = firstOpen >= 0 ? firstOpen : Math.max(0, handouts.length - 1);
  // Pick the project once (the first one not posted yet); after that only the group moves on ("Next project"), so a
  // new project arriving never pulls the screen away from Ajarn's version.
  useEffect(() => {
    if (tab === null && handouts.length) setTab(start);
  }, [tab, handouts.length, start]);
  const k = Math.min(tab ?? start, Math.max(0, handouts.length - 1));

  if (!handouts.length)
    return (
      <section className="rv-wait card-like">
        <Spinner />
        <Bi en="Getting your project…" th="กำลังรับงานของกลุ่มคุณ…" />
        <p className="hint">
          <Bi en="Ladpet gives each group a Final Project from another section." th="Ladpet จะให้งาน Final Project จากเซกชันอื่นกับแต่ละกลุ่ม" />
        </p>
      </section>
    );

  return (
    <div className="rv">
      {handouts.length > 1 && (
        <nav className="rv-tabs">
          {handouts.map((h, i) => (
            <button key={i} type="button" className={`rv-tab ${i === k ? 'on' : ''}`} onClick={() => setTab(i)}>
              {posted(i) ? '✓ ' : ''}Project {i + 1}
              <span className="rv-tab-co">{h.co}</span>
            </button>
          ))}
        </nav>
      )}
      <Project
        key={`${client.tid}-${k}`}
        client={client}
        k={k}
        h={handouts[k]}
        rawText={st.mine?.fields?.[textKey(k)]}
        shots={shotsOf(st.mine?.fields?.[shotKey(k)])}
        rawDed={st.mine?.fields?.[dedKey(k)]}
        sc={groupScore(st.mine?.fields?.[`f${k}`], st.mine?.fields?.[dedKey(k)])}
        posted={posted(k)}
        keyOut={parseJson<KeyOut>(st.rkey?.[k])}
        next={k + 1 < handouts.length ? () => setTab(k + 1) : undefined}
      />
    </div>
  );
}

const SAVE_DELAY = 600;

function Project({client, k, h, rawText, shots, rawDed, sc, posted, keyOut, next}: {client: WallClient; k: number; h: Handout; rawText: string | undefined; shots: string[]; rawDed: string | undefined; sc: number | undefined; posted: boolean; keyOut: KeyOut | null; next?: () => void}) {
  const remote = rawText ?? '';
  const [text, setText] = useState(remote);
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [busy, setBusy] = useState<'' | 'post' | 'shot'>('');
  const [err, setErr] = useState<[string, string] | null>(null);
  const synced = useRef(remote);
  const textRef = useRef(text);
  textRef.current = text;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // the Deductions section saves each tap itself; Post waits for those saves and posts the score with the project
  const flushDed = useRef<() => Promise<void>>(async () => {});

  // a co-editor's typing: take it when nothing is waiting to be saved here
  useEffect(() => {
    if (remote === synced.current) return;
    if (textRef.current === synced.current && !running.current) {
      synced.current = remote;
      setText(remote);
    }
  }, [remote]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (running.current) await running.current;
    const local = textRef.current;
    if (local === synced.current) return;
    let done!: () => void;
    running.current = new Promise<void>((r) => (done = r));
    setSaveState('saving');
    try {
      const base = synced.current;
      const saved = await client.saveField(textKey(k), base, local, true);
      synced.current = saved;
      // a co-editor's text came in with the merge: show it, unless more was typed here meanwhile
      if (textRef.current === local && saved !== local) setText(saved);
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      throw e;
    } finally {
      running.current = null;
      done();
    }
  }, [client, k]);

  useEffect(() => {
    if (text === synced.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), SAVE_DELAY);
  }, [text, flush]);
  useEffect(() => {
    const out = () => void flush().catch(() => {});
    window.addEventListener('pagehide', out);
    return () => {
      window.removeEventListener('pagehide', out);
      if (timer.current) void flush().catch(() => {});
    };
  }, [flush]);
  useEffect(() => setErr(null), [text, shots.length]);

  async function pickShot(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy('shot');
    setErr(null);
    try {
      const {full} = await prepareImage(file);
      if (full.length > SHOT_CHARS) throw new ImageError('too-big');
      await client.updateField(shotKey(k), (cur) => JSON.stringify([...shotsOf(cur), full].slice(-MAX_SHOTS)));
    } catch (x) {
      setErr(
        x instanceof ImageError
          ? ['That picture could not be used — try a normal screenshot (PNG or JPG).', 'ใช้รูปนี้ไม่ได้ ลองใช้ภาพหน้าจอปกติ (PNG หรือ JPG)']
          : ['Could not upload — check your internet and try again.', 'อัปโหลดไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
      );
    }
    setBusy('');
  }

  async function removeShot(i: number) {
    const gone = shots[i];
    setBusy('shot');
    try {
      await client.updateField(shotKey(k), (cur) => {
        const left = shotsOf(cur).filter((s) => s !== gone);
        return left.length ? JSON.stringify(left) : null;
      });
    } catch {
      setErr(['Could not remove it — check your internet.', 'ลบไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต']);
    }
    setBusy('');
  }

  async function post() {
    if (!shots.length && !text.trim())
      return setErr([
        'Upload your marked screenshot, or paste the paragraph in the box and fix it — then post.',
        'อัปโหลดภาพหน้าจอที่เขียนแก้แล้ว หรือวางย่อหน้าในช่องแล้วแก้ไข แล้วจึงโพสต์',
      ]);
    setBusy('post');
    try {
      await flush();
      await flushDed.current();
      // the score as saved (the group's phones may have tapped at the same time), read in one transaction
      const saved = await client.updateField(dedKey(k), (cur) => cur);
      await client.postProject(k, JSON.stringify({co: h.co, sc: dedScore(parseDed(saved))}));
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

  return (
    <section className="rv-project card-like">
      <div className="rv-head">
        <div className="rv-kicker">
          Project {k + 1} · from another section <span className="th" lang="th">· งานของกลุ่มจากเซกชันอื่น</span>
        </div>
        {!posted && (
          <span className={`save-state ${saveState}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — check your internet' : saveState === 'saved' ? 'Saved ✓' : ''}
          </span>
        )}
      </div>

      {!posted ? (
        <>
          <ol className="rv-how">
            <li>
              <Bi en="Screenshot the paragraph below (two screenshots if it is long)." th="แคปหน้าจอย่อหน้าด้านล่าง (ถ้ายาว แคป 2 รูปได้)" />
            </li>
            <li>
              <Bi en="Write your fixes on the screenshot (Photos → Edit → Markup)." th="เขียนคำที่แก้ลงบนภาพหน้าจอ (รูปภาพ → แก้ไข → มาร์กอัป)" />
            </li>
            <li>
              <Bi en="Upload it here (or paste the paragraph in the box and fix it)." th="อัปโหลดที่นี่ (หรือวางย่อหน้าในช่องแล้วแก้ไข)" />
            </li>
            <li>
              <Bi en="Take points off in Deductions, check the score, then post." th="หักคะแนนในส่วน Deductions ดูคะแนน แล้วโพสต์" />
            </li>
          </ol>
          <Paragraph h={h} />
          <CopyButton text={copyText(h)} />

          <div className="rv-shot">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickShot(e.target.files?.[0])} />
            {shots.map((s, i) => (
              <div key={i} className="photo-preview">
                <img src={s} alt={`Your marked screenshot ${i + 1}`} className="rv-shot-img" />
                <div className="photo-btns">
                  <button type="button" className="link" onClick={() => removeShot(i)} disabled={!!busy}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {shots.length < MAX_SHOTS && (
              <button type="button" className="btn photo-btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                {busy === 'shot' ? 'Uploading screenshot…' : shots.length ? '📷 Add another screenshot (if the paragraph did not fit)' : '📷 Upload your marked screenshot'}
              </button>
            )}
          </div>

          <label className="rv-fixbox">
            <Bi className="rv-fixbox-label" en="Or paste the paragraph here and fix it" th="หรือวางย่อหน้าที่นี่แล้วแก้ไข" />
            <textarea value={text} rows={9} maxLength={8000} onChange={(e) => setText(e.target.value)} placeholder="Paste the paragraph here, then fix the mistakes · วางย่อหน้าที่นี่ แล้วแก้คำที่ผิด" />
          </label>

          <Deductions client={client} k={k} raw={rawDed} flushRef={flushDed} />

          <button type="button" className="btn primary big" disabled={!!busy} onClick={post}>
            {busy === 'post' ? 'Posting…' : 'Post on Ladpet'}
          </button>
          {err && <Bi className="error" en={err[0]} th={err[1]} />}
          <p className="hint">
            <Bi en="Everyone in your group can work on this from their own phone. After you post, you see Ajarn’s version and score." th="ทุกคนในกลุ่มทำได้จากโทรศัพท์ของตัวเอง หลังโพสต์ จะเห็นฉบับและคะแนนของอาจารย์" />
          </p>
        </>
      ) : (
        <>
          <div className="rv-posted">
            <span className="tick">✓</span> <Bi en="Posted" th="โพสต์แล้ว" />
          </div>
          <Versions h={h} text={text} shots={shots} keyOut={keyOut} />
          {sc !== undefined && <ScoreCompare h={h} ded={parseDed(rawDed)} sc={sc} keyOut={keyOut} />}
          {next && (
            <button type="button" className="btn primary big" onClick={next}>
              Next project →
            </button>
          )}
          {!next && keyOut && k + 1 < MAX_PROJECTS && (
            <p className="hint">
              <Bi en="Finished early? Your next project appears here in a moment." th="ทำเสร็จเร็ว? งานชิ้นต่อไปจะขึ้นตรงนี้ในอีกสักครู่" />
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** After the fix box (Mew, 23 Nov 2026 evening): take points off with the course criteria and see the score /8.
 *  Each tap is saved at once (a transaction on that one criterion), so the group's phones share one set. */
function Deductions({client, k, raw, flushRef}: {client: WallClient; k: number; raw: string | undefined; flushRef: {current: () => Promise<void>}}) {
  const [ded, setDed] = useState<Ded>(() => parseDed(raw));
  const [state, setState] = useState<'' | 'error'>('');
  const pending = useRef(0);
  const running = useRef<Promise<unknown>>(Promise.resolve());
  // a co-editor's taps: take them when nothing from this phone is waiting to be saved
  useEffect(() => {
    if (!pending.current) setDed(parseDed(raw));
  }, [raw]);
  useEffect(() => {
    flushRef.current = async () => {
      await running.current.catch(() => {});
    };
  }, [flushRef]);

  function set(c: DedCode, v: number) {
    const max = CRITERIA.find((x) => x.c === c)!.max;
    const n = Math.max(0, Math.min(max, v));
    setDed((d) => ({...d, [c]: n}));
    pending.current++;
    const save = client
      .updateField(dedKey(k), (cur) => {
        const d: Ded = {...parseDed(cur), [c]: n};
        if (!n) delete d[c];
        return Object.keys(d).length ? JSON.stringify(d) : null;
      })
      .then(() => setState(''))
      .catch(() => setState('error'))
      .finally(() => pending.current--);
    running.current = running.current.then(() => save);
  }

  const score = dedScore(ded);
  return (
    <section className="rv-ded">
      <h3 className="rv-ded-title">
        <Bi en="Deductions" th="การหักคะแนน" />
      </h3>
      <p className="rv-ded-intro">
        <Bi en="Start at 8, then take points off in both groups. Ajarn's score uses the same rule." th="เริ่มที่ 8 คะแนน แล้วหักคะแนนทั้งสองหมวด คะแนนของอาจารย์ใช้เกณฑ์เดียวกัน" />
      </p>
      {DED_GROUPS.map((g, gi) => {
        const off = groupOff(g.id, ded);
        return (
          <div key={g.id} className={`rv-ded-grp grp-${g.id}`} role="group" aria-label={g.en}>
            <div className="rv-ded-grp-head">
              <span className="rv-ded-grp-n">{gi + 1}</span>
              <div className="rv-ded-grp-name">
                <b>{g.en}</b>
                <span className="th" lang="th">
                  {g.th}
                </span>
              </div>
              <span className="rv-ded-grp-pts">{g.pts}</span>
            </div>
            {CRITERIA.filter((cr) => cr.grp === g.id).map((cr) => {
              const v = ded[cr.c] ?? 0;
              const p = pointsOff(cr.c, v);
              return (
                <div key={cr.c} className={`rv-ded-row ${p ? 'off' : ''}`}>
                  <div className="rv-ded-what">
                    <b>{cr.en}</b>
                    <span className="th" lang="th">
                      {cr.th}
                    </span>
                    <span className="rv-ded-hint">
                      {cr.hint} <b>{cr.pts}</b>
                    </span>
                  </div>
                  <div className="rv-ded-ctl">
                    <div className="rv-step">
                      <button type="button" aria-label={`${cr.en}: one less`} onClick={() => set(cr.c, v - 1)} disabled={!v}>
                        −
                      </button>
                      <span className="rv-step-n">{v}</span>
                      <button type="button" aria-label={`${cr.en}: one more`} onClick={() => set(cr.c, v + 1)} disabled={v >= cr.max}>
                        +
                      </button>
                    </div>
                    <span className="rv-ded-pts">{p ? `−${fmt(p)}` : '0'}</span>
                  </div>
                </div>
              );
            })}
            <div className="rv-ded-grp-sum">
              {g.en}: <b>{off ? `−${fmt(off)}` : '0'}</b>
            </div>
          </div>
        );
      })}
      <div className="rv-total">
        <Bi en="Your score" th="คะแนนที่กลุ่มให้" /> <b>{fmt(score)}</b>
        <span>/8</span>
      </div>
      {state === 'error' && <Bi className="error" en="Not saved — check your internet and tap again." th="ยังไม่บันทึก ตรวจสอบอินเทอร์เน็ตแล้วกดใหม่" />}
    </section>
  );
}

/** After posting (phone) and on the projector: the group's deductions and score next to Ajarn's (her grade and her
 *  deductions as she graded; 26 Nov 2026). */
export function ScoreCompare({h, ded, sc, keyOut, big}: {h: Handout; ded: Ded; sc: number; keyOut: KeyOut | null; big?: boolean}) {
  const aj = keyOut ? ajarnDed(keyOut) : null;
  return (
    <div className={`rv-result ${big ? 'big' : ''}`}>
      <div className="rv-scores">
        <div>
          <span className="rv-score-label">{big ? 'Group' : 'Your group'}</span>
          <b>{fmt(sc)}</b>/8
        </div>
        <span className="rv-vs">vs</span>
        <div>
          <span className="rv-score-label">Ajarn</span>
          <b>{keyOut ? fmt(ajarnScore(keyOut)) : '…'}</b>/8
        </div>
      </div>
      <table className="rv-ded-table">
        <thead>
          <tr>
            <th>
              <Bi en="Deductions" th="การหักคะแนน" />
            </th>
            <th>{big ? 'Group' : 'Your group'}</th>
            <th>Ajarn</th>
          </tr>
        </thead>
        <tbody>
          {DED_GROUPS.map((g) => (
            <Fragment key={g.id}>
              <tr className={`rv-grp-row grp-${g.id}`}>
                <th colSpan={3}>
                  {g.en} <span className="th" lang="th">{g.th}</span> <span className="rv-grp-pts">{g.pts}</span>
                </th>
              </tr>
              {CRITERIA.filter((cr) => cr.grp === g.id).map((cr) => (
                <tr key={cr.c} className={aj && rowDiffers(cr.c, ded, aj) ? 'differ' : ''}>
                  <td>
                    {cr.en}
                    <span className="th" lang="th">
                      {cr.th}
                    </span>
                  </td>
                  <td>{groupCell(cr.c, ded)}</td>
                  <td>{aj ? ajarnCell(cr.c, aj) : '…'}</td>
                </tr>
              ))}
              {g.id === 'l' && aj && aj.g > 0 && (
                <tr className="differ rv-aj-only">
                  <td>
                    {OTHER_GRAMMAR.en}
                    <span className="th" lang="th">
                      {OTHER_GRAMMAR.th} · {OTHER_GRAMMAR.hint}
                    </span>
                  </td>
                  <td>—</td>
                  <td>{ajarnCell('g', aj)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {aj && <Bi className="rv-aj-rule" en={AJARN_RULE.en} th={AJARN_RULE.th} />}
    </div>
  );
}

/** The project as one card: what the group screenshots. */
function Paragraph({h}: {h: Handout}) {
  const {p, t} = paragraphs(h);
  return (
    <div className="rv-para">
      <h2 className="rv-co">{h.co}</h2>
      <h3 className="rv-para-head">Company Profile</h3>
      {p ? <p>{p}</p> : <p className="rv-empty">(This box was left empty.)</p>}
      <h3 className="rv-para-head">Describing Trends</h3>
      {t ? <p>{t}</p> : <p className="rv-empty">(This box was left empty.)</p>}
    </div>
  );
}

function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // older phones / no permission: copy through a hidden box
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }
  return (
    <button type="button" className="btn rv-copy" onClick={copy}>
      {copied ? 'Copied ✓ — paste it in the box below' : '📋 Copy the paragraph'}
    </button>
  );
}

/** After posting (phone) and on the projector: the group's version next to Ajarn's. */
export function Versions({h, text, shots = [], keyOut, big}: {h: Handout; text?: string; shots?: string[]; keyOut: KeyOut | null; big?: boolean}) {
  return (
    <div className={`rv-versions ${big ? 'big' : ''}`}>
      <div className="rv-version mine">
        <div className="rv-version-head">
          <Bi en={big ? "Group's version" : 'Your version'} th={big ? 'ฉบับของกลุ่ม' : 'ฉบับของกลุ่มคุณ'} />
        </div>
        {shots.map((s, i) => (
          <img key={i} src={s} alt={`The group's marked screenshot ${i + 1}`} className="rv-shot-img" />
        ))}
        {text?.trim() && <p className="rv-version-text">{text}</p>}
        {!shots.length && !text?.trim() && <p className="muted">—</p>}
      </div>
      <div className="rv-version ajarn">
        <div className="rv-version-head">
          <Bi en="Ajarn's version" th="ฉบับของอาจารย์" />
        </div>
        {keyOut ? (
          <AjarnVersion h={h} keyOut={keyOut} />
        ) : (
          <div className="rv-pending">
            <Spinner />
            <Bi en="Getting Ajarn’s version…" th="กำลังโหลดฉบับของอาจารย์…" />
          </div>
        )}
      </div>
    </div>
  );
}

export function AjarnVersion({h, keyOut}: {h: Handout; keyOut: KeyOut}) {
  const units = ajarnUnits(h, keyOut);
  const notes = units.filter((u) => u.n);
  const part = (box: 'p' | 't') => {
    const us = units.filter((u) => u.box === box);
    if (!us.length) return <p className="rv-empty">(This box was left empty.)</p>;
    return (
      <p>
        {us.map((u, i) => (
          <span key={i}>
            {i ? ' ' : ''}
            {u.n ? (
              <mark className="rv-aj-hl">
                {u.text}
                <sup>{u.n}</sup>
              </mark>
            ) : (
              u.text
            )}
          </span>
        ))}
      </p>
    );
  };
  return (
    <div className="rv-aj">
      <h3 className="rv-para-head">Company Profile</h3>
      {part('p')}
      <h3 className="rv-para-head">Describing Trends</h3>
      {part('t')}
      {keyOut.note && <p className="rv-note">{keyOut.note}</p>}
      {notes.length ? (
        <ol className="rv-aj-notes">
          {notes.map((u) => (
            <li key={u.n} value={u.n}>
              {u.note}
            </li>
          ))}
        </ol>
      ) : (
        !keyOut.note && <p className="rv-aj-none">Ajarn found no mistakes in these sentences.</p>
      )}
    </div>
  );
}
