// Host side of a wall (the projector). The host screen and the tests both drive this class.
import {
  type Database,
  type Unsubscribe,
  endAt,
  get,
  limitToFirst,
  onValue,
  orderByChild,
  query,
  ref,
  serverTimestamp,
  update,
} from 'firebase/database';
import {getPreset} from './presets.ts';
import {type Post, type PresetId, type Pub, type RosterRow, STALE_MS, type Team} from './types.ts';

export type HostView = {
  code: string;
  pub: Pub;
  teams: Record<string, Team>;
  posts: Record<string, Post>;
  /** Wk14 chart: which chart each name was given. */
  assign: Record<string, number>;
  createdAt: number;
  connected: boolean;
  offset: number;
};

export type NewWall = {preset: PresetId; section: string; title?: string; prompt?: string; photo?: boolean};

function randomCode(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(100000 + (b[0] % 900000));
}

/** Teams in the order they joined. */
export function orderedTeams(teams: Record<string, Team>): [string, Team][] {
  return Object.entries(teams).sort((a, b) => a[1].joinedAt - b[1].joinedAt || a[1].name.localeCompare(b[1].name));
}

/** Why the wall has not opened by itself yet (null = it should open now). */
export function revealBlocker(v: Pick<HostView, 'pub' | 'teams' | 'posts'>): string | null {
  const ids = Object.keys(v.teams);
  const posted = ids.filter((id) => v.posts[id]).length;
  if (v.pub.revealed || v.pub.live) return null;
  if (!ids.length) return 'nobody';
  if (posted < ids.length) return 'waiting';
  const expected = v.pub.expected ?? 0;
  if (v.pub.locked) return null;
  if (expected > 0 && ids.length >= expected) return null;
  return 'open';
}

export class WallHost {
  db: Database;
  view: HostView;
  private base: string;
  private subs = new Set<(v: HostView) => void>();
  private unsubs: Unsubscribe[] = [];
  private rosterTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRoster = '';
  private thumbCache = new Map<string, Promise<string | null>>();
  private photoCache = new Map<string, Promise<string | null>>();
  private revealing = false;
  private assignLoaded = false;
  /** Tests switch this off to check the manual path. */
  autoReveal = true;

  private constructor(db: Database, view: HostView) {
    this.db = db;
    this.view = view;
    this.base = `walls/${view.code}`;
  }

