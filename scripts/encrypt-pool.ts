// Encrypt the Week 16 peer-review pool for the site (Mew, 20 Nov 2026).
//   node scripts/encrypt-pool.ts <GE5072_PeerReview_Pool.json> <passphrase.txt>   → public/wk16/pool.enc.json
// The pool itself is private (Teaching/Assignments/PeerReview_Wk16, OneDrive) and never goes into this repo; the
// teacher's projector unlocks the encrypted copy with the passphrase (README_TEACHER_ONLY.md in that folder).
// It also checks that the app's /8 rule (src/lib/review.ts) gives Mew's score for every project.
import {readFileSync, writeFileSync} from 'node:fs';
import {decryptPool, encryptPool, scoreOf, type Pool} from '../src/lib/review.ts';

const [poolPath, passPath] = process.argv.slice(2);
if (!poolPath || !passPath) throw new Error('usage: node scripts/encrypt-pool.ts <pool.json> <passphrase.txt>');
const json = readFileSync(poolPath, 'utf8');
const pass = readFileSync(passPath, 'utf8').trim();
const pool = JSON.parse(json) as Pool;
let bad = 0;
for (const p of pool.projects) {
  const s = scoreOf(p.p.map((u) => u.k), p.t.map((u) => u.k)).score;
  if (s !== p.score) {
    console.log(`MISMATCH ${p.id} ${p.co}: app rule ${s}, Mew ${p.score}`);
    bad++;
  }
}
if (bad) process.exit(1);
const enc = await encryptPool(JSON.stringify(pool), pass);
const back = await decryptPool(enc, pass);
if (back.projects.length !== pool.projects.length) throw new Error('round trip failed');
writeFileSync(new URL('../public/wk16/pool.enc.json', import.meta.url), JSON.stringify(enc) + '\n');
console.log(`${pool.projects.length} projects (built ${pool.built}) — app rule = Mew's score for all; wrote public/wk16/pool.enc.json`);
