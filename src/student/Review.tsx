// Week 16 · Peer Review: Final Project — the group's phone (Mew, 20 Nov 2026). Ladpet hands the group another
// section's project; the group marks every sentence (✓ or what is wrong, with the fix), posts, and then sees
// Ajarn's marks for the same sentences. Up to three projects per group. See src/lib/review.ts for the data.
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  type Handout,
  type Key,
  type KeyOut,
  MAX_PROJECTS,
  type Mark,
  type Marks,
  NEEDED,
  TAGS,
  type TagCode,
  agrees,
  compare,
  fmt,
  hasProblem,
  isMarked,
  mergeMarks,
  parseJson,
  parseMarks,
  scoreOf,
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
  // new project arriving never pulls the screen away from Ajarn's marks.
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
        raw={st.mine?.fields?.[`b${k}`]}
        posted={posted(k)}
        keyOut={parseJson<KeyOut>(st.rkey?.[k])}
        next={k + 1 < handouts.length ? () => setTab(k + 1) : undefined}
      />
    </div>
  );
}

const SAVE_DELAY = 500;

function Project({client, k, h, raw, posted, keyOut, next}: {client: WallClient; k: number; h: Handout; raw: string | undefined; posted: boolean; keyOut: KeyOut | null; next?: () => void}) {
  const remote = parseMarks(raw);
  const [marks, setMarks] = useState<Marks>(remote);
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<[string, string] | null>(null);
  const synced = useRef(JSON.stringify(remote));
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);

  // a co-editor's marks: take them when nothing is waiting to be saved here
  useEffect(() => {
    const r = JSON.stringify(parseMarks(raw));
    if (r === synced.current) return;
    if (JSON.stringify(marksRef.current) === synced.current && !running.current) {
      synced.current = r;
      setMarks(parseMarks(raw));
    }
  }, [raw]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (running.current) await running.current;
    const local = marksRef.current;
    if (JSON.stringify(local) === synced.current) return;
    let done!: () => void;
    running.current = new Promise<void>((r) => (done = r));
    setSaveState('saving');
    try {
      const saved = await client.saveMarks(k, parseMarks(synced.current), local);
      synced.current = JSON.stringify(saved);
      // keep anything tapped here while the save was on its way
      const now = mergeMarks(local, marksRef.current, saved);
      if (JSON.stringify(now) !== JSON.stringify(marksRef.current)) setMarks(now);
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
    if (JSON.stringify(marks) === synced.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), SAVE_DELAY);
  }, [marks, flush]);
  useEffect(() => {
    const out = () => void flush().catch(() => {});
    window.addEventListener('pagehide', out);
    return () => {
      window.removeEventListener('pagehide', out);
      if (timer.current) void flush().catch(() => {});
    };
  }, [flush]);
  useEffect(() => setErr(null), [marks]);

  const set = (box: 'p' | 't', i: number, m: Mark) =>
    setMarks((all) => {
      const list = [...all[box]];
      while (list.length <= i) list.push({});
      list[i] = m;
      return {...all, [box]: list};
    });

  const mine = scoreOf(marks.p, marks.t, h.p.length, h.t.length);
  const unmarked = [...h.p.map((_, i) => (isMarked(marks.p[i]) ? '' : `P${i + 1}`)), ...h.t.map((_, i) => (isMarked(marks.t[i]) ? '' : `T${i + 1}`))].filter(Boolean);
  const locked = posted;

  async function post() {
    if (unmarked.length)
      return setErr([
        `Mark every sentence first: ${unmarked.join(', ')} ${unmarked.length === 1 ? 'is' : 'are'} not marked yet (✓ or a problem).`,
        `ให้คะแนนให้ครบทุกประโยคก่อน: ${unmarked.join(', ')} ยังไม่ได้เลือก (✓ หรือข้อผิดพลาด)`,
      ]);
    setBusy(true);
    try {
      await flush();
      await client.postProject(k, JSON.stringify({co: h.co, sc: mine.score}));
    } catch (x) {
      const denied = String((x as {code?: string})?.code ?? x).toLowerCase().includes('permission');
      setErr(
        denied
          ? ['Could not post — the wall has ended or your group was removed.', 'โพสต์ไม่สำเร็จ บอร์ดจบแล้วหรือกลุ่มถูกลบ']
          : ['Could not post — check your internet and try again.', 'โพสต์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'],
      );
    }
    setBusy(false);
  }

  const cmp = keyOut ? compare(h, marks, keyOut) : null;
  return (
    <section className="rv-project card-like">
      <div className="rv-head">
        <div className="rv-kicker">
          Project {k + 1} · from another section <span className="th" lang="th">· งานของกลุ่มจากเซกชันอื่น</span>
        </div>
        <h2 className="rv-co">{h.co}</h2>
        {!locked && (
          <span className={`save-state ${saveState}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — check your internet' : saveState === 'saved' ? 'Saved ✓' : ''}
          </span>
        )}
      </div>

      {locked && (
        <div className="rv-result">
          {keyOut && cmp ? (
            <>
              <div className="rv-scores">
                <div>
                  <span className="rv-score-label">Your marks</span>
                  <b>{fmt(mine.score)}</b>/8
                </div>
                <div className="rv-vs">vs</div>
                <div>
                  <span className="rv-score-label">Ajarn</span>
                  <b>{fmt(keyOut.score)}</b>/8
                </div>
              </div>
              <Bi
                className="rv-agree"
                en={`Same marks as Ajarn on ${cmp.agree} of ${cmp.of} sentences${cmp.agree === cmp.of ? ' — perfect!' : '.'}`}
                th={`ให้คะแนนตรงกับอาจารย์ ${cmp.agree} จาก ${cmp.of} ประโยค`}
              />
              {keyOut.note && <p className="rv-note">{keyOut.note}</p>}
              <p className="hint">
                <Bi en="Look at the sentences where you and Ajarn differ (orange)." th="ดูประโยคที่คะแนนไม่ตรงกับอาจารย์ (สีส้ม)" />
              </p>
            </>
          ) : (
            <div className="rv-pending">
              <Spinner />
              <Bi en="Posted ✓ — getting Ajarn’s marks…" th="โพสต์แล้ว กำลังโหลดคะแนนของอาจารย์…" />
            </div>
          )}
        </div>
      )}

      {!locked && <Legend />}

      {(['p', 't'] as const).map((box) => {
        const texts = box === 'p' ? h.p : h.t;
        const counted = texts.filter((_, i) => !marks[box][i]?.x).length;
        return (
          <div key={box} className="rv-box">
            <h3 className="rv-box-head">
              {box === 'p' ? 'Company Profile' : 'Describing Trends'}
              <span className="rv-box-need">
                {texts.length} {texts.length === 1 ? 'sentence' : 'sentences'} · {NEEDED} needed
              </span>
            </h3>
            {texts.length < NEEDED && (
              <p className="rv-short">
                <Bi
                  en={texts.length ? `Only ${texts.length} — ${NEEDED - texts.length} missing (−1 each).` : `This box is empty — ${NEEDED} sentences missing (−1 each).`}
                  th={texts.length ? `มีแค่ ${texts.length} ประโยค ขาด ${NEEDED - texts.length} ประโยค (หักประโยคละ 1)` : `ช่องนี้ว่าง ขาด ${NEEDED} ประโยค (หักประโยคละ 1)`}
                />
              </p>
            )}
            {texts.map((t, i) => (
              <Sentence
                key={i}
                label={`${box.toUpperCase()}${i + 1}`}
                text={t}
                mark={marks[box][i]}
                onMark={(m) => set(box, i, m)}
                locked={locked}
                ajarn={keyOut ? (keyOut[box][i] ?? {}) : null}
              />
            ))}
            {!locked && texts.length >= NEEDED && counted < NEEDED && (
              <p className="rv-short">
                <Bi en={`Only ${counted} count — ${NEEDED - counted} missing (−1 each).`} th={`นับได้ ${counted} ประโยค ขาด ${NEEDED - counted} (หักประโยคละ 1)`} />
              </p>
            )}
          </div>
        );
      })}

      {!locked && (
        <>
          <ScoreCard s={mine} />
          <button type="button" className="btn primary big" disabled={busy} onClick={post}>
            {busy ? 'Posting…' : 'Post on Ladpet'}
          </button>
          {err && <Bi className="error" en={err[0]} th={err[1]} />}
          <p className="hint">
            <Bi en="After you post, your phone shows Ajarn’s marks for these sentences." th="หลังโพสต์ จะเห็นคะแนนของอาจารย์สำหรับประโยคเหล่านี้" />
          </p>
        </>
      )}
      {locked && next && (
        <button type="button" className="btn primary big" onClick={next}>
          Next project →
        </button>
      )}
      {locked && !next && keyOut && k + 1 < MAX_PROJECTS && (
        <p className="hint">
          <Bi en="Finished early? Your next project appears here in a moment." th="ทำเสร็จเร็ว? งานชิ้นต่อไปจะขึ้นตรงนี้ในอีกสักครู่" />
        </p>
      )}
    </section>
  );
}

function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rv-legend ${open ? 'open' : ''}`}>
      <button type="button" className="rv-legend-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} How to mark · วิธีให้คะแนน
      </button>
      {open && (
        <>
          <p>
            <Bi en="Start at 8. Mark every sentence: ✓ if it is correct, or tap what is wrong (more than one is fine) and write the fix." th="เริ่มที่ 8 คะแนน ทุกประโยคต้องเลือก ✓ ถ้าถูก หรือแตะสิ่งที่ผิด (เลือกได้มากกว่าหนึ่ง) แล้วเขียนคำที่แก้" />
          </p>
          <ul>
            <li>
              <b>Grammar</b> −0.5 each (tap twice for two errors) — verb -s, tense, a/an, plural, a fragment with no subject or verb · <span lang="th">ไวยากรณ์ หักที่ละ 0.5</span>
            </li>
            <li>
              <b>Spelling</b>, <b>Punctuation</b>, <b>It / They</b> −0.5 once each for the whole project · <span lang="th">หัก 0.5 ครั้งเดียวต่อเรื่อง</span>
            </li>
            <li>
              <b>Doesn't count</b> — profile: a heading only, not a sentence. Trends: no change, no word from the list, or a plan/goal (“aims to increase”). Fewer than 6 that count: −1 for each missing · <span lang="th">ไม่นับ หักประโยคละ 1 ถ้าไม่ครบ 6</span>
            </li>
          </ul>
          <p className="hint">Numbering, headings and word tags like (increase) were taken out — don't mark them.</p>
        </>
      )}
    </div>
  );
}

function Sentence({label, text, mark, onMark, locked, ajarn}: {label: string; text: string; mark: Mark | undefined; onMark: (m: Mark) => void; locked: boolean; ajarn: {k?: Key; n?: string} | null}) {
  const m = mark ?? {};
  const toggle = (c: TagCode) => {
    const next: Mark = {...m};
    delete next.ok;
    if (c === 'g') next.g = ((m.g ?? 0) + 1) % 3 || undefined;
    else next[c] = m[c] ? undefined : 1;
    for (const key of Object.keys(next) as (keyof Mark)[]) if (next[key] === undefined) delete next[key];
    if (!hasProblem(next)) delete next.fix;
    onMark(next);
  };
  const agree = ajarn ? agrees(m, ajarn.k) : null;
  return (
    <div className={`rv-sent ${m.ok ? 'ok' : hasProblem(m) ? 'bad' : ''} ${agree === null ? '' : agree ? 'agree' : 'differ'}`}>
      <div className="rv-line">
        <span className="rv-n">{label}</span>
        <p className="rv-text">{text}</p>
      </div>
      {!locked ? (
        <>
          <div className="rv-tags">
            <button type="button" className={`rv-tag ok ${m.ok ? 'on' : ''}`} onClick={() => onMark({ok: 1})}>
              ✓ Correct
            </button>
            {TAGS.map((t) => (
              <button key={t.c} type="button" className={`rv-tag ${m[t.c] ? 'on' : ''}`} onClick={() => toggle(t.c)} title={`${t.th} · ${t.pts}`}>
                {t.en}
                {t.c === 'g' && (m.g ?? 0) > 1 ? ' ×2' : ''}
              </button>
            ))}
          </div>
          {hasProblem(m) && (
            <input
              className="rv-fix"
              value={m.fix ?? ''}
              maxLength={400}
              onChange={(e) => onMark({...m, fix: e.target.value || undefined})}
              placeholder="Write the fix (optional) · เขียนคำที่แก้"
            />
          )}
        </>
      ) : (
        <div className="rv-compare">
          <div className="rv-who">
            <span className="rv-who-label">You</span>
            <Chips k={m} />
            {m.fix && <span className="rv-fix-shown">→ {m.fix}</span>}
          </div>
          {ajarn && (
            <div className="rv-who ajarn">
              <span className="rv-who-label">Ajarn</span>
              <Chips k={ajarn.k} />
              <span className={`rv-badge ${agree ? 'yes' : 'no'}`}>{agree ? 'same' : 'different'}</span>
              {ajarn.n && <p className="rv-ajarn-note">{ajarn.n}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Chips({k}: {k: Key | undefined}) {
  if (!hasProblem(k)) return <span className="rv-chip ok">✓ correct</span>;
  return (
    <>
      {TAGS.filter((t) => k![t.c]).map((t) => (
        <span key={t.c} className={`rv-chip ${t.c}`}>
          {t.en}
          {t.c === 'g' && (k!.g ?? 0) > 1 ? ` ×${k!.g}` : ''}
        </span>
      ))}
    </>
  );
}

function ScoreCard({s}: {s: ReturnType<typeof scoreOf>}) {
  const rows: [string, string][] = [];
  if (s.missingP) rows.push([`Company Profile: ${s.missingP} missing`, `−${s.missingP}`]);
  if (s.missingT) rows.push([`Describing Trends: ${s.missingT} missing`, `−${s.missingT}`]);
  if (s.grammar) rows.push([`Grammar: ${s.grammar} ${s.grammar === 1 ? 'error' : 'errors'}`, `−${fmt(Math.min(5, s.grammar * 0.5))}`]);
  if (s.s) rows.push(['Spelling', '−0.5']);
  if (s.u) rows.push(['Punctuation', '−0.5']);
  if (s.o) rows.push(['It / They', '−0.5']);
  return (
    <div className="rv-scorecard">
      <div className="rv-total">
        <Bi en="Your score" th="คะแนนที่กลุ่มให้" /> <b>{fmt(s.score)}</b>
        <span>/8</span>
      </div>
      {rows.length ? (
        <ul>
          {rows.map(([a, b]) => (
            <li key={a}>
              <span>{a}</span>
              <b>{b}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No points off yet.</p>
      )}
    </div>
  );
}
