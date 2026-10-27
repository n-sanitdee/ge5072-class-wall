// The built-in activities. Texts and chart data are copied from the Week 13/14 decks
// (Teaching/_slide_toolkit/build_wk13.py and build_wk14.py, built 21 Oct 2026) — keep them in step.
// 22 Oct 2026 (Mew): Wk13 profile = fill-in frames shown as one paragraph; Wk14 chart = one chart assigned to each
// name (no choosing); Wk14 "What changed" = a tap-to-build sentence builder; "Name" instead of "pair name";
// the custom wall shows posts straight away.
import type {PresetId} from './types.ts';

export type Step = {label: 'THINK' | 'PAIR' | 'SHARE' | 'GROUP' | 'POST'; time: string; text: string};

/** A sentence line (Wk14 TPS). */
export type Field = {label: string; hint?: string; required?: boolean};

/**
 * Wk13 profile branch. Each sentence is a frame: `**bold**` = the grammar point, `{placeholder}` = a blank the
 * group types into, `{@name}` = the company name from the first branch (typed again only if they want).
 */
export type FrameBranch = {label: string; sentences: string[]; hint?: string};

/** Wk14 "What changed" branch: the subjects to tap, and example numbers for the boxes (by …, from … to …). */
export type BuilderBranch = {label: string; hint: string; subjects: string[]; by: string; from: string; to: string};

export type Chart = {title: string; labels: string[]; values: number[]; lo: number; hi: number; step: number; comma: boolean};

export type Preset = {
  id: PresetId;
  week: string;
  activity: string;
  title: string;
  who: 'pair' | 'group' | 'anyone';
  theme: 'indigo' | 'teal';
  photo: boolean;
  /** Posts show as they arrive (no hidden phase). */
  live?: boolean;
  /** Free text box. */
  text?: {label: string; th: string; placeholder: string; required: boolean};
  /** Wk14 chart: sentence lines. */
  fields?: {heading: string; th: string; items: Field[]};
  frames?: FrameBranch[];
  builder?: BuilderBranch[];
  /** Wk14: Ladpet gives each name one chart, in turn. */
  charts?: Chart[];
  intro: string;
  introTh: string;
  steps: Step[];
  lookFor?: string;
  /** Short line under the boxes. */
  tip?: string;
};

// ── Week 13 · Think-Pair-Share: spot the nine mistakes (build_wk13.py, BAD_P / GOOD_P / NINE) ──
export const BAD_P =
  'Sunny Tea a Thai tea brand.It was Founded in 2021 , and it is based in Chiang Mai. ' +
  'The company sell Thai tea, green tea, and snack. All our tea are grown on local ' +
  'farms, the leaves are picked by hand';
export const GOOD_P =
  'Sunny Tea **is** a Thai tea brand.**˽**It was **f**ounded in 2021**,** and it is based ' +
  'in Chiang Mai. The company sell**s** Thai tea, green tea, and snack**s**. All our tea ' +
  '**is** grown on local farms**.** **T**he leaves are picked by hand**.**';
export const NINE = [
  'Sunny Tea **is** — no verb',
  'brand.**˽**It — space after .',
  '**f**ounded — no capital',
  '2021**,** — no space before ,',
  'The company sell**s** — one company',
  'snack**s** — many of them',
  'All our tea **is** — uncountable',
  'farms**.** **T**he — comma between sentences',
  'by hand**.** — the last full stop',
];

// ── Week 14 · the four field charts (build_wk14.py, MINI; every figure is invented) ──
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
export const CHARTS: Chart[] = [
  {title: 'Hotel guests per month · Chiang Mai', labels: MONTHS, values: [3200, 3400, 2600, 1900, 1950, 2000], lo: 1000, hi: 3500, step: 500, comma: true},
  {title: 'Café TikTok followers (thousand)', labels: MONTHS, values: [4, 5, 9, 15, 16, 16], lo: 0, hi: 20, step: 5, comma: false},
  {title: 'Bakery revenue (thousand baht)', labels: ['2021', '2022', '2023', '2024', '2025'], values: [2000, 2400, 2300, 3100, 3600], lo: 1000, hi: 4000, step: 500, comma: true},
  {title: 'Jasmine rice price (baht per kg)', labels: MONTHS, values: [38, 41, 45, 44, 39, 40], lo: 30, hi: 50, step: 5, comma: false},
];

