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

// ── 23 Nov 2026 redesign (Mew, after CA48): no per-sentence marks and no error types. The group sees the project as a
// paragraph, and either pastes it into a box and fixes it, or screenshots it, writes the fixes on the screenshot and
// uploads it (or both). After posting, it sees its own version next to Ajarn's (her notes on the sentences she
// marked) — no scores. Fields: b<k+6> = the fixed text, b<k+3> = the screenshots (JSON list), f<k> = {co} when
// posted. b0–b2 (the old marks) are only on walls from before this change.
export const textKey = (k: number) => `b${k + 6}`;
export const shotKey = (k: number) => `b${k + 3}`;
export const SHOT_CHARS = 1_400_000;
export const MAX_SHOTS = 3;

/** b<k+3>: a JSON list of JPEG data URLs (a long project needs more than one screenshot). */
export function shotsOf(raw: string | undefined | null): string[] {
  if (!raw) return [];
  if (raw.startsWith('data:image/')) return [raw];
  const list = parseJson<unknown>(raw);
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && s.startsWith('data:image/jpeg;base64,')) : [];
}

/** The project as the group sees it: the Company Profile paragraph, then the Describing Trends paragraph. */
export function paragraphs(h: Handout): {p: string; t: string} {
  return {p: h.p.join(' '), t: h.t.join(' ')};
}

/** What "Copy the paragraph" puts on the clipboard: both paragraphs, a blank line between them. */
export function copyText(h: Handout): string {
  const {p, t} = paragraphs(h);
  return [p, t].filter(Boolean).join('\n\n');
}

/** Ajarn's version: every sentence, with her note when she marked it (numbered in order). */
export function ajarnUnits(h: Handout, key: KeyOut): {box: 'p' | 't'; text: string; note?: string; n?: number}[] {
  let n = 0;
  return (['p', 't'] as const).flatMap((box) =>
    (box === 'p' ? h.p : h.t).map((text, i) => {
      const u = key[box][i];
      const marked = hasProblem(u?.k) || !!u?.n;
      return marked ? {box, text, note: u?.n || 'Ajarn marked a mistake here.', n: ++n} : {box, text};
    }),
  );
}

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

// ── 23 Nov 2026 (evening, Mew): a Deductions section right after the fix box. The group takes points off with the
// course criteria and sees its score /8; after posting, its deductions and score next to Ajarn's. Field f<k+6> = JSON
// Ded (co-edited, one key per tap).
// ── 25 Nov 2026 (Mew): two groups with a clear border — "Number of sentences" (Company Profile, Describing Trends:
// −1 per missing sentence) and "Grammar" (It/They, Spelling, Punctuation: −/+ counters, −0.5 EACH TIME, no cap). The
// general Grammar counter (g, −0.5 each, max −5) is gone: old posts' g is ignored. (Ajarn's side was recounted with
// the same rule until 26 Nov; it is now the grade she gave: see ajarnScore below.) The group's score is recounted
// from its saved deductions (groupScore), so walls from before the change read the same way.
export const dedKey = (k: number) => `f${k + 6}`;
export type DedCode = 'mp' | 'mt' | 'o' | 's' | 'u';
export type Ded = Partial<Record<DedCode, number>>;
export type DedGroup = 'n' | 'l';
export const DED_GROUPS: {id: DedGroup; en: string; th: string; pts: string}[] = [
  {id: 'n', en: 'Number of sentences', th: 'จำนวนประโยค', pts: '−1 each missing'},
  {id: 'l', en: 'Grammar', th: 'ไวยากรณ์', pts: '−0.5 each time'},
];
export type Criterion = {c: DedCode; grp: DedGroup; en: string; th: string; hint: string; pts: string; max: number};
export const CRITERIA: Criterion[] = [
  {c: 'mp', grp: 'n', en: 'Company Profile', th: 'ประโยคที่ขาดใน Company Profile', hint: 'Needs 6 sentences. A heading or a list of words does not count.', pts: '−1 each missing', max: NEEDED},
  {c: 'mt', grp: 'n', en: 'Describing Trends', th: 'ประโยคที่ขาดใน Describing Trends', hint: 'Needs 6. A line counts only if it describes a change with a word from the list. A plan does not count.', pts: '−1 each missing', max: NEEDED},
  {c: 'o', grp: 'l', en: 'It / They', th: 'สรรพนาม', hint: 'The company is "it", never "they". Count each time.', pts: '−0.5 each time', max: 20},
  {c: 's', grp: 'l', en: 'Spelling', th: 'การสะกดคำ', hint: 'Count each word spelt wrong.', pts: '−0.5 each time', max: 20},
  {c: 'u', grp: 'l', en: 'Punctuation', th: 'เครื่องหมายวรรคตอน', hint: 'Count each slip: full stops, capital letters, commas, spaces.', pts: '−0.5 each time', max: 20},
];

/** Points off for one criterion (a positive number). */
export function pointsOff(c: DedCode, n: number | undefined): number {
  const v = n ?? 0;
  return c === 'mp' || c === 'mt' ? v : 0.5 * v;
}

/** Points off for one group of criteria. */
export function groupOff(g: DedGroup, d: Ded): number {
  return CRITERIA.filter((x) => x.grp === g).reduce((sum, {c}) => sum + pointsOff(c, d[c]), 0);
}

