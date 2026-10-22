// Load test: N pairs (default 30) on one photo wall, each on its own database connection, like a real class.
//   node tests/load-test.ts [--pairs 30] [--live]
// The pairs join in a burst, post marked screenshots (a real phone screenshot with red marks, as the phone app
// stores it: ~240 KB full + ~55 KB thumbnail), a few edit their post, a few lose their connection, one joins twice
// and is removed by the host. The wall must open by itself when the last pair posts; then every phone loads every
// thumbnail (what the phones do after the reveal) and the host loads every full photo (Save wall).
import {readFileSync} from 'node:fs';
import {deleteApp} from 'firebase/app';
import {goOffline, goOnline} from 'firebase/database';
import {firebaseConfig} from '../src/firebase-config.ts';
import {EMULATOR_CONFIG, openDatabase, signInHost} from '../src/lib/fb.ts';
import {WallClient} from '../src/lib/wall-client.ts';
import {WallHost} from '../src/lib/wall-host.ts';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const N = arg('--pairs', 30);
const live = process.argv.includes('--live');
const backend = live ? {config: firebaseConfig} : {config: EMULATOR_CONFIG, emulatorHost: '127.0.0.1'};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN);
};
const dataUrl = (f: string) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
const FULL = dataUrl('tests/fixtures/marked-full.jpg');
const THUMB = dataUrl('tests/fixtures/marked-thumb.jpg');
let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

console.log(`${live ? 'LIVE Firebase project' : 'Emulators'} · ${N} pairs · photo ${Math.round(FULL.length / 1024)} KB + thumb ${Math.round(THUMB.length / 1024)} KB (stored size)`);
const hostApp = openDatabase(backend, 'host');
const uid = await signInHost(hostApp.app, backend);
const host = await WallHost.create(hostApp.db, uid, {preset: 'wk13-spot9', section: 'LOADTEST'});
const code = host.view.code;
console.log('wall', code);
let revealedAt = 0;
host.subscribe((v) => {
  if (v.pub.revealed && !revealedAt) revealedAt = Date.now();
});
await host.setExpected(N);

// ── join burst (over ~6 s) ──
const apps = Array.from({length: N}, (_, i) => openDatabase(backend, `pair${i}`));
const pairs = apps.map((a) => new WallClient(a.db, code));
const joinMs: number[] = [];
await Promise.all(
  pairs.map(async (p, i) => {
    await sleep(rand(0, 6000));
    const t = Date.now();
    await p.join(`Pair ${i + 1}`);
    joinMs.push(Date.now() - t);
    p.watch();
  }),
);
check(`${N}/${N} pairs joined`, joinMs.length === N, `join p50 ${pct(joinMs, 50)} ms, p95 ${pct(joinMs, 95)} ms`);

// a duplicate join (same pair on a second phone) that the teacher removes
const dupApp = openDatabase(backend, 'dup');
const dup = new WallClient(dupApp.db, code);
await dup.join('Pair 1 again');
await sleep(800);
check('host sees N + 1 names (one duplicate)', Object.keys(host.view.teams).length === N + 1);
await host.remove(dup.tid!);
await sleep(800);
check('duplicate removed', Object.keys(host.view.teams).length === N);

// ── posting: 70 % photo, 30 % text, over ~15 s; 3 phones drop their connection meanwhile ──
const postMs: number[] = [];
const flaky = new Set([2, 9, 17].filter((i) => i < N));
const last = N - 1;
await Promise.all(
  pairs.slice(0, last).map(async (p, i) => {
    await sleep(rand(0, 15000));
    if (flaky.has(i)) {
      goOffline(apps[i].db);
      setTimeout(() => goOnline(apps[i].db), rand(2000, 5000));
    }
    const t = Date.now();
    await p.post(i % 10 < 7 ? {text: i % 2 ? 'Our fixes are in the photo.' : undefined, image: {full: FULL, thumb: THUMB}} : {text: `1. Sunny Tea is … (pair ${i + 1})`});
    postMs.push(Date.now() - t);
  }),
);
check(`${last} pairs posted (3 of them through a dropped connection)`, postMs.length === last, `post ack p50 ${pct(postMs, 50)} ms, p95 ${pct(postMs, 95)} ms, max ${pct(postMs, 100)} ms`);
await sleep(1000);
check('still hidden: one pair has not posted', !host.view.pub.revealed);

