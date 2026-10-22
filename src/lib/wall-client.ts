// Phone side of a wall. The student screen and the load test both use it.
import {type Database, type Unsubscribe, get, onValue, ref, serverTimestamp, update} from 'firebase/database';
import {type Draft, LIMITS, type Post, type Pub, type Team} from './types.ts';

export type JoinError = 'not-found' | 'locked' | 'revealed' | 'ended' | 'taken' | 'removed' | 'network';

export class JoinFailed extends Error {
  code: JoinError;
  constructor(code: JoinError) {
    super(code);
    this.code = code;
  }
}

const NAME_RE = /^[A-Za-z0-9฀-๿ &+,'_-]+$/;

/** Tidy a pair/group name; returns an error key when it can't be used. */
export function checkName(raw: string): {name: string; error?: 'empty' | 'long' | 'chars' | 'digits'} {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return {name, error: 'empty'};
  if (name.length > LIMITS.name) return {name, error: 'long'};
  if (!NAME_RE.test(name)) return {name, error: 'chars'};
  // UTCC student IDs are 13 digits; refuse anything that looks like one.
  if (/\d{5,}/.test(name.replace(/[\s_,&+'-]/g, ''))) return {name, error: 'digits'};
  return {name};
}

/** Database key that keeps names unique within a wall (must match database.rules.json). */
export function nameKey(name: string): string {
  return name.toLowerCase().split(' ').join('');
}

export function newTeamId(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

function denied(e: unknown): boolean {
  return String((e as {code?: string})?.code ?? e).toLowerCase().includes('permission');
}

/** Read a wall's public part; null = no such wall. Throws on network trouble. */
export async function peekWall(db: Database, code: string): Promise<Pub | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const s = await get(ref(db, `walls/${code}/pub`));
  return (s.val() as Pub | null) ?? null;
}

export type WallState = {
  pub: Pub | null;
  /** This phone's team still exists (null = not known yet; false once it is gone). */
  inWall: boolean | null;
  removed: boolean;
  mine?: Post | null;
  /** Wk14 chart: the chart Ladpet gave this name (undefined = not yet). */
  chart?: number;
  /** After the reveal: everyone's posts. */
  teams: Record<string, Team>;
  posts: Record<string, Post>;
  connected: boolean;
};

/**
 * One wall seen from one phone. `tid` is the pair's secret id (kept in localStorage); without it the phone
 * is a viewer that can read the wall after the reveal.
 */
export class WallClient {
  db: Database;
  code: string;
  tid: string | null;
  name: string;
  state: WallState = {pub: null, inWall: null, removed: false, teams: {}, posts: {}, connected: false};
  private subs = new Set<(s: WallState) => void>();
  private unsubs: Unsubscribe[] = [];
  private mineUnsubs: Unsubscribe[] = [];
  private wallUnsubs: Unsubscribe[] = [];
  private watching = false;
  private thumbs = new Map<string, Promise<string | null>>();
  private photos = new Map<string, Promise<string | null>>();

  constructor(db: Database, code: string, tid: string | null = null, name = '') {
    this.db = db;
    this.code = code;
    this.tid = tid;
    this.name = name;
  }

  /** Drop this phone's pair (after the teacher removed it) so it can join again under a new name. */
  forget() {
    for (const u of this.mineUnsubs) u();
    this.mineUnsubs = [];
    this.tid = null;
    this.name = '';
    this.patch({inWall: null, removed: false, mine: undefined, chart: undefined});
  }

  private get base() {
    return `walls/${this.code}`;
  }

  /** Join as a new pair/group. */
  async join(name: string): Promise<void> {
    let pub: Pub | null;
    try {
      pub = await peekWall(this.db, this.code);
    } catch {
      throw new JoinFailed('network');
    }
    if (!pub || pub.ended) throw new JoinFailed(pub ? 'ended' : 'not-found');
    if (pub.revealed) throw new JoinFailed('revealed');
    if (pub.locked) throw new JoinFailed('locked');
    const tid = newTeamId();
    try {
      await update(ref(this.db), {
        [`${this.base}/teams/${tid}`]: {name, joinedAt: serverTimestamp()},
        [`${this.base}/names/${nameKey(name)}`]: tid,
      });
    } catch (e) {
      if (!denied(e)) throw new JoinFailed('network');
      // Denied: name taken, or the wall changed state in the meantime.
      const now = await peekWall(this.db, this.code).catch(() => null);
      if (!now || now.ended) throw new JoinFailed('ended');
      if (now.revealed) throw new JoinFailed('revealed');
      if (now.locked) throw new JoinFailed('locked');
      throw new JoinFailed('taken');
    }
    this.tid = tid;
    this.name = name;
    this.patch({inWall: true, removed: false, mine: null});
    if (this.watching) this.watchMine();
  }

  /** After a reload: is our team still there? */
  async stillIn(): Promise<boolean> {
    if (!this.tid) return false;
    try {
      const s = await get(ref(this.db, `${this.base}/teams/${this.tid}`));
      return s.exists();
    } catch {
      return true; // offline: assume yes, the listeners will tell
    }
  }

  /** Start listening. */
  watch() {
    if (this.watching) return;
    this.watching = true;
    const on = <T>(path: string, fn: (v: T | null) => void) =>
      this.unsubs.push(onValue(ref(this.db, path), (s) => fn(s.val() as T | null), () => {}));
    on<boolean>('.info/connected', (c) => this.patch({connected: !!c}));
    on<Pub>(`${this.base}/pub`, (pub) => {
      this.patch({pub});
      if (pub?.revealed || pub?.live) this.watchWall();
    });
    if (this.tid) this.watchMine();
  }

  private watchMine() {
    const tid = this.tid;
    if (!tid || this.mineUnsubs.length) return;
    const on = <T>(path: string, fn: (v: T | null) => void) =>
      this.mineUnsubs.push(onValue(ref(this.db, path), (s) => tid === this.tid && fn(s.val() as T | null), () => {}));
    on<Team>(`${this.base}/teams/${tid}`, (t) => this.patch({inWall: !!t}));
    on<boolean>(`${this.base}/kicked/${tid}`, (k) => this.patch({removed: !!k}));
    on<Post>(`${this.base}/posts/${tid}`, (p) => this.patch({mine: p}));
    on<number>(`${this.base}/assign/${tid}`, (c) => this.patch({chart: typeof c === 'number' ? c : undefined}));
  }

  private watchWall() {
    if (this.wallUnsubs.length) return;
    const on = <T>(path: string, fn: (v: T | null) => void) =>
      this.wallUnsubs.push(onValue(ref(this.db, path), (s) => fn(s.val() as T | null), () => {}));
    on<Record<string, Team>>(`${this.base}/teams`, (teams) => this.patch({teams: teams ?? {}}));
    on<Record<string, Post>>(`${this.base}/posts`, (posts) => this.patch({posts: posts ?? {}}));
  }

  subscribe(fn: (s: WallState) => void): () => void {
    this.subs.add(fn);
    fn(this.state);
    return () => this.subs.delete(fn);
  }

  private patch(p: Partial<WallState>) {
    this.state = {...this.state, ...p};
    for (const fn of this.subs) fn(this.state);
  }

  /** Post or replace this pair's answer. */
  async post(d: Draft): Promise<void> {
    if (!this.tid) throw new Error('Join first.');
    const post: Record<string, unknown> = {at: serverTimestamp()};
    const text = d.text?.trim();
    if (text) post.text = text.slice(0, LIMITS.text);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.fields ?? {})) {
      const t = v.trim();
      if (t) fields[k] = t.slice(0, LIMITS.field);
    }
    if (Object.keys(fields).length) post.fields = fields;
    if (typeof d.choice === 'number') post.choice = d.choice;
    const paths: Record<string, unknown> = {};
    let thumb: string | null | undefined;
    if (d.image && d.image !== 'keep') {
      paths[`thumbs/${this.tid}`] = thumb = d.image.thumb;
      paths[`photos/${this.tid}`] = d.image.full;
      post.photo = true;
    } else if (d.image === 'keep') {
      post.photo = true;
    } else if (this.state.mine?.photo) {
      paths[`thumbs/${this.tid}`] = thumb = null;
      paths[`photos/${this.tid}`] = null;
    }
    paths[`posts/${this.tid}`] = post;
    await update(ref(this.db, this.base), paths);
    if (thumb !== undefined) {
      this.thumbs.set(this.tid, Promise.resolve(thumb));
      this.photos.set(this.tid, Promise.resolve(thumb === null ? null : (d.image as {full: string}).full));
    }
  }

  thumb(tid: string): Promise<string | null> {
    let p = this.thumbs.get(tid);
    if (!p) {
      p = get(ref(this.db, `${this.base}/thumbs/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.thumbs.set(tid, p);
    }
    return p;
  }

  photo(tid: string): Promise<string | null> {
    let p = this.photos.get(tid);
    if (!p) {
      p = get(ref(this.db, `${this.base}/photos/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.photos.set(tid, p);
    }
    return p;
  }

  stop() {
    for (const u of [...this.unsubs, ...this.mineUnsubs, ...this.wallUnsubs]) u();
    this.unsubs = [];
    this.mineUnsubs = [];
    this.wallUnsubs = [];
    this.watching = false;
    this.subs.clear();
  }
}
