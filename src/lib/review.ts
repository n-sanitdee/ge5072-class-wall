// Week 16 · Peer Review: Final Project (Mew, 20 Nov 2026). Each project group marks another section's Final
// Project (its 6 Company Profile + 6 Describing Trends sentences) with the same /8 rule Mew grades with, posts, and
// then sees Mew's own marks for the same sentences.
//
// The projects come from a PRIVATE pool (Teaching/Assignments/PeerReview_Wk16/build_pool.py): the site carries only
// an encrypted copy (public/wk16/pool.enc.json, scripts/encrypt-pool.ts) that the teacher's projector unlocks with a
// passphrase. The host then writes, per group: review/<tid>/<k> = the k-th project WITHOUT marks (a Handout), and —
// only after the group has posted it — rkey/<tid>/<k> = Mew's marks (a KeyOut).
//
// A group's post (fields, all JSON strings): b<k> = its marks for project k (co-edited), f<k> = {co, sc} written when
// it posts project k, f<k+3> = the host's summary {co, sc, aj, agree, of} once the marks are compared.
// This file has no browser-only code: the scripts and tests import it too.

/** One mark on one sentence. Mew's marks (Key) use the same letters: g = grammar errors (0.5 each), s = spelling,
 *  u = punctuation, o = pronoun (It/They) — 0.5 once per project each — and x = does not count (−1 if fewer than 6). */
export type Key = {g?: number; s?: 1; u?: 1; o?: 1; x?: 1};
export type Mark = Key & {ok?: 1; fix?: string};
export type PoolUnit = {t: string; k?: Key; n?: string};
export type PoolProject = {id: string; sec: string; co: string; score: number; p: PoolUnit[]; t: PoolUnit[]; note?: string};
export type Pool = {v: 1; built: string; source?: string; projects: PoolProject[]; order: Record<string, string[]>};

/** review/<tid>/<k>: the sentences a group marks (no marks). */
export type Handout = {id: string; co: string; p: string[]; t: string[]};
/** rkey/<tid>/<k>: Mew's marks, given once the group has posted that project. */
export type KeyOut = {score: number; p: {k?: Key; n?: string}[]; t: {k?: Key; n?: string}[]; note?: string};
export type Marks = {p: Mark[]; t: Mark[]};
export type Summary = {co: string; sc: number; aj?: number; agree?: number; of?: number};

export const MAX_PROJECTS = 3;
export const NEEDED = 6;

export type TagCode = 'g' | 's' | 'u' | 'o' | 'x';
export const TAGS: {c: TagCode; en: string; th: string; pts: string}[] = [
  {c: 'g', en: 'Grammar', th: 'ไวยากรณ์', pts: '−0.5 each'},
  {c: 's', en: 'Spelling', th: 'สะกดคำ', pts: '−0.5 once'},
  {c: 'u', en: 'Punctuation', th: 'เครื่องหมายวรรคตอน', pts: '−0.5 once'},
  {c: 'o', en: 'It / They', th: 'สรรพนาม', pts: '−0.5 once'},
  {c: 'x', en: "Doesn't count", th: 'ไม่นับ', pts: '−1 if fewer than 6'},
];

export function hasProblem(m: Key | undefined): boolean {
  return !!m && (!!m.g || !!m.s || !!m.u || !!m.o || !!m.x);
}

/** Every sentence needs ✓ or at least one problem before the group can post. */
export function isMarked(m: Mark | undefined): boolean {
  return !!m && (!!m.ok || hasProblem(m));
}

export type Score = {score: number; missingP: number; missingT: number; grammar: number; s: boolean; u: boolean; o: boolean};

/** Mew's /8 rule (the same as build_pool.py's score()): −1 per missing sentence (6 + 6 needed), −0.5 per grammar
 *  error (at most −5), −0.5 once each for spelling, punctuation and pronoun; never below 0. */
