// Week 16 peer review: copy every peer-review wall still in the database to a PRIVATE folder (Mew's OneDrive), so
// the reviewed groups can get their peers' feedback after class. The boards site never publishes these walls; the
// 6-hour clean-up deletes them, so run this within 6 hours of each class.
//   node scripts/collect-reviews.ts "<…/Teaching/Assignments/PeerReview_Wk16/collected>"
// A wall must be revealed (it is once every group has posted, or when the teacher presses Finish) — before that,
// only the projector that opened it can read the posts.
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {deleteApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {get, limitToFirst, orderByChild, query, ref} from 'firebase/database';
import {firebaseConfig} from '../src/firebase-config.ts';
import {EMULATOR_CONFIG, openDatabase, signInHost} from '../src/lib/fb.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/collect-reviews.ts <out dir>');
const emu = process.env.COLLECT_EMULATOR === '1';
const backend = emu ? {config: EMULATOR_CONFIG, emulatorHost: '127.0.0.1'} : {config: firebaseConfig};
const {app, db} = openDatabase(backend);
await signInHost(app, backend);
mkdirSync(out, {recursive: true});
let saved = 0;
try {
  const idx = await get(query(ref(db, 'wallIndex'), orderByChild('createdAt'), limitToFirst(100)));
  const codes: [string, number][] = [];
  idx.forEach((c) => {
    codes.push([c.key!, (c.val() as {createdAt: number}).createdAt]);
  });
  for (const [code, createdAt] of codes) {
    const pub = (await get(ref(db, `walls/${code}/pub`))).val();
    if (pub?.preset !== 'wk16-review') continue;
    const when = new Date(createdAt + 7 * 3600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    if (!pub.revealed) {
      console.log(`${code} ${pub.section} ${when}: not revealed yet — posts are hidden; press Reveal now or Finish on the projector`);
      continue;
    }
    const part = async (p: string) => (await get(ref(db, `walls/${code}/${p}`))).val() ?? {};
    const data = {code, section: pub.section, createdAt, pub, teams: await part('teams'), posts: await part('posts'), review: await part('review'), rkey: await part('rkey')};
    const file = join(out, `${pub.section}_${when}_${code}.json`);
    const text = JSON.stringify(data, null, 1);
    if (existsSync(file) && readFileSync(file, 'utf8') === text) {
      console.log(`${code} ${pub.section}: unchanged`);
      continue;
    }
    writeFileSync(file, text);
    saved++;
    console.log(`${code} ${pub.section}: ${Object.keys(data.teams).length} groups → ${file}`);
  }
} finally {
  await getAuth(app).currentUser?.delete().catch(() => {});
  await deleteApp(app);
}
console.log(`${saved} file(s) written.`);
process.exit(0);
