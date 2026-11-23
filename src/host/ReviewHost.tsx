// Week 16 peer review on the projector: loading the project pool, and one group's version next to Ajarn's for the
// big view. The pool unlocks by itself (23 Nov 2026, Mew: no passcode box): the teacher link carries the passphrase
// once (#host?k=…, see main.tsx), and this computer remembers it.
import {type FormEvent, useEffect, useState} from 'react';
import {autoUnlock, cachedPool, forgetPass, unlockPool} from '../lib/pool.ts';
import {type Handout, type KeyOut, MAX_PROJECTS, type Pool, parseJson, shotKey, shotsOf, textKey} from '../lib/review.ts';
import type {Post} from '../lib/types.ts';
import {Versions} from '../student/Review.tsx';

/** "✓ Projects ready" — or, on a computer that has not opened the teacher link yet, a line saying so. */
export function PoolUnlock({onPool, compact}: {onPool: (p: Pool | null) => void; compact?: boolean}) {
  const [pool, setPool] = useState<Pool | null>(cachedPool());
  const [pass, setPass] = useState('');
  const [typing, setTyping] = useState(false);
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
      setMsg(wrong ? 'That does not open the projects.' : (x as Error).message);
    }
  }

  if (pool)
    return (
      <div className={`pool-ok ${compact ? 'compact' : ''}`}>
        ✓ {pool.projects.length} Final Projects ready
        <button
          type="button"
          className="link"
          title="Forget the projects on this computer"
          onClick={() => {
            forgetPass();
            setPool(null);
            onPool(null);
          }}
        >
          Forget on this computer
        </button>
      </div>
    );
  if (state === 'trying') return <div className="pool-ok compact muted">Loading the projects…</div>;
  return (
    <div className={`pool-unlock ${compact ? 'compact' : ''}`}>
      <p>
        <b>Open Ladpet from your teacher link</b> to load the Final Projects on this computer — it is in README_TEACHER_ONLY.md (OneDrive › Teaching › Assignments ›
        PeerReview_Wk16). After that, this computer remembers.
      </p>
      {!typing ? (
        <button type="button" className="link" onClick={() => setTyping(true)}>
          No link here? Type the passcode instead
        </button>
      ) : (
        <form onSubmit={submit}>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" placeholder="passcode" autoFocus />
          <button className="btn primary" disabled={state === 'busy'}>
            {state === 'busy' ? 'Loading…' : 'Load the projects'}
          </button>
          {msg && <span className="error">{msg}</span>}
        </form>
      )}
    </div>
  );
}

/** The big view: each project this group posted — the group's version next to Ajarn's. */
export function ReviewDetail({post, review, rkey}: {post: Post; review?: Record<string, string>; rkey?: Record<string, string>}) {
  const projects = [];
  for (let k = 0; k < MAX_PROJECTS; k++) {
    const h = parseJson<Handout>(review?.[k]);
    if (!h || !post.fields?.[`f${k}`]) continue;
    projects.push({k, h, key: parseJson<KeyOut>(rkey?.[k])});
  }
  if (!projects.length) return <p className="muted">No project posted yet.</p>;
  return (
    <div className="rv-detail">
      {projects.map(({k, h, key}) => (
        <section key={k} className="rv-detail-project">
          <h3>{h.co}</h3>
          <Versions h={h} text={post.fields?.[textKey(k)]} shots={shotsOf(post.fields?.[shotKey(k)])} keyOut={key} big />
        </section>
      ))}
    </div>
  );
}
