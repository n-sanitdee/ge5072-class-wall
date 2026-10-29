// Phone side of a wall. The student screen and the load test both use it.
import {type Database, type Unsubscribe, get, onValue, ref, runTransaction, serverTimestamp, update} from 'firebase/database';
import {merge3} from './merge.ts';
import {type Draft, LIMITS, type Post, type Pub, type Team} from './types.ts';

export type JoinError = 'not-found' | 'locked' | 'revealed' | 'ended' | 'taken' | 'removed' | 'gone' | 'network';

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

/** Tidy one participant's nickname (same checks as a name, shorter). */
export function checkMember(raw: string): {name: string; error?: 'empty' | 'long' | 'chars' | 'digits'} {
  const c = checkName(raw);
  if (!c.error && c.name.length > LIMITS.member) return {name: c.name, error: 'long'};
  return c;
}

/** The group's name when nobody typed one: the members' nicknames ("Mint, Ploy & Bo"). */
export function defaultGroupName(members: string[]): string {
  const m = members.filter(Boolean);
  const full = m.length > 1 ? `${m.slice(0, -1).join(', ')} & ${m.at(-1)}` : (m[0] ?? '');
  if (full.length <= LIMITS.name) return full;
  return m.join(' ').slice(0, LIMITS.name).trim();
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
  /** The groups (names + members; readable by everyone with the code, so members can tap their group). */
  groups: Record<string, Team>;
  /** This phone's team still exists (null = not known yet; false once it is gone). */
  inWall: boolean | null;
  removed: boolean;
  mine?: Post | null;
  /** Wk14 chart: the chart Ladpet gave this name (undefined = not yet). */
  chart?: number;
  /** = groups (kept for the board code). */
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
  state: WallState = {pub: null, groups: {}, inWall: null, removed: false, teams: {}, posts: {}, connected: false};
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

  /** Start a new pair/group: its participants first, then (optionally) a group name. */
  async join(name: string, members?: string[]): Promise<void> {
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
        [`${this.base}/teams/${tid}`]: members?.length ? {name, joinedAt: serverTimestamp(), members} : {name, joinedAt: serverTimestamp()},
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

  /** A member of a group that is already on the wall taps their group (and their name). */
  async joinGroup(tid: string, addMember?: string): Promise<void> {
    let pub: Pub | null;
    let team: Team | null;
    try {
      pub = await peekWall(this.db, this.code);
      team = (await get(ref(this.db, `${this.base}/teams/${tid}`))).val() as Team | null;
    } catch {
      throw new JoinFailed('network');
    }
    if (!pub || pub.ended) throw new JoinFailed(pub ? 'ended' : 'not-found');
    if (!team) throw new JoinFailed('gone');
    this.tid = tid;
    this.name = team.name;
    if (addMember && !(team.members ?? []).some((m) => m.toLowerCase() === addMember.toLowerCase())) {
      await this.setMembers([...(team.members ?? []), addMember]).catch(() => {});
    }
    this.patch({inWall: true, removed: false, mine: null});
    if (this.watching) this.watchMine();
  }

  /**
   * "Not your group?" (Mew, 29 Oct 2026: a student added her name to the wrong group): take this phone's
   * nickname off the group it is leaving, so it can tap its name under the right one. Only a name this phone typed
   * (`typed`); phones that joined before 29 Oct don't know, and "+ me" adds at the end, so 'if-last'. The group keeps its last name.
   */
  async leaveGroup(me: string, typed: boolean | 'if-last') {
    if (!this.tid || !me || !typed) return;
    const team = (await get(ref(this.db, `${this.base}/teams/${this.tid}`))).val() as Team | null;
    const members = team?.members ?? [];
    const same = (m: string) => m.toLowerCase() === me.toLowerCase();
    if (typed === 'if-last' && !(members.length && same(members[members.length - 1]))) return;
    const rest = members.filter((m) => !same(m));
    if (rest.length && rest.length < members.length) await this.setMembers(rest);
  }

  async setMembers(members: string[]) {
    if (!this.tid) throw new Error('Join first.');
    await update(ref(this.db, `${this.base}/teams/${this.tid}`), {members: members.length ? members.slice(0, LIMITS.members) : null});
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
    on<Record<string, Team>>(`${this.base}/teams`, (teams) => this.patch({groups: teams ?? {}, teams: teams ?? {}}));
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

  private get mineBase() {
    if (!this.tid) throw new Error('Join first.');
    return `${this.base}/posts/${this.tid}`;
  }

  /** The group's post must exist (with its server time) before single parts of it are saved. */
  private async ensurePost() {
    if (this.state.mine) return;
    const s = await get(ref(this.db, `${this.mineBase}/at`));
    if (!s.exists()) await update(ref(this.db, this.mineBase), {at: serverTimestamp()});
  }

  /**
   * Save one part of the group's post ("text", or a field such as "f0"/"b0"). `base` is what this phone last saw
   * saved, `local` what it shows now; with `merge`, edits other members made meanwhile are kept (see merge.ts).
   * Returns what is saved now.
   */
  async saveField(key: string, base: string, local: string, merge: boolean): Promise<string> {
    await this.ensurePost();
    const path = key === 'text' ? `${this.mineBase}/text` : `${this.mineBase}/fields/${key}`;
    const res = await runTransaction(
      ref(this.db, path),
      (cur: string | null) => {
        const next = merge ? merge3(base, local, cur ?? '') : local;
        return next.trim() ? next : null;
      },
      {applyLocally: false},
    );
    return (res.snapshot.val() as string | null) ?? '';
  }

  /** Add, replace (image) or remove (null) the group's photo. */
  async setPhoto(image: {full: string; thumb: string} | null) {
    const tid = this.tid;
    if (!tid) throw new Error('Join first.');
    await this.ensurePost();
    await update(ref(this.db, this.base), {
      [`thumbs/${tid}`]: image?.thumb ?? null,
      [`photos/${tid}`]: image?.full ?? null,
      [`posts/${tid}/photo`]: image ? true : null,
      [`posts/${tid}/at`]: serverTimestamp(),
    });
  }

  /** "Post on Ladpet" (true), or the Wk14 chart this group was given. */
  async setDone(done: boolean) {
    await this.ensurePost();
    await update(ref(this.db, this.mineBase), {done: done || null});
  }

  async setChoice(choice: number) {
    await this.ensurePost();
    await update(ref(this.db, this.mineBase), {choice});
  }

  /** Write the whole post in one go and mark it posted (tests and the load test). */
  async post(d: Draft): Promise<void> {
    if (!this.tid) throw new Error('Join first.');
    const post: Record<string, unknown> = {at: serverTimestamp(), done: true};
    const text = d.text?.trim();
    if (text) post.text = text;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.fields ?? {})) {
      const t = v.trim();
      if (t) fields[k] = t;
    }
    if (Object.keys(fields).length) post.fields = fields;
    if (typeof d.choice === 'number') post.choice = d.choice;
    const paths: Record<string, unknown> = {};
    if (d.image && d.image !== 'keep') {
      paths[`thumbs/${this.tid}`] = d.image.thumb;
      paths[`photos/${this.tid}`] = d.image.full;
      post.photo = true;
    } else if (d.image === 'keep') {
      post.photo = true;
    } else if (this.state.mine?.photo) {
      paths[`thumbs/${this.tid}`] = null;
      paths[`photos/${this.tid}`] = null;
    }
    paths[`posts/${this.tid}`] = post;
    await update(ref(this.db, this.base), paths);
  }

  /** Cache key: a group's photo can be changed by any member, so the post time is part of it. */
  private photoKey(tid: string): string {
    const at = (tid === this.tid ? this.state.mine?.at : this.state.posts[tid]?.at) ?? 0;
    return `${tid}@${at}`;
  }

  thumb(tid: string): Promise<string | null> {
    const key = this.photoKey(tid);
    let p = this.thumbs.get(key);
    if (!p) {
      p = get(ref(this.db, `${this.base}/thumbs/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.thumbs.set(key, p);
    }
    return p;
  }

  photo(tid: string): Promise<string | null> {
    const key = this.photoKey(tid);
    let p = this.photos.get(key);
    if (!p) {
      p = get(ref(this.db, `${this.base}/photos/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.photos.set(key, p);
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