// three pairs replace their post (new photo / text only)
await Promise.all([0, 1, 3].filter((i) => i < last).map((i) => pairs[i].post(i === 1 ? {text: 'Changed: typed instead'} : {image: {full: FULL, thumb: THUMB}})));
await sleep(800);
check('edits accepted before the reveal', host.view.posts[pairs[1].tid!]?.text === 'Changed: typed instead' && !host.view.posts[pairs[1].tid!]?.photo);

// ── the last pair posts → the wall opens by itself ──
const tLast = Date.now();
await pairs[last].post({image: {full: FULL, thumb: THUMB}});
for (let i = 0; i < 100 && !revealedAt; i++) await sleep(100);
check('the wall opened by itself after the last post', !!revealedAt, `${revealedAt - tLast} ms after the last post`);
const phoneReveal: number[] = [];
for (let i = 0; i < 100 && phoneReveal.length < N; i++) {
  await sleep(100);
  phoneReveal.length = 0;
  for (const p of pairs) if (p.state.pub?.revealed) phoneReveal.push(1);
}
check(`${N}/${N} phones saw the reveal`, phoneReveal.length === N);

// ── after the reveal: every phone loads the wall's thumbnails; the host loads every full photo ──
await sleep(800);
const withPhoto = Object.entries(host.view.posts).filter(([, p]) => p.photo).map(([id]) => id);
const t0 = Date.now();
const thumbBytes = await Promise.all(
  pairs.map(async (p) => {
    const ids = Object.entries(p.state.posts).filter(([, x]) => x.photo).map(([id]) => id);
    const got = await Promise.all(ids.map((id) => p.thumb(id)));
    return {n: got.filter(Boolean).length, bytes: got.reduce((s, g) => s + (g?.length ?? 0), 0)};
  }),
);
const thumbSec = (Date.now() - t0) / 1000;
check(
  `every phone loaded all ${withPhoto.length} thumbnails`,
  thumbBytes.every((x) => x.n === withPhoto.length),
  `${thumbSec.toFixed(1)} s for all phones · ${(thumbBytes.reduce((s, x) => s + x.bytes, 0) / 1e6).toFixed(1)} MB in total (${(thumbBytes[0].bytes / 1e6).toFixed(2)} MB per phone)`,
);
const t1 = Date.now();
const fulls = await Promise.all(withPhoto.map((id) => host.photo(id)));
check(
  'host loaded every full photo (Save wall)',
  fulls.every(Boolean),
  `${((Date.now() - t1) / 1000).toFixed(1)} s · ${(fulls.reduce((s, f) => s + (f?.length ?? 0), 0) / 1e6).toFixed(1)} MB`,
);
check('posts cannot change after the reveal', await pairs[0].post({text: 'late edit'}).then(() => false, () => true));

// ── finish ──
await host.finish();
await sleep(1500);
check(`${N}/${N} phones learned that the wall ended`, pairs.every((p) => !p.state.pub || p.state.pub.ended));
const estClass = thumbBytes[0].bytes * 56 + fulls.reduce((s, f) => s + (f?.length ?? 0), 0) * 2;
console.log(`\nDownload estimate for one class of 56 phones: ~${(estClass / 1e6).toFixed(0)} MB (Spark plan: 10 GB/month).`);
for (const p of pairs) p.stop();
await Promise.all([hostApp, dupApp, ...apps].map((a) => deleteApp(a.app).catch(() => {})));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