// ── Week 14 · the form's 11 verbs and 7 adverbs (build_wk14.py VERBS / ADJ; the Final Project form's list) ──
export type TrendVerb = {base: string; past: string; dir: 'up' | 'down' | 'flat'; th: string};
export const TREND_VERBS: TrendVerb[] = [
  {base: 'rise', past: 'rose', dir: 'up', th: 'เพิ่มขึ้น'},
  {base: 'increase', past: 'increased', dir: 'up', th: 'เพิ่มขึ้น'},
  {base: 'grow', past: 'grew', dir: 'up', th: 'เติบโต'},
  {base: 'climb', past: 'climbed', dir: 'up', th: 'ไต่ระดับขึ้น'},
  {base: 'fall', past: 'fell', dir: 'down', th: 'ลดลง'},
  {base: 'decrease', past: 'decreased', dir: 'down', th: 'ลดลง'},
  {base: 'decline', past: 'declined', dir: 'down', th: 'ถดถอย'},
  {base: 'drop', past: 'dropped', dir: 'down', th: 'ร่วงลง'},
  {base: 'fluctuate', past: 'fluctuated', dir: 'flat', th: 'ขึ้น ๆ ลง ๆ'},
  {base: 'stabilise', past: 'stabilised', dir: 'flat', th: 'ทรงตัว'},
  {base: 'remain steady', past: 'remained steady', dir: 'flat', th: 'คงที่'},
];
export const TREND_ADVERBS = ['sharply', 'dramatically', 'steadily', 'gradually', 'slightly', 'significantly', 'moderately'];

/** How much: the patterns each verb takes (by / to / from … to for real changes; at for no change). */
export type Amount = 'none' | 'by' | 'to' | 'fromto' | 'at' | 'between';
export const AMOUNT_LABEL: Record<Amount, string> = {
  none: '—',
  by: 'by …',
  to: 'to …',
  fromto: 'from … to …',
  at: 'at …',
  between: 'between … and …',
};
export function amountsFor(v: TrendVerb | undefined): Amount[] {
  if (!v) return ['none'];
  if (v.base === 'fluctuate') return ['none', 'between'];
  if (v.dir === 'flat') return ['none', 'at'];
  return ['none', 'by', 'to', 'fromto'];
}
/** Adverbs that sound right with each verb ("remained steady sharply" doesn't). */
export function adverbsFor(v: TrendVerb | undefined): string[] {
  if (!v) return TREND_ADVERBS;
  if (v.base === 'remain steady') return [];
  if (v.base === 'stabilise') return ['gradually'];
  if (v.base === 'fluctuate') return ['sharply', 'dramatically', 'slightly', 'significantly', 'moderately'];
  return TREND_ADVERBS;
}
export const WHEN_OPTIONS = ['last year', 'in 2025', 'in 2024', 'last month', 'in May', 'over the past six months', 'between January and June'];

