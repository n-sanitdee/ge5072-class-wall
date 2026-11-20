// Wk16 peer review: the projector unlocks the encrypted project pool (public/wk16/pool.enc.json) with the passphrase
// Mew keeps in Teaching/Assignments/PeerReview_Wk16/README_TEACHER_ONLY.md. This computer remembers the passphrase
// (localStorage), so it is typed once; the pool itself is never stored.
import {type EncFile, type Pool, decryptPool} from './review.ts';

const PASS = 'cw:pool-pass';
let cached: Pool | null = null;
let pending: Promise<Pool> | null = null;

export function cachedPool(): Pool | null {
  return cached;
}

export async function unlockPool(pass: string): Promise<Pool> {
  const res = await fetch(`${import.meta.env.BASE_URL}wk16/pool.enc.json`, {cache: 'no-cache'});
  if (!res.ok) throw new Error(`could not load the project pool (${res.status})`);
  const pool = await decryptPool((await res.json()) as EncFile, pass);
  cached = pool;
  try {
    localStorage.setItem(PASS, pass.trim());
  } catch {
    /* private window: type it again next time */
  }
  return pool;
}

/** Unlock with the passphrase this computer remembers; null if there is none (or it no longer works). */
export function autoUnlock(): Promise<Pool | null> {
  if (cached) return Promise.resolve(cached);
  let pass: string | null = null;
  try {
    pass = localStorage.getItem(PASS);
  } catch {
    /* ignore */
  }
  if (!pass) return Promise.resolve(null);
  pending ??= unlockPool(pass).finally(() => (pending = null));
  return pending.catch((e) => {
    if ((e as Error).message === 'wrong-passphrase') forgetPass();
    return null;
  });
}

export function forgetPass() {
  cached = null;
  try {
    localStorage.removeItem(PASS);
  } catch {
    /* ignore */
  }
}
