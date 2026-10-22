// Security-rules and engine checks against the local emulators.
// Run: npm run emulators   (in another terminal)   then   node tests/rules-test.ts
// --live runs the same checks against the real Firebase project (needs the rules published there).
import {deleteApp} from 'firebase/app';
import {get, limitToFirst, orderByChild, query, ref, serverTimestamp, set, update} from 'firebase/database';
import {firebaseConfig} from '../src/firebase-config.ts';
import {EMULATOR_CONFIG, openDatabase, signInHost} from '../src/lib/fb.ts';
import {JoinFailed, WallClient, newTeamId} from '../src/lib/wall-client.ts';
import {WallHost, revealBlocker} from '../src/lib/wall-host.ts';

const live = process.argv.includes('--live');
const backend = live ? {config: firebaseConfig} : {config: EMULATOR_CONFIG, emulatorHost: '127.0.0.1'};
let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra && !ok ? ` (${extra})` : ''}`);
  if (ok) passes++;
  else failures++;
}
async function denied(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    return String((e as {code?: string}).code ?? e).toLowerCase().includes('permission');
  }
}
async function allowed(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return true;
  } catch (e) {
    console.log('   ↳', (e as Error).message);
    return false;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(2000);

// ── host + three phones on the photo wall (Wk13 spot the nine mistakes) ──
const hostApp = openDatabase(backend, 'host');
const uid = await signInHost(hostApp.app, backend);
const host = await WallHost.create(hostApp.db, uid, {preset: 'wk13-spot9', section: 'CA48'});
host.autoReveal = false;
const code = host.view.code;
const base = `walls/${code}`;
console.log('wall', code);

const apps = [0, 1, 2].map((k) => openDatabase(backend, `p${k}`));
const phones = apps.map((a) => new WallClient(a.db, code));
const names = ['Mint & Ploy', 'Bo', 'Cy & Dee'];
await Promise.all(phones.map((p, k) => p.join(names[k])));
for (const p of phones) p.watch();
await sleep(500);
check('3 pairs joined and the host sees them', Object.keys(host.view.teams).length === 3);

const dupApp = openDatabase(backend, 'dup');
let dupErr = '';
try {
  await new WallClient(dupApp.db, code).join('mint &  ploy'.replace(/\s+/g, ' '));
} catch (e) {
  dupErr = (e as JoinFailed).code;
}
check('duplicate pair name refused ("mint & ploy" vs "Mint & Ploy")', dupErr === 'taken');

// A separate connection with no team: what a curious classmate could try.
const xdb = openDatabase(backend, 'attacker').db;
const [a, b] = phones;
check('stranger cannot list the teams before the reveal', await denied(get(ref(xdb, `${base}/teams`))));
check('stranger cannot list the posts before the reveal', await denied(get(ref(xdb, `${base}/posts`))));
check('stranger cannot list thumbnails before the reveal', await denied(get(ref(xdb, `${base}/thumbs`))));
check('stranger cannot list photos before the reveal', await denied(get(ref(xdb, `${base}/photos`))));
check('stranger cannot read the name index (it maps names to ids)', await denied(get(ref(xdb, `${base}/names`))));
check('stranger cannot read the kicked list', await denied(get(ref(xdb, `${base}/kicked`))));
check('stranger cannot list walls', await denied(get(ref(xdb, 'walls'))));
check('stranger cannot read the wall index', await denied(get(ref(xdb, 'wallIndex'))));
check('anyone can read the public part with the code', await allowed(get(ref(xdb, `${base}/pub`))));
check('stranger cannot reveal the wall', await denied(set(ref(xdb, `${base}/pub/revealed`), true)));
check('stranger cannot unlock / change pub', await denied(update(ref(xdb, `${base}/pub`), {locked: false, title: 'x'})));
check('stranger cannot delete the wall', await denied(set(ref(xdb, base), null)));
check('stranger cannot post without a team', await denied(set(ref(xdb, `${base}/posts/${newTeamId()}`), {at: serverTimestamp(), text: 'hi'})));
check('stranger cannot write into the roster', await denied(set(ref(xdb, `${base}/pub/roster/0`), {n: 'x', p: true})));

// Posting
check('pair A posts text', await allowed(a.post({text: '1. Sunny Tea is a Thai tea brand.'})));
check(
  'pair B posts a photo + text',
  await allowed(b.post({text: 'see photo', image: {full: JPEG, thumb: JPEG}})),
);
await sleep(300);
check('host sees both posts', !!host.view.posts[a.tid!] && !!host.view.posts[b.tid!]?.photo);
check('host does not auto-reveal while pair C is still writing', revealBlocker(host.view) === 'waiting');
check('pair A can read its own post', await allowed(get(ref(apps[0].db, `${base}/posts/${a.tid}`))));
check('pair B can read its own thumbnail', await allowed(get(ref(apps[1].db, `${base}/thumbs/${b.tid}`))));
check('pair A cannot list everyone\'s posts', await denied(get(ref(apps[0].db, `${base}/posts`))));
check('pair A cannot list the teams', await denied(get(ref(apps[0].db, `${base}/teams`))));
// A pair's id is a 20-character random secret kept on its phone (as in Hakoot): nobody can list the ids before
// the reveal (teams/names/kicked are closed, see above), and after the reveal no post can change.
check('a made-up team id cannot post', await denied(set(ref(apps[0].db, `${base}/posts/${newTeamId()}`), {at: serverTimestamp(), text: 'x'})));
check('pair A cannot rename itself', await denied(set(ref(apps[0].db, `${base}/teams/${a.tid}/name`), 'Zed')));
check('a post needs a server timestamp', await denied(set(ref(apps[0].db, `${base}/posts/${a.tid}`), {at: 1, text: 'x'})));
check('a post needs content', await denied(set(ref(apps[0].db, `${base}/posts/${a.tid}`), {at: serverTimestamp()})));
check('no unknown fields in a post', await denied(set(ref(apps[0].db, `${base}/posts/${a.tid}`), {at: serverTimestamp(), text: 'x', score: 10})));
check('text is capped at 1000 characters', await denied(set(ref(apps[0].db, `${base}/posts/${a.tid}`), {at: serverTimestamp(), text: 'x'.repeat(1001)})));
check('photo flag needs the photo itself', await denied(update(ref(apps[0].db, base), {[`posts/${a.tid}`]: {at: serverTimestamp(), photo: true}})));
check('a photo must be a JPEG data URL', await denied(set(ref(apps[0].db, `${base}/photos/${a.tid}`), 'data:text/html;base64,AAAA')));
check('a photo is capped at 1.5 MB', await denied(set(ref(apps[0].db, `${base}/photos/${a.tid}`), 'data:image/jpeg;base64,' + 'A'.repeat(1_500_001))));
check('pair A can replace its post', await allowed(a.post({text: '1. Sunny Tea is a Thai tea brand. 2. brand. It'})));
check('pair B can drop its photo (text-only edit)', await allowed(b.post({text: 'typed instead'})));
await sleep(200);
check('pair B\'s photo is gone after the edit', !(await get(ref(hostApp.db, `${base}/photos/${b.tid}`))).exists());
check('pair B posts its photo again', await allowed(b.post({text: 'photo again', image: {full: JPEG, thumb: JPEG}})));

// Remove a ghost
const ghostApp = openDatabase(backend, 'ghost');
const ghost = new WallClient(ghostApp.db, code);
await ghost.join('Ghost');
await sleep(300);
check('host sees the ghost join', Object.keys(host.view.teams).length === 4);
await host.remove(ghost.tid!);
await sleep(300);
check('removed name is gone from the host view', Object.keys(host.view.teams).length === 3);
check('removed pair cannot post', await denied(ghost.post({text: 'boo'})));
check(
  'removed pair cannot re-create its team with the same id',
  await denied(update(ref(ghostApp.db), {[`${base}/teams/${ghost.tid}`]: {name: 'Ghost2', joinedAt: serverTimestamp()}, [`${base}/names/ghost2`]: ghost.tid})),
);
check('removed pair can read that it was removed', (await get(ref(ghostApp.db, `${base}/kicked/${ghost.tid}`))).val() === true);
check('the name "Ghost" is free again', await allowed(new WallClient(openDatabase(backend, 'ghost3').db, code).join('Ghost')));
await sleep(300);
const ghost3 = Object.entries(host.view.teams).find(([, t]) => t.name === 'Ghost');
if (ghost3) await host.remove(ghost3[0]);

// Locking
await host.setLocked(true);
let lockErr = '';
try {
  await new WallClient(openDatabase(backend, 'late').db, code).join('Late');
} catch (e) {
  lockErr = (e as JoinFailed).code;
}
check('no joining while joining is closed', lockErr === 'locked');
await host.setLocked(false);

// Reveal rules
await host.setExpected(3);
await sleep(200);
check('expected = 3 but C has not posted: still hidden', revealBlocker(host.view) === 'waiting');
check('pair C posts', await allowed(phones[2].post({text: 'fixes'})));
await sleep(400);
check('all 3 of 3 posted → the wall may open', revealBlocker(host.view) === null);
await host.reveal();
await sleep(400);
check('after the reveal a stranger can list the posts', await allowed(get(ref(xdb, `${base}/posts`))));
check('after the reveal a stranger can list the teams', await allowed(get(ref(xdb, `${base}/teams`))));
check('after the reveal thumbnails are readable', await allowed(get(ref(xdb, `${base}/thumbs`))));
check('after the reveal photos are readable', await allowed(get(ref(xdb, `${base}/photos/${b.tid}`))));
check('the name index stays host-only after the reveal', await denied(get(ref(xdb, `${base}/names`))));
check('no post can change after the reveal', await denied(a.post({text: 'changed my mind'})));
check('no photo can change after the reveal', await denied(set(ref(apps[1].db, `${base}/photos/${b.tid}`), JPEG)));
check('the host cannot un-reveal', await denied(set(ref(hostApp.db, `${base}/pub/revealed`), false)));
check('photo setting cannot change', await denied(set(ref(hostApp.db, `${base}/pub/photo`), false)));
let revErr = '';
try {
  await new WallClient(openDatabase(backend, 'late2').db, code).join('Later');
} catch (e) {
  revErr = (e as JoinFailed).code;
}
check('nobody can join after the reveal', revErr === 'revealed' || revErr === 'locked');
check('phones see the reveal', phones.every((p) => p.state.pub?.revealed === true));
await sleep(300);
check('phones load the whole wall after the reveal', phones.every((p) => Object.keys(p.state.posts).length === 3));

// Text-only wall: no photos at all
const textWall = await WallHost.create(hostApp.db, uid, {preset: 'wk14-changed', section: 'EC30'});
const tp = new WallClient(openDatabase(backend, 'tp').db, textWall.view.code);
await tp.join('Sunny team');
check('text wall: branch notes are accepted', await allowed(tp.post({fields: {f0: 'rose by 20% in May', f4: 'a sharp rise in followers'}})));
check('text wall: photos are refused', await denied(tp.post({fields: {f0: 'x'}, image: {full: JPEG, thumb: JPEG}})));
check('text wall: field keys are f0–f9 / b0–b9 only', await denied(set(ref(tp.db, `walls/${textWall.view.code}/posts/${tp.tid}`), {at: serverTimestamp(), fields: {sales: 'x'}})));
check('text wall: the builder inputs (b0) are stored with the sentence', await allowed(tp.post({fields: {f0: 'Sales rose sharply by 20% in May.', b0: JSON.stringify({s: 0, v: 0, a: 0, p: 'by', x: '20%', w: 4})}})));
check('text wall: a field is capped at 400 characters', await denied(set(ref(tp.db, `walls/${textWall.view.code}/posts/${tp.tid}`), {at: serverTimestamp(), fields: {f0: 'x'.repeat(401)}})));
await textWall.finish();
check('text wall deleted by the host', !(await get(ref(hostApp.db, `walls/${textWall.view.code}/meta`))).exists());

// Wk14 chart wall: the host gives each name a chart; a post's chart must be the one it was given
const chartWall = await WallHost.create(hostApp.db, uid, {preset: 'wk14-chart', section: 'TS66'});
const cw = `walls/${chartWall.view.code}`;
const cps = [0, 1, 2, 3, 4].map((k) => new WallClient(openDatabase(backend, `cp${k}`).db, chartWall.view.code));
for (const c of cps) {
  await c.join(`Chart pair ${cps.indexOf(c) + 1}`);
  c.watch();
}
await sleep(1200);
const given = cps.map((c) => c.state.chart);
check('every name was given a chart', given.every((g) => typeof g === 'number'), JSON.stringify(given));
check('charts go round in turn (0 1 2 3 0)', JSON.stringify(given) === '[0,1,2,3,0]', JSON.stringify(given));
check('a name cannot change its chart', await denied(set(ref(cps[0].db, `${cw}/assign/${cps[0].tid}`), 2)));
check('a stranger cannot list the charts given', await denied(get(ref(xdb, `${cw}/assign`))));
check('a post with another chart is refused', await denied(cps[1].post({fields: {f0: 'Followers rose.'}, choice: 3})));
check('a post with its own chart is accepted', await allowed(cps[1].post({fields: {f0: 'Followers rose sharply to 15,000 in April.'}, choice: 1})));
await chartWall.remove(cps[2].tid!);
const late = new WallClient(openDatabase(backend, 'cp-late').db, chartWall.view.code);
await late.join('Late pair');
late.watch();
await sleep(1000);
check('after a removal the next name gets the chart nobody has (2)', late.state.chart === 2, String(late.state.chart));
await chartWall.finish();
for (const c of [...cps, late]) c.stop();

// Custom wall: live — posts show straight away (Mew, 22 Oct 2026)
const liveWall = await WallHost.create(hostApp.db, uid, {preset: 'custom', section: 'AC21', title: 'Best slogan', prompt: 'One slogan for the café.'});
const lw = `walls/${liveWall.view.code}`;
check('custom wall is live', liveWall.view.pub.live === true && !liveWall.view.pub.revealed);
const solo = new WallClient(openDatabase(backend, 'solo').db, liveWall.view.code);
await solo.join('Mint');
check('live wall: a single name can post', await allowed(solo.post({text: 'Coffee that wakes up your ideas.'})));
check('live wall: a stranger can read the posts straight away', await allowed(get(ref(xdb, `${lw}/posts`))));
check('live wall: and the names', await allowed(get(ref(xdb, `${lw}/teams`))));
check('live wall: the post can still be edited', await allowed(solo.post({text: 'Coffee that wakes up your best ideas.'})));
await sleep(300);
check('live wall: host sees the edit', liveWall.view.posts[solo.tid!]?.text === 'Coffee that wakes up your best ideas.');
check('live wall: the host never auto-reveals it', revealBlocker(liveWall.view) === null && !liveWall.view.pub.revealed);
check('live flag cannot be switched off', await denied(set(ref(hostApp.db, `${lw}/pub/live`), false)));
check('a hidden wall cannot be switched to live', await denied(set(ref(hostApp.db, `${base}/pub/live`), true)));
await liveWall.finish();
solo.stop();

// Another signed-in user (e.g. a student who opened #host) cannot touch this wall
const other = openDatabase(backend, 'other-host');
await signInHost(other.app, backend);
check('another host cannot change this wall', await denied(update(ref(other.db, `${base}/pub`), {fixes: true})));
check('another host cannot read the name index', await denied(get(ref(other.db, `${base}/names`))));
check('another host cannot delete a fresh wall', await denied(set(ref(other.db, base), null)));
check('the stale-wall clean-up query is allowed', await allowed(WallHost.cleanupStale(other.db, Date.now())));
check('…and it leaves fresh walls alone', (await get(ref(hostApp.db, `${base}/meta`))).exists());

// Finish
const ended: boolean[] = [];
phones[0].subscribe((s) => ended.push(!s.pub || !!s.pub.ended));
await host.finish();
await sleep(500);
check('wall deleted by Finish & delete', !(await get(ref(hostApp.db, `walls/${code}/meta`))).exists());
const idx = await get(query(ref(hostApp.db, 'wallIndex'), orderByChild('createdAt'), limitToFirst(100)));
check('wall index entry deleted', !idx.hasChild(code));
check('phones learn that the wall ended', ended.at(-1) === true);

for (const p of [...phones, tp, ghost]) p.stop();
console.log(`\n${passes} passed, ${failures} failed`);
await Promise.all([hostApp, ...apps, other, dupApp, ghostApp].map((x) => deleteApp(x.app).catch(() => {})));
process.exit(failures ? 1 : 0);
