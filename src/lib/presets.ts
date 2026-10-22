// The built-in activities. Texts and chart data are copied from the Week 13/14 decks
// (Teaching/_slide_toolkit/build_wk13.py and build_wk14.py, built 21 Oct 2026) — keep them in step.
import type {PresetId} from './types.ts';

export type Step = {label: 'THINK' | 'PAIR' | 'SHARE' | 'GROUP' | 'POST'; time: string; text: string};

/** A branch box (brainstorms) or a sentence line (Wk14 TPS). `frame` may contain **bold** and ___ blanks. */
export type Field = {label: string; hint?: string; frame?: string; example?: string; required?: boolean};

export type Chart = {
  title: string;
  labels: string[];
  values: number[];
  lo: number;
  hi: number;
  step: number;
  comma: boolean;
  /** Sections whose field this chart is closest to (the November plan). */
  sections: string[];
};

export type Preset = {
  id: PresetId;
  week: string;
  activity: string;
  title: string;
  /** For the saved file name: Wk13_SpotNine_CA48_2026-11-04.html */
  slug: string;
  who: 'pair' | 'group';
  theme: 'indigo' | 'teal';
  photo: boolean;
  /** Free text box. */
  text?: {label: string; th: string; placeholder: string; required: boolean};
  fields?: {heading: string; th: string; items: Field[]};
  /** Wk14: pick one of the charts. */
  charts?: Chart[];
  intro: string;
  introTh: string;
  steps: Step[];
  lookFor?: string;
  /** Short line under the brainstorm boxes. */
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
  {title: 'Hotel guests per month · Chiang Mai', labels: MONTHS, values: [3200, 3400, 2600, 1900, 1950, 2000],
    lo: 1000, hi: 3500, step: 500, comma: true, sections: ['TS66']},
  {title: 'Café TikTok followers (thousand)', labels: MONTHS, values: [4, 5, 9, 15, 16, 16],
    lo: 0, hi: 20, step: 5, comma: false, sections: ['CA48', 'CA50']},
  {title: 'Bakery revenue (thousand baht)', labels: ['2021', '2022', '2023', '2024', '2025'],
    values: [2000, 2400, 2300, 3100, 3600], lo: 1000, hi: 4000, step: 500, comma: true, sections: ['AC21', 'BS11']},
  {title: 'Jasmine rice price (baht per kg)', labels: MONTHS, values: [38, 41, 45, 44, 39, 40],
    lo: 30, hi: 50, step: 5, comma: false, sections: ['EC30']},
];