  static async create(db: Database, uid: string, w: NewWall): Promise<WallHost> {
    const preset = getPreset(w.preset);
    const pub: Pub = {
      title: (w.title ?? preset.title).slice(0, 120),
      preset: preset.id,
      section: w.section,
      photo: preset.id === 'custom' ? !!w.photo : preset.photo,
      live: !!preset.live,
      revealed: false,
      locked: false,
      expected: 0,
    };
    if (preset.id === 'custom' && w.prompt) pub.prompt = w.prompt.slice(0, 600);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      try {
        await update(ref(db), {
          [`wallIndex/${code}`]: {hostUid: uid, createdAt: serverTimestamp()},
          [`walls/${code}`]: {meta: {hostUid: uid, createdAt: serverTimestamp()}, pub},
        });
      } catch (e) {
        if (String((e as {code?: string}).code ?? e).toLowerCase().includes('permission')) continue; // code in use
        throw e;
      }
      const meta = await get(ref(db, `walls/${code}/meta/createdAt`));
      const host = new WallHost(db, {code, pub, teams: {}, posts: {}, assign: {}, createdAt: meta.val() ?? Date.now(), connected: true, offset: 0});
      host.attach();
      return host;
    }
    // Eight refusals in a row is not bad luck with codes: the database itself is refusing walls.
    throw new Error(
      'the database refused (permission denied). Are the Ladpet (Class Wall) rules published in the Firebase console? See the README, "One rules document".',
    );
  }

  /** Pick up a wall after the projector page was reloaded. Null if it is gone or not ours. */
  static async resume(db: Database, uid: string, code: string): Promise<WallHost | null> {
    const meta = await get(ref(db, `walls/${code}/meta`)).catch(() => null);
    if (!meta?.exists() || meta.val().hostUid !== uid) return null;
    const pub = (await get(ref(db, `walls/${code}/pub`))).val() as Pub | null;
    if (!pub || pub.ended) return null;
    const host = new WallHost(db, {code, pub, teams: {}, posts: {}, assign: {}, createdAt: meta.val().createdAt, connected: true, offset: 0});
    host.attach();
    return host;
  }

  /** Delete walls older than 3 hours (anyone signed in may, see database.rules.json). Returns how many. */
  static async cleanupStale(db: Database, serverNow: number): Promise<number> {
    const q = query(ref(db, 'wallIndex'), orderByChild('createdAt'), endAt(serverNow - STALE_MS - 60_000), limitToFirst(100));
    const snap = await get(q);
    const doomed: Record<string, null> = {};
    snap.forEach((c) => {
      doomed[`walls/${c.key}`] = null;
      doomed[`wallIndex/${c.key}`] = null;
    });
    if (Object.keys(doomed).length) await update(ref(db), doomed);
    return Object.keys(doomed).length / 2;
  }

  private attach() {
    const on = <T>(path: string, fn: (v: T | null) => void) =>
      this.unsubs.push(onValue(ref(this.db, path), (s) => fn(s.val() as T | null), () => {}));
    on<number>('.info/serverTimeOffset', (offset) => this.patch({offset: offset ?? 0}));
    on<boolean>('.info/connected', (c) => this.patch({connected: !!c}));
    on<Pub>(`${this.base}/pub`, (pub) => {
      if (!pub) return;
      this.patch({pub});
      this.maybeReveal(); // e.g. joining was just closed after everyone had posted
    });
    on<Record<string, Team>>(`${this.base}/teams`, (teams) => this.changed({teams: teams ?? {}}));
    on<Record<string, Post>>(`${this.base}/posts`, (posts) => this.changed({posts: posts ?? {}}));
    if (getPreset(this.view.pub.preset).charts) {
      on<Record<string, number>>(`${this.base}/assign`, (assign) => {
        this.assignLoaded = true;
        this.patch({assign: assign ?? {}});
        this.assignCharts();
      });
    }
  }

  /**
   * Wk14: give every new name a chart, in turn — the chart fewest names have, so the four stay even even after
   * removals. A name keeps its chart once given.
   */
  private assignCharts() {
    const charts = getPreset(this.view.pub.preset).charts;
    if (!charts || !this.assignLoaded || this.view.pub.revealed) return;
    const assign = {...this.view.assign};
    const writes: Record<string, number> = {};
    for (const [id] of orderedTeams(this.view.teams)) {
      if (assign[id] !== undefined) continue;
      const used = charts.map((_, c) => Object.keys(this.view.teams).filter((t) => assign[t] === c).length);
      const c = used.indexOf(Math.min(...used));
      assign[id] = c;
      writes[id] = c;
    }
    if (!Object.keys(writes).length) return;
    this.patch({assign});
    update(ref(this.db, `${this.base}/assign`), writes).catch(() => {});
  }

  subscribe(fn: (v: HostView) => void): () => void {
    this.subs.add(fn);
    fn(this.view);
    return () => this.subs.delete(fn);
  }

  private patch(p: Partial<HostView>) {
    this.view = {...this.view, ...p};
    for (const fn of this.subs) fn(this.view);
  }

  private changed(p: Partial<HostView>) {
    this.patch(p);
    this.scheduleRoster();
    this.assignCharts();
    this.maybeReveal();
  }

  roster(): RosterRow[] {
    return orderedTeams(this.view.teams).map(([id, t]) => ({n: t.name, p: !!this.view.posts[id]}));
  }

  /** Phones show "still waiting for …" from pub/roster; keep it in step (batched). */
  private scheduleRoster() {
    if (this.rosterTimer) return;
    this.rosterTimer = setTimeout(() => {
      this.rosterTimer = null;
      const r = this.roster();
      const key = JSON.stringify(r);
      if (key === this.lastRoster || this.view.pub.ended) return;
      this.lastRoster = key;
      update(ref(this.db, `${this.base}/pub`), {roster: r.length ? r : null}).catch(() => (this.lastRoster = ''));
    }, 400);
  }

  private maybeReveal() {
    if (!this.autoReveal || this.revealing || this.view.pub.revealed || this.view.pub.live) return;
    if (revealBlocker(this.view) === null) void this.reveal();
  }

  async reveal() {
    if (this.view.pub.revealed) return;
    this.revealing = true;
    try {
      await update(ref(this.db, `${this.base}/pub`), {revealed: true, locked: true});
      this.patch({pub: {...this.view.pub, revealed: true, locked: true}});
    } finally {
      this.revealing = false;
    }
  }

  async setLocked(locked: boolean) {
    this.patch({pub: {...this.view.pub, locked}});
    await update(ref(this.db, `${this.base}/pub`), {locked});
    this.maybeReveal();
  }

  async setExpected(n: number) {
    const expected = Math.max(0, Math.min(200, Math.round(n) || 0));
    this.patch({pub: {...this.view.pub, expected}});
    await update(ref(this.db, `${this.base}/pub`), {expected});
    this.maybeReveal();
  }

  async setFixes(fixes: boolean) {
    await update(ref(this.db, `${this.base}/pub`), {fixes});
  }

  /** Remove a ghost or duplicate pair; its phone is told and cannot post again with that id. */
  async remove(tid: string) {
    const t = this.view.teams[tid];
    const paths: Record<string, unknown> = {
      [`teams/${tid}`]: null,
      [`posts/${tid}`]: null,
      [`thumbs/${tid}`]: null,
      [`photos/${tid}`]: null,
      [`assign/${tid}`]: null,
      [`kicked/${tid}`]: true,
    };
    if (t) paths[`names/${t.name.toLowerCase().split(' ').join('')}`] = null;
    this.thumbCache.delete(tid);
    this.photoCache.delete(tid);
    await update(ref(this.db, this.base), paths);
  }

  /** Small picture for the card. */
  thumb(tid: string): Promise<string | null> {
    const key = `${tid}@${this.view.posts[tid]?.at ?? 0}`;
    let p = this.thumbCache.get(key);
    if (!p) {
      p = get(ref(this.db, `${this.base}/thumbs/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.thumbCache.set(key, p);
    }
    return p;
  }

  /** Full-size picture (spotlight, Save wall). */
  photo(tid: string): Promise<string | null> {
    const key = `${tid}@${this.view.posts[tid]?.at ?? 0}`;
    let p = this.photoCache.get(key);
    if (!p) {
      p = get(ref(this.db, `${this.base}/photos/${tid}`)).then((s) => s.val() as string | null, () => null);
      this.photoCache.set(key, p);
    }
    return p;
  }

  serverNow(): number {
    return Date.now() + this.view.offset;
  }

  /** "Finish & delete": tell the phones, then delete everything. */
  async finish() {
    await update(ref(this.db, `${this.base}/pub`), {ended: true}).catch(() => {});
    await update(ref(this.db), {[this.base]: null, [`wallIndex/${this.view.code}`]: null});
    this.destroy();
  }

  destroy() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.rosterTimer) clearTimeout(this.rosterTimer);
    this.subs.clear();
  }
}