export function dedScore(d: Ded): number {
  return Math.max(0, 8 - CRITERIA.reduce((sum, {c}) => sum + pointsOff(c, d[c]), 0));
}

export function parseDed(raw: string | undefined | null): Ded {
  const d = parseJson<Record<string, unknown>>(raw);
  const out: Ded = {};
  if (!d || typeof d !== 'object') return out;
  for (const {c, max} of CRITERIA) {
    const v = d[c];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[c] = Math.min(max, Math.round(v));
  }
  return out;
}

/** The group's score as posted with project k (fields.f<k> = {co, sc}); undefined on posts from before 23 Nov evening. */
export function postedScore(raw: string | undefined | null): number | undefined {
  const sc = parseJson<{sc?: unknown}>(raw)?.sc;
  return typeof sc === 'number' && Number.isFinite(sc) ? sc : undefined;
}

/** The group's score as shown: recounted from its saved deductions with today's rule (undefined if it posted before
 *  the Deductions section existed). */
export function groupScore(postRaw: string | undefined | null, dedRaw: string | undefined | null): number | undefined {
  return postedScore(postRaw) === undefined ? undefined : dedScore(parseDed(dedRaw));
}

// ── 26 Nov 2026 (Mew: "the ajarn version calculate scores wrong" → "Your real grade"): the 25 Nov recount dropped
// her general grammar marks together with the groups' Grammar row, so 12 of the 45 projects showed Ajarn ABOVE the
// grade she gave (Happy Grain 8 for a 6). Ajarn's score on Ladpet is now the grade she gave (KeyOut.score, which
// encrypt-pool.ts checks against scoreOf on her marks), and her column shows her deductions the way she graded:
// missing sentences −1 each, her other grammar mistakes −0.5 each (max −5, an Ajarn-only row: the group form has no
// such counter) and It/They, spelling, punctuation −0.5 ONCE each (with the number of sentences she marked). The
// group's side is unchanged (25 Nov rule).
export type AjarnCode = DedCode | 'g';
/** mp/mt = missing sentences; g = grammar mistakes; o/s/u = how many sentences she marked with that problem. */
export type AjarnDed = Record<AjarnCode, number>;
export const OTHER_GRAMMAR = {c: 'g' as const, en: 'Other grammar', th: 'ไวยากรณ์อื่น ๆ', hint: 'Ajarn only (not on the group form)'};

/** Ajarn's deductions, from her marks on the same sentences. */
export function ajarnDed(key: KeyOut): AjarnDed {
  const p = key.p.map((u) => u?.k);
  const t = key.t.map((u) => u?.k);
  const s = scoreOf(p, t);
  const n = (c: 'o' | 's' | 'u') => [...p, ...t].filter((k) => k?.[c]).length;
  return {mp: s.missingP, mt: s.missingT, g: s.grammar, o: n('o'), s: n('s'), u: n('u')};
}

/** Points Ajarn took off for one criterion, the way she grades (scoreOf). */
export function ajarnOff(c: AjarnCode, d: AjarnDed): number {
  const v = d[c] ?? 0;
  if (c === 'mp' || c === 'mt') return v;
  if (c === 'g') return Math.min(5, 0.5 * v);
  return v ? 0.5 : 0;
}

/** Ajarn's score on Ladpet = the grade she gave. */
export const ajarnScore = (key: KeyOut) => key.score;

/** The group's cell in the comparison table. */
export function groupCell(c: DedCode, d: Ded): string {
  const v = d[c] ?? 0;
  if (!v) return '—';
  const off = `−${fmt(pointsOff(c, v))}`;
  return c === 'mp' || c === 'mt' ? `${v} missing (${off})` : `${v} ${v === 1 ? 'time' : 'times'} (${off})`;
}

/** Ajarn's cell in the comparison table. */
export function ajarnCell(c: AjarnCode, d: AjarnDed): string {
  const v = d[c] ?? 0;
  if (!v) return '—';
  const off = `−${fmt(ajarnOff(c, d))}`;
  if (c === 'mp' || c === 'mt') return `${v} missing (${off})`;
  if (c === 'g') return `${v} ${v === 1 ? 'mistake' : 'mistakes'} (${off}${0.5 * v > 5 ? ', max' : ''})`;
  return `${v} ${v === 1 ? 'sentence' : 'sentences'} (${off} once)`;
}

/** A row of the table is tinted when the two sides took off different points. */
export const rowDiffers = (c: AjarnCode, ded: Ded, aj: AjarnDed) => (c === 'g' ? 0 : pointsOff(c, ded[c])) !== ajarnOff(c, aj);

/** The line under the table that says how Ajarn's column is counted. */
export const AJARN_RULE = {
  en: "Ajarn's column is the grade she gave: It/They, spelling and punctuation −0.5 once each; other grammar mistakes −0.5 each (max −5).",
  th: 'คอลัมน์ Ajarn คือคะแนนที่อาจารย์ให้จริง: It/They การสะกดคำ และเครื่องหมายวรรคตอน หักหัวข้อละ 0.5 ครั้งเดียว ไวยากรณ์อื่น ๆ หักจุดละ 0.5 (สูงสุด 5 คะแนน)',
};

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
