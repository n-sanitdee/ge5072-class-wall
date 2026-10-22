// Turning the guided inputs into full sentences (Wk13 profile frames, Wk14 sentence builder).
// A post stores the finished sentence of each branch in fields.f<i> (what everyone sees) and the raw inputs in
// fields.b<i> as JSON (so the phone can refill the form for editing).
import {
  type Amount,
  type BuilderBranch,
  type FrameBranch,
  TREND_ADVERBS,
  TREND_VERBS,
  WHEN_OPTIONS,
  adverbsFor,
  amountsFor,
} from './presets.ts';

const BLANK = /\{([^}]*)\}/g;

/** Parts of a frame sentence: text (with **bold**) and blanks. */
export type FramePart = {text: string} | {blank: number; placeholder: string; name?: boolean};

export function frameParts(sentence: string, start: number): {parts: FramePart[]; blanks: number} {
  const parts: FramePart[] = [];
  let last = 0;
  let n = 0;
  for (const m of sentence.matchAll(BLANK)) {
    if (m.index! > last) parts.push({text: sentence.slice(last, m.index)});
    const name = m[1] === '@name';
    parts.push({blank: start + n, placeholder: name ? 'company name' : m[1], name});
    n++;
    last = m.index! + m[0].length;
  }
  if (last < sentence.length) parts.push({text: sentence.slice(last)});
  return {parts, blanks: n};
}

/** How many blanks a branch has, sentence by sentence. */
export function branchBlanks(b: FrameBranch): number {
  return b.sentences.reduce((n, s) => n + frameParts(s, 0).blanks, 0);
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');

/**
 * The finished sentence(s) of one branch. A sentence is used only when all its blanks are filled; `{@name}` falls
 * back to the company name from the first branch.
 */
export function composeFrames(b: FrameBranch, values: string[], companyName: string): string {
  const out: string[] = [];
  let k = 0;
  for (const s of b.sentences) {
    const {parts, blanks} = frameParts(s, k);
    let ok = true;
    const text = parts
      .map((p) => {
        if ('text' in p) return p.text.split('**').join('');
        const v = tidy(values[p.blank] ?? '') || (p.name ? tidy(companyName) : '');
        if (!v) ok = false;
        return v;
      })
      .join('');
    k += blanks;
    if (ok) out.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out.join(' ');
}

/** The tap-to-build state of one Wk14 branch. -1 = nothing picked; s = -2 / w = -2 = "type your own". */
export type TrendPick = {s: number; so?: string; v: number; a: number; p: Amount; x?: string; y?: string; w: number; wo?: string};

export const EMPTY_PICK: TrendPick = {s: -1, v: -1, a: -1, p: 'none', w: -1};

/** Keep a pick consistent after the verb changes (e.g. no adverb for "remained steady"). */
export function fixPick(t: TrendPick): TrendPick {
  const v = TREND_VERBS[t.v];
  const advs = adverbsFor(v);
  const amounts = amountsFor(v);
  const a = t.a >= 0 && v && !advs.includes(TREND_ADVERBS[t.a]) ? -1 : t.a;
  return {...t, a, p: amounts.includes(t.p) ? t.p : 'none'};
}

export type TrendResult = {sentence: string; missing: string | null};

/** Subject + verb (+ adverb) (+ by / to / from … to / at / between) (+ when). */
export function composeTrend(b: BuilderBranch, t: TrendPick): TrendResult {
  const subject = t.s === -2 ? tidy(t.so ?? '') : (b.subjects[t.s] ?? '');
  const verb = TREND_VERBS[t.v];
  const adv = t.a >= 0 ? TREND_ADVERBS[t.a] : '';
  const x = tidy(t.x ?? '');
  const y = tidy(t.y ?? '');
  const when = t.w === -2 ? tidy(t.wo ?? '') : t.w >= 0 ? WHEN_OPTIONS[t.w] : '';
  let missing: string | null = null;
  if (!subject) missing = 'what changed';
  else if (!verb) missing = 'a verb';
  else if ((t.p !== 'none' && !x) || ((t.p === 'fromto' || t.p === 'between') && !y)) missing = 'the number';
  const amount =
    t.p === 'by' ? `by ${x}` : t.p === 'to' ? `to ${x}` : t.p === 'at' ? `at ${x}` : t.p === 'fromto' ? `from ${x} to ${y}` : t.p === 'between' ? `between ${x} and ${y}` : '';
  const words = [subject || '…', verb ? verb.past : '…', adv, amount, when].filter(Boolean).join(' ');
  const sentence = words.charAt(0).toUpperCase() + words.slice(1) + '.';
  return {sentence, missing};
}

export function parsePick(raw: string | undefined): TrendPick {
  try {
    const v = JSON.parse(raw ?? '');
    return v && typeof v === 'object' ? {...EMPTY_PICK, ...v} : EMPTY_PICK;
  } catch {
    return EMPTY_PICK;
  }
}

export function parseBlanks(raw: string | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? '');
    return Array.isArray(v) ? v.map((x) => String(x ?? '')) : [];
  } catch {
    return [];
  }
}