export const PRESETS: Preset[] = [
  {
    id: 'wk13-spot9',
    week: 'Week 13',
    activity: 'Think-Pair-Share',
    title: 'Spot the Nine Mistakes',
    who: 'pair',
    theme: 'indigo',
    photo: true,
    text: {label: 'Or type your fixes', th: 'หรือพิมพ์คำที่แก้', placeholder: 'e.g. 1. Sunny Tea is a Thai tea brand …', required: false},
    intro: 'One company profile, nine of today\'s mistakes.',
    introTh: 'โปรไฟล์บริษัท 1 ย่อหน้า มีที่ผิด 9 จุด',
    steps: [
      {label: 'THINK', time: '2 min', text: 'On your own: screenshot the passage and mark every mistake you can find.'},
      {label: 'PAIR', time: '3 min', text: 'Compare with the person next to you. Agree on all nine.'},
      {label: 'SHARE', time: '5 min', text: 'Post ONE marked screenshot per pair. Posts stay hidden until everyone has posted.'},
    ],
    lookFor: 'a missing verb · -s · plural · is / are · capitals · spaces · a comma between sentences · the last full stop',
  },
  {
    id: 'wk13-profile',
    week: 'Week 13',
    activity: 'Brainstorm',
    title: 'Map Your Company Profile',
    who: 'group',
    theme: 'indigo',
    photo: false,
    // build_wk13.py SUBS: the 7 sub-topics (Criteria §5) and the frame that turns notes into a sentence
    frames: [
      {label: 'Company name', sentences: ['Our company **is** called {Sunny Tea}.']},
      {label: 'Business type', sentences: ['{@name} **is** {a Thai tea brand}.'], hint: 'e.g. a local fast-food chain / a clothes store'},
      {label: 'Founded', sentences: ['It **was founded** in {2021} in {Chiang Mai}.']},
      {label: 'Products & services', sentences: ['It **sells** {Thai teas and snacks}.', 'They **are made** from {local tea leaves}.'], hint: 'plural -s: teas, snacks, shirts'},
      {label: 'Target customers', sentences: ['Its main customers **are** {students} aged {18} to {25}.']},
      {label: 'Price', sentences: ['Prices **start** at {45} baht.']},
      {label: 'Strengths & goals', sentences: ['It **aims** to {open three more branches by 2027}.']},
    ],
    intro: 'In your project group · 10 minutes. Fill the blanks — each branch becomes a sentence, and together they make your profile.',
    introTh: 'ทำในกลุ่มโปรเจกต์ 10 นาที เติมคำในช่องว่าง แต่ละหัวข้อจะกลายเป็นประโยค รวมกันเป็นโปรไฟล์บริษัท',
    steps: [
      {label: 'GROUP', time: '10 min', text: 'Everyone gives one idea. Fill the branches you can — your company name first.'},
      {label: 'POST', time: '1 min', text: 'One phone per group posts the profile. Posts stay hidden until everyone has posted.'},
    ],
    tip: 'Then pick 6 branches for your six profile sentences.',
  },
  {
    id: 'wk14-chart',
    week: 'Week 14',
    activity: 'Think-Pair-Share',
    title: 'Describe a Chart',
    who: 'pair',
    theme: 'teal',
    photo: false,
    charts: CHARTS,
    fields: {
      heading: 'Your sentences',
      th: 'ประโยคของคุณ',
      items: [
        {label: 'Your best sentence', required: true, hint: 'what changed + verb + how much + when'},
        {label: 'Another sentence', hint: 'optional'},
        {label: 'One more', hint: 'optional'},
      ],
    },
    intro: 'Ladpet gives you one chart. Every figure is invented.',
    introTh: 'Ladpet จะให้กราฟคุณ 1 กราฟ (ตัวเลขทั้งหมดสมมติขึ้น)',
    steps: [
      {label: 'THINK', time: '5 min', text: 'Write three sentences: one with by, to or from … to; one with a noun (a sharp rise in …); one with a list word you have never used.'},
      {label: 'PAIR', time: '3 min', text: 'Swap with the person next to you. Check: what changed + verb + how much + when?'},
      {label: 'SHARE', time: '5 min', text: 'Post your best sentence. Posts stay hidden until everyone has posted.'},
    ],
  },
  {
    id: 'wk14-changed',
    week: 'Week 14',
    activity: 'Brainstorm',
    title: 'What Changed in Your Company?',
    who: 'group',
    theme: 'teal',
    photo: false,
    // build_wk14.py BR: the 6 branches; the subjects to tap and example numbers come from its prompts/examples
    builder: [
      {label: 'Sales', hint: 'units sold · baht a month', subjects: ['Sales', 'Monthly sales', 'Online sales'], by: '20%', from: '1,200 cups', to: '1,500 cups'},
      {label: 'Customers', hint: 'new · regular · online', subjects: ['The number of customers', 'The number of new customers', 'The number of regular customers'], by: '400', from: '800', to: '1,200'},
      {label: 'Prices', hint: 'your price · ingredient costs', subjects: ['Our prices', 'The price of our best-seller', 'Ingredient prices'], by: '5%', from: '55 baht', to: '60 baht'},
      {label: 'Costs', hint: 'rent · staff · materials', subjects: ['Costs', 'Rent', 'Staff costs', 'Material costs'], by: '10%', from: '45,000 baht', to: '40,000 baht'},
      {label: 'Online', hint: 'followers · views · orders', subjects: ['The number of followers', 'Online orders', 'Website views'], by: '5,000', from: '7,000', to: '12,000'},
      {label: 'Branches & staff', hint: 'shops · people', subjects: ['The number of branches', 'The number of staff'], by: '1', from: '2', to: '3'},
    ],
    intro: 'In your project group · 10 minutes. Tap the parts — each branch builds one trend sentence for your project.',
    introTh: 'ทำในกลุ่มโปรเจกต์ 10 นาที แตะเลือกส่วนต่าง ๆ แต่ละหัวข้อจะได้ประโยคแนวโน้ม 1 ประโยค',
    steps: [
      {label: 'GROUP', time: '10 min', text: 'Every branch: what changed? Up, down or flat? How much? When? Build one sentence per branch.'},
      {label: 'POST', time: '1 min', text: 'One phone per group posts the sentences. Posts stay hidden until everyone has posted.'},
    ],
    tip: 'Your six trend sentences for the Final Project come from these branches.',
  },
  {
    id: 'custom',
    week: '',
    activity: 'Class wall',
    title: 'Your question',
    who: 'anyone',
    theme: 'indigo',
    photo: false,
    live: true,
    text: {label: 'Your answer', th: 'คำตอบของคุณ', placeholder: 'Type your answer …', required: true},
    intro: '',
    introTh: '',
    steps: [{label: 'POST', time: '', text: 'Type everyone\'s nicknames (or tap your name if your group is already in), write together and post. It appears on the wall — you can still edit it.'}],
  },
];

/** "Week 13 · Think-Pair-Share:" + "Spot the Nine Mistakes" — the slide titles (Mew, 22 Oct 2026). */
export function titleParts(p: Preset, pubTitle: string): {lead: string; title: string} {
  if (p.id === 'custom') return {lead: '', title: pubTitle};
  return {lead: `${p.week} · ${p.activity}:`, title: p.title};
}

export function fullTitle(p: Preset, pubTitle: string): string {
  const {lead, title} = titleParts(p, pubTitle);
  return lead ? `${lead} ${title}` : title;
}

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

/** "one phone per pair / group" in instructions. */
export function whoWord(p: Preset, plural = false): string {
  if (p.who === 'anyone') return plural ? 'people' : 'person';
  return p.who === 'group' ? (plural ? 'groups' : 'group') : plural ? 'pairs' : 'pair';
}
