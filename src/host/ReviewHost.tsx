// Week 16 peer review on the projector (Mew, 20 Nov 2026): unlocking the project pool, and one group's marks next
// to Ajarn's for the big view.
import {type FormEvent, useEffect, useState} from 'react';
import {autoUnlock, cachedPool, forgetPass, unlockPool} from '../lib/pool.ts';
import {type Handout, type KeyOut, MAX_PROJECTS, type Pool, agrees, compare, fmt, parseJson, parseMarks, scoreOf} from '../lib/review.ts';
import type {Post} from '../lib/types.ts';
import {Chips} from '../student/Review.tsx';

/** "Project pool: ✓ unlocked" or the passphrase box. The passphrase is typed once per computer. */
export function PoolUnlock({onPool, compact}: {onPool: (p: Pool | null) => void; compact?: boolean}) {
  const [pool, setPool] = useState<Pool | null>(cachedPool());
  const [pass, setPass] = useState('');
  const [state, setState] = useState<'' | 'trying' | 'busy' | 'wrong' | 'error'>(cachedPool() ? '' : 'trying');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (pool) return;
    let live = true;
    autoUnlock().then((p) => {
      if (!live) return;
      setState('');
      if (p) {
        setPool(p);
        onPool(p);
      }
    });
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pass.trim()) return;
    setState('busy');
    try {
      const p = await unlockPool(pass);
      setPool(p);
      setState('');
      onPool(p);
    } catch (x) {
      const wrong = (x as Error).message === 'wrong-passphrase';
      setState(wrong ? 'wrong' : 'error');
      setMsg(wrong ? 'Wrong passphrase.' : (x as Error).message);
    }
  }

  if (pool)
    return (
      <div className={`pool-ok ${compact ? 'compact' : ''}`}>
        ✓ Project pool unlocked — {pool.projects.length} Final Projects (graded up to {pool.built})
        <button
          type="button"
          className="link"
          onClick={() => {
            forgetPass();
            setPool(null);
            onPool(null);
          }}
        >
          Lock
        </button>
      </div>
    );
  if (state === 'trying') return <div className="pool-ok compact muted">Unlocking the project pool…</div>;
  return (
    <form className={`pool-unlock ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <label>
        <span>Project pool passphrase</span>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" placeholder="xxxx-xxxx-xxxx" />
      </label>
      <button className="btn primary" disabled={state === 'busy'}>
        {state === 'busy' ? 'Unlocking…' : 'Unlock'}
      </button>
      {msg && <span className="error">{msg}</span>}
      <p className="muted">
        Once per computer. It is in README_TEACHER_ONLY.md (OneDrive › Teaching › Assignments › PeerReview_Wk16). Groups get their projects as soon as the pool is unlocked.
      </p>
    </form>
  );
}

/** The big view: each project this group marked, every sentence with the group's marks and Ajarn's. */
export function ReviewDetail({post, review, rkey}: {post: Post; review?: Record<string, string>; rkey?: Record<string, string>}) {
  const projects = [];
  for (let k = 0; k < MAX_PROJECTS; k++) {
    const h = parseJson<Handout>(review?.[k]);
    if (!h || !post.fields?.[`f${k}`]) continue;
    projects.push({k, h, marks: parseMarks(post.fields[`b${k}`]), key: parseJson<KeyOut>(rkey?.[k])});
  }
  if (!projects.length) return <p className="muted">No project posted yet.</p>;
  return (
    <div className="rv-detail">
      {projects.map(({k, h, marks, key}) => {
        const sc = scoreOf(marks.p, marks.t, h.p.length, h.t.length).score;
        const cmp = key ? compare(h, marks, key) : null;
        return (
          <section key={k} className="rv-detail-project">
            <h3>
              {h.co}
              <span className="rv-detail-scores">
                group <b>{fmt(sc)}</b> · Ajarn <b>{fmt(key?.score)}</b>
                {cmp && (
                  <>
                    {' '}
                    · same on {cmp.agree}/{cmp.of}
                  </>
                )}
              </span>
            </h3>
            <table>
              <tbody>
                {(['p', 't'] as const).flatMap((box) =>
                  (box === 'p' ? h.p : h.t).map((t, i) => {
                    const m = marks[box][i];
                    const kk = key?.[box][i];
                    const same = key ? agrees(m, kk?.k) : true;
                    return (
                      <tr key={`${box}${i}`} className={same ? '' : 'differ'}>
                        <th>{`${box.toUpperCase()}${i + 1}`}</th>
                        <td className="rv-d-text">{t}</td>
                        <td className="rv-d-marks">
                          <Chips k={m} />
                          {m?.fix && <div className="rv-fix-shown">→ {m.fix}</div>}
                        </td>
                        <td className="rv-d-marks">
                          {key && <Chips k={kk?.k} />}
                          {kk?.n && <div className="rv-ajarn-note">{kk.n}</div>}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            {key?.note && <p className="rv-note">{key.note}</p>}
          </section>
        );
      })}
    </div>
  );
}
