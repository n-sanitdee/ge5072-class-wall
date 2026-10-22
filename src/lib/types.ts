// Shapes of the data in the Realtime Database (see database.rules.json, `walls/<code>/…`).

export const SECTIONS = ['AC21', 'BS11', 'CA48', 'CA50', 'EC30', 'TS66'] as const;

export type PresetId = 'wk13-spot9' | 'wk13-profile' | 'wk14-chart' | 'wk14-changed' | 'custom';

/** Public part of a wall: phones read it with the code. Only the host writes it. */
export type Pub = {
  title: string;
  preset: PresetId;
  section: string;
  /** Photo posts allowed (fixed when the wall is made). */
  photo: boolean;
  /** Custom walls: every post shows straight away, no hidden phase (fixed when the wall is made). */
  live?: boolean;
  /** Custom walls only: the question shown on the phones. */
  prompt?: string;
  /** One-way: once true, every post is readable and no post can change. */
  revealed: boolean;
  /** No new pairs can join. */
  locked?: boolean;
  /** The host pressed "Finish & delete" (the wall is deleted a moment later). */
  ended?: boolean;
  /** Number of pairs/groups the teacher expects; 0 = not set. */
  expected?: number;
  /** Names and posted ✓ for the phones' "still waiting for …" line. No ids. */
  roster?: RosterRow[];
  /** Wk13: the host is showing the nine fixes on the projector. */
  fixes?: boolean;
};

export type RosterRow = {n: string; p: boolean};

export type Team = {name: string; joinedAt: number};

export type Post = {
  at: number;
  text?: string;
  /** f0…f9 = the finished sentence of each branch / line; b0…b9 = the guided inputs as JSON (for editing). */
  fields?: Record<string, string>;
  /** Wk14: the chart Ladpet gave this name (0–3). */
  choice?: number;
  /** A photo is stored under thumbs/<tid> and photos/<tid>. */
  photo?: true;
};

/** What a phone writes; `full`/`thumb` are JPEG data URLs. */
export type Draft = {
  text?: string;
  fields?: Record<string, string>;
  choice?: number;
  image?: {full: string; thumb: string} | 'keep' | null;
};

export const STALE_MS = 3 * 60 * 60 * 1000;

/** Limits shared by the phone, the host and database.rules.json. */
export const LIMITS = {
  name: 24,
  text: 1000,
  field: 400,
  thumbChars: 200_000,
  photoChars: 1_500_000,
};