export const PRESETS: Preset[] = [
  {
    id: 'wk13-spot9',
    week: 'Week 13',
    activity: 'Think-Pair-Share',
    title: 'Spot the Nine Mistakes',
    slug: 'Wk13_SpotNine',
    who: 'pair',
    theme: 'indigo',
    photo: true,
    text: {
      label: 'Or type your fixes',
      th: 'หรือพิมพ์คำที่แก้',
      placeholder: 'e.g. 1. Sunny Tea is a Thai tea brand …',
      required: false,
    },
    intro: 'One company profile, nine of today\'s mistakes.',
    introTh: 'โปรไฟล์บริษัท 1 ย่อหน้า มีที่ผิด 9 จุด',
    steps: [
      {label: 'THINK', time: '2 min', text: 'On your own: screenshot the passage and mark every mistake you can find.'},
      {label: 'PAIR', time: '3 min', text: 'Compare with the person next to you. Agree on all nine.'},
      {label: 'SHARE', time: '5 min', text: 'Post ONE marked screenshot per pair. Posts stay hidden until every pair has posted.'},
    ],
    lookFor: 'a missing verb · -s · plural · is / are · capitals · spaces · a comma between sentences · the last full stop',
  },
  {
    id: 'wk13-profile',
    week: 'Week 13',
    activity: 'Brainstorm',
    title: 'Map Your Company Profile',
    slug: 'Wk13_ProfileMap',
    who: 'group',
    theme: 'indigo',
    photo: false,
    fields: {
      heading: 'Your notes, one box per branch',
      th: 'จดโน้ตทีละหัวข้อ (ไม่ต้องครบทุกช่อง)',
      // build_wk13.py SUBS: the 7 sub-topics (Criteria §5) with the frame that turns notes into a sentence
      items: [
        {label: 'Company name', frame: 'Our company **is** called ___.'},
        {label: 'Business type', frame: '___ **is** a local fast-food chain / a clothes store.'},
        {label: 'Founded', frame: 'It **was founded** in ___ in ___.'},
        {label: 'Products & services', frame: 'It **sells** ___**s**. They **are made** from ___.'},
        {label: 'Target customers', frame: 'Its main customers **are** ___ aged ___ to ___.'},
        {label: 'Price', frame: 'Prices **start** at ___ baht.'},
        {label: 'Strengths & goals', frame: 'It **aims** to ___.'},
      ],
    },
    intro: 'In your project group · 10 minutes. Notes first — the frame turns each branch into a sentence.',
    introTh: 'ทำในกลุ่มโปรเจกต์ 10 นาที จดโน้ตก่อน แล้วใช้ประโยคตัวอย่างเปลี่ยนโน้ตเป็นประโยค',
    steps: [
      {label: 'GROUP', time: '10 min', text: 'Everyone gives one note. Fill the branches you can — your company name in the centre.'},
      {label: 'POST', time: '1 min', text: 'One phone per group posts the map. Maps stay hidden until every group has posted.'},
    ],
    tip: 'Then pick 6 branches: one sentence each.',
  },
  {
    id: 'wk14-chart',
    week: 'Week 14',
    activity: 'Think-Pair-Share',
    title: 'Describe a Chart',
    slug: 'Wk14_DescribeChart',
    who: 'pair',
    theme: 'teal',
    photo: false,
    charts: CHARTS,
    fields: {
      heading: 'Your sentences',
      th: 'ประโยคของคู่คุณ',
      items: [
        {label: 'Your best sentence', required: true, hint: 'what changed + verb + how much + when'},
        {label: 'Another sentence', hint: 'optional'},
        {label: 'One more', hint: 'optional'},
      ],
    },
    intro: 'Pick the chart closest to your field. Every figure is invented.',
    introTh: 'เลือกกราฟที่ใกล้กับสาขาของคุณที่สุด (ตัวเลขทั้งหมดสมมติขึ้น)',
    steps: [
      {label: 'THINK', time: '5 min', text: 'Write three sentences: one with by, to or from … to; one with a noun (a sharp rise in …); one with a list word you have never used.'},
      {label: 'PAIR', time: '3 min', text: 'Swap with the person next to you. Check: what changed + verb + how much + when?'},
      {label: 'SHARE', time: '5 min', text: 'Each pair posts its best sentence. Posts stay hidden until every pair has posted.'},
    ],
  },
  {
    id: 'wk14-changed',
    week: 'Week 14',
    activity: 'Brainstorm',
    title: 'What Changed in Your Company?',
    slug: 'Wk14_WhatChanged',
    who: 'group',
    theme: 'teal',
    photo: false,
    fields: {
      heading: 'Up, down or flat? How much? When?',
      th: 'ขึ้น ลง หรือคงที่? เท่าไร? เมื่อไร?',
      // build_wk14.py BR: the 6 branches, what to think about, and an example
      items: [
        {label: 'Sales', hint: 'units sold · baht a month', example: 'rose **by** 20% in May'},
        {label: 'Customers', hint: 'new · regular · online', example: 'grew **from** 800 **to** 1,200'},
        {label: 'Prices', hint: 'your price · ingredient costs', example: '**a slight increase** in 2025'},
        {label: 'Costs', hint: 'rent · staff · materials', example: 'fell **to** 40,000 baht'},
        {label: 'Online', hint: 'followers · views · orders', example: '**a sharp rise in** followers'},
        {label: 'Branches & staff', hint: 'shops · people', example: '**remained steady** at 3 shops'},
      ],
    },
    intro: 'In your project group · 10 minutes. Your six trend sentences come from these branches.',
    introTh: 'ทำในกลุ่มโปรเจกต์ 10 นาที ประโยคแนวโน้ม 6 ประโยคมาจากหัวข้อเหล่านี้',
    steps: [
      {label: 'GROUP', time: '10 min', text: 'Every branch: up, down or flat? How much? When? Everyone adds a note.'},
      {label: 'POST', time: '1 min', text: 'One phone per group posts the map. Maps stay hidden until every group has posted.'},
    ],
    tip: '↑ rise · increase · grow · climb    ↓ fall · decrease · decline · drop    → fluctuate · stabilise · remain steady',
  },
  {
    id: 'custom',
    week: '',
    activity: 'Class wall',
    title: 'Your question',
    slug: 'ClassWall',
    who: 'pair',
    theme: 'indigo',
    photo: false,
    text: {label: 'Your answer', th: 'คำตอบของคุณ', placeholder: 'Type your answer …', required: true},
    intro: '',
    introTh: '',
    steps: [
      {label: 'PAIR', time: '', text: 'Talk with the person next to you.'},
      {label: 'SHARE', time: '', text: 'Post one answer per pair. Posts stay hidden until every pair has posted.'},
    ],
  },
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

/** Pair or group, in the right number. */
export function whoWord(p: Preset, plural = false): string {
  return p.who === 'group' ? (plural ? 'groups' : 'group') : plural ? 'pairs' : 'pair';
}