export function scoreOf(p: (Key | undefined)[], t: (Key | undefined)[], np = p.length, nt = t.length): Score {
  const counted = (box: (Key | undefined)[], n: number) => Array.from({length: n}, (_, i) => box[i]).filter((m) => !m?.x).length;
  const all = [...Array.from({length: np}, (_, i) => p[i]), ...Array.from({length: nt}, (_, i) => t[i])];
  const missingP = Math.max(0, NEEDED - counted(p, np));
  const missingT = Math.max(0, NEEDED - counted(t, nt));
  const grammar = all.reduce((n, m) => n + (m?.g ?? 0), 0);
  const s = all.some((m) => m?.s);
  const u = all.some((m) => m?.u);
  const o = all.some((m) => m?.o);
  const score = Math.max(0, 8 - missingP - missingT - Math.min(5, 0.5 * grammar) - 0.5 * (+s + +u + +o));
  return {score, missingP, missingT, grammar, s, u, o};
}

/** Same marks as Mew on this sentence: the same problems (grammar counted as there / not there), or both correct. */
export function agrees(m: Key | undefined, k: Key | undefined): boolean {
  const sig = (x: Key | undefined) => [!!x?.g, !!x?.s, !!x?.u, !!x?.o, !!x?.x].join();
  return sig(m) === sig(k);
}

export function compare(h: Handout, marks: Marks, key: KeyOut): {agree: number; of: number} {
  let agree = 0;
  const of = h.p.length + h.t.length;
  h.p.forEach((_, i) => (agree += +agrees(marks.p[i], key.p[i]?.k)));
  h.t.forEach((_, i) => (agree += +agrees(marks.t[i], key.t[i]?.k)));
  return {agree, of};
}

export function handoutOf(pp: PoolProject): Handout {
  return {id: pp.id, co: pp.co, p: pp.p.map((u) => u.t), t: pp.t.map((u) => u.t)};
}

export function keyOf(pp: PoolProject): KeyOut {
  const out: KeyOut = {score: pp.score, p: pp.p.map(({k, n}) => clean({k, n})), t: pp.t.map(({k, n}) => clean({k, n}))};
  if (pp.note) out.note = pp.note;
  return out;
}
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** The next project for a group in `section`: the section's planned order, skipping projects already handed out on
 *  this wall; once all are used, the least-used one (a section is never given its own projects). */
export function nextProject(pool: Pool, section: string, used: string[]): PoolProject | null {
  const order = pool.order[section] ?? pool.projects.filter((p) => p.sec !== section).map((p) => p.id);
  if (!order.length) return null;
  const count = (id: string) => used.filter((u) => u === id).length;
  let best = order[0];
  for (const id of order) if (count(id) < count(best)) best = id;
  return pool.projects.find((p) => p.id === best) ?? null;
}

export function parseJson<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseMarks(raw: string | undefined | null): Marks {
  const m = parseJson<Marks>(raw);
  return {p: Array.isArray(m?.p) ? m!.p : [], t: Array.isArray(m?.t) ? m!.t : []};
}

/** Co-editing (several phones mark the same project): per sentence, a change made here wins over the database,
 *  and everything else takes the database's value. */
export function mergeMarks(base: Marks, local: Marks, cur: Marks): Marks {
  const box = (b: Mark[], l: Mark[], c: Mark[]) => {
    const n = Math.max(b.length, l.length, c.length);
    return Array.from({length: n}, (_, i) => (JSON.stringify(l[i] ?? null) !== JSON.stringify(b[i] ?? null) ? l[i] : c[i]) ?? {});
  };
  return {p: box(base.p, local.p, cur.p), t: box(base.t, local.t, cur.t)};
}

export const fmt = (n: number | undefined) => (n === undefined ? '…' : Number.isInteger(n) ? String(n) : n.toFixed(1));

// ── the encrypted pool file (public/wk16/pool.enc.json) ──
export type EncFile = {v: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string};

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

export async function encryptPool(json: string, pass: string, iter = 250_000): Promise<EncFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(json)));
  // btoa over a big array in one call can overflow the argument list: chunk it
  let s = '';
  for (let i = 0; i < ct.length; i += 8192) s += String.fromCharCode(...ct.subarray(i, i + 8192));
  return {v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: btoa(s)};
}

/** Throws 'wrong-passphrase' when the passphrase does not open the file. */
export async function decryptPool(enc: EncFile, pass: string): Promise<Pool> {
  const key = await deriveKey(pass, unb64(enc.salt), enc.iter);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(enc.iv) as BufferSource}, key, unb64(enc.ct) as BufferSource);
  } catch {
    throw new Error('wrong-passphrase');
  }
  return JSON.parse(new TextDecoder().decode(plain)) as Pool;
}
