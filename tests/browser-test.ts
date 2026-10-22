// End-to-end check of the real screens: projector (Chromium 1920×1080, then 1280×720), an Android-sized Chrome
// phone and an iPhone-sized WebKit phone, plus scripted phones. The Android phone screenshots the passage, and
// that screenshot is what it posts. Saves screenshots of every phase to tests/out/screens/.
//
//   npm run emulators   # terminal 1
//   npm run dev:emu     # terminal 2 (port 5174)
//   node tests/browser-test.ts
import {mkdirSync, readFileSync} from 'node:fs';
import {type Page, chromium, devices, webkit} from 'playwright';
import {EMULATOR_CONFIG, openDatabase} from '../src/lib/fb.ts';
import {WallClient} from '../src/lib/wall-client.ts';

const BASE = process.env.BASE ?? 'http://localhost:5174/';
const OUT = 'tests/out/screens';
mkdirSync(OUT, {recursive: true});
const backend = {config: EMULATOR_CONFIG, emulatorHost: '127.0.0.1'};

let failures = 0;
let passes = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` (${extra})` : ''}`);
  if (ok) passes++;
  else failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({path: `${OUT}/${name}.png`, fullPage});
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const cr = await chromium.launch();
const wk = await webkit.launch();
const hostCtx = await cr.newContext({viewport: {width: 1920, height: 1080}, acceptDownloads: true});
const host = await hostCtx.newPage();
const android = await (await cr.newContext({...devices['Pixel 7'], viewport: {width: 375, height: 740}, deviceScaleFactor: 3})).newPage();
const ios = await (await wk.newContext({...devices['iPhone SE'], viewport: {width: 375, height: 667}})).newPage();
for (const [n, p] of [['host', host], ['android', android], ['ios', ios]] as const) {
  p.on('pageerror', (e) => check(`no page error on ${n}`, false, e.message));
  p.on('dialog', (d) => d.accept());
}

async function openWall(section: string, title: string): Promise<string> {
  await host.goto(`${BASE}#host`);
  await host.waitForSelector('text=Open the wall');
  await host.click(`.section-btn:has-text("${section}")`);
  await host.click(`.preset-card:has-text("${title}")`);
  await shot(host, `${title.replace(/\W+/g, '_')}-00-setup`);
  await host.click('text=Open the wall');
  await host.waitForSelector('.join-code');
  return (await host.textContent('.join-code'))!.replace(/\s/g, '');
}

// ════════════════════════════════════════ 1. Wk13 · Spot the Nine Mistakes (photo wall)
const code = await openWall('CA48', 'Spot the Nine Mistakes');
check('photo wall created', /^\d{6}$/.test(code), code);
await shot(host, '01-host-collect-empty');

// Android: open the wall from the QR link, screenshot the passage, join, post the screenshot
await android.goto(`${BASE}?w=${code}`);
await android.waitForSelector('.passage');
check('phone shows the passage before joining', (await android.textContent('.passage'))!.includes('brand.It was Founded in 2021 , and'));
check('passage keeps all nine mistakes (no final full stop)', (await android.textContent('.passage p'))!.trim().endsWith('picked by hand'));
await shot(android, '02-android-open', true);
check('android: no sideways scrolling', await noHScroll(android));
const passagePng = `${OUT}/passage-screenshot.png`;
await android.locator('.passage').screenshot({path: passagePng});
await android.evaluate(() => window.scrollTo(0, 0));
const fold = await android.evaluate(() => document.querySelector('.passage')!.getBoundingClientRect().bottom);
check('the whole passage is on the first phone screen (one screenshot, no scrolling)', fold <= 740, `bottom at ${Math.round(fold)} px of 740`);

await android.fill('#team-name', 'Mint & Ploy');
await android.click('button:has-text("Join")');
await android.waitForSelector('.composer');
await android.setInputFiles('input[type=file]', passagePng);
await android.waitForSelector('.photo-preview img');
await shot(android, '03-android-photo-chosen', true);
await android.click('button:has-text("Post to the wall")');
await android.waitForSelector('.posted');
await shot(android, '04-android-posted', true);
check('android: posted (photo)', (await android.textContent('.posted'))!.includes('hidden until everyone has posted'));

// iPhone (WebKit): a student ID as the name is refused; then join and post typed fixes
await ios.goto(`${BASE}?w=${code}`);
await ios.waitForSelector('#team-name');
await ios.fill('#team-name', '6510611111118');
await ios.click('button:has-text("Join")');
check('iPhone: a student ID is refused as a name', (await ios.textContent('.join-form .error'))?.includes('student ID') ?? false);
await ios.fill('#team-name', 'mint & ploy');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.join-form .error');
check('iPhone: a duplicate name is refused', (await ios.textContent('.join-form .error'))!.includes('taken'));
await ios.fill('#team-name', 'Bo & Cy');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.composer');
await ios.click('button:has-text("Post to the wall")');
check('iPhone: an empty post is refused', (await ios.textContent('.composer .error'))!.includes('photo'));
await ios.fill('.composer textarea', '1. Sunny Tea is a Thai tea brand.\n2. brand. It\n3. founded');
await ios.click('button:has-text("Post to the wall")');
await ios.waitForSelector('.posted');
check('iPhone: no sideways scrolling', await noHScroll(ios));
await shot(ios, '05-ios-posted', true);

// 20 scripted phones; their photo = the real screenshot, shrunk the way the app does it
const jpeg = await android.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.8);
}, readFileSync(passagePng).toString('base64'));
const bots: WallClient[] = [];
for (let i = 0; i < 20; i++) {
  const c = new WallClient(openDatabase(backend, `bot${i}`).db, code);
  await c.join(`Pair ${String.fromCharCode(65 + i)}${i % 3 ? '' : ' & Friend'}`);
  bots.push(c);
}
await Promise.all(bots.slice(0, 19).map((c, i) => c.post(i % 2 ? {image: {full: jpeg, thumb: jpeg}} : {text: `Fixes from bot ${i}: Sunny Tea is …`})));
await host.waitForFunction(() => document.querySelectorAll('.tile').length === 22);
await sleep(600);
await shot(host, '06-host-collect-21-of-22');
const hostText = await host.textContent('body');
check('projector shows 21 / 22 posted', (await host.textContent('.pairs-head .count'))!.replace(/\s+/g, ' ').includes('21 / 22'));
check('projector shows no post content before the reveal', !hostText!.includes('Sunny Tea is') && !hostText!.includes('Fixes from bot') && (await host.locator('img.thumb').count()) === 0);
check('phones see progress but not other posts', (await android.textContent('.progress-phone'))!.includes('21 of 22') && !(await android.textContent('body'))!.includes('Fixes from bot'));
check('phones see who is still writing', (await android.textContent('.progress-phone'))!.includes('Pair T'));

// Close joining → still hidden (Pair T missing) → Pair T posts → the wall opens by itself
await host.click('button:has-text("Close joining")');
await sleep(500);
check('closing joining alone does not open the wall', (await host.locator('.board').count()) === 0);
await bots[19].post({text: 'Last pair: the leaves are picked by hand.'});
await host.waitForSelector('.board .card', {timeout: 8000});
await host.waitForFunction(() => document.querySelectorAll('.board .card').length === 22);
await host.waitForFunction(() => [...document.querySelectorAll('.board img.thumb')].length === 10);
await sleep(800);
await shot(host, '07-host-revealed');
await shot(host, '07b-host-revealed-full', true);
check('the wall opened by itself when every pair had posted', (await host.locator('.board .card').count()) === 22);
check('photo cards show thumbnails', (await host.locator('.board img.thumb').count()) === 10);

// Spotlight
await host.click('.board .card:has-text("Mint & Ploy")');
await host.waitForSelector('.spot-photo img');
await sleep(300);
await shot(host, '08-host-spotlight-photo');
const nat = await host.evaluate(() => (document.querySelector('.spot-photo img') as HTMLImageElement).naturalWidth);
check('spotlight loads the full-size photo', nat > 600, `${nat}px wide`);
await host.keyboard.press('ArrowRight');
await sleep(300);
await shot(host, '09-host-spotlight-text');
check('arrow key moves to the next card', (await host.textContent('.spot-name')) === 'Bo & Cy');
await host.keyboard.press('Escape');
await host.click('button:has-text("Show the nine fixes")');
await host.waitForSelector('.fixes-box');
await shot(host, '10-host-fixes');
check('nine fixes shown', (await host.locator('.nine li').count()) === 9);
await host.click('button:has-text("Back to the wall")');

// Phones after the reveal
await android.waitForSelector('.phone-board .card');
await sleep(800);
await shot(android, '11-android-revealed', true);
check('phones see the whole wall after the reveal', (await android.locator('.phone-board .card').count()) === 22);
await android.click('.phone-board .card.mine');
await android.waitForSelector('.viewer-body img');
await shot(android, '12-android-photo-viewer');
await android.click('.viewer-head button');
check('iPhone sees the wall too', (await ios.locator('.phone-board .card').count()) === 22);
check('android: no sideways scrolling after the reveal', await noHScroll(android));

// 1280×720 projector
await host.setViewportSize({width: 1280, height: 720});
await sleep(300);
await shot(host, '13-host-revealed-1280');

// Save wall
const [dl] = await Promise.all([host.waitForEvent('download'), host.click('button:has-text("Save wall")')]);
const name = dl.suggestedFilename();
await dl.saveAs(`tests/out/${name}`);
const html = readFileSync(`tests/out/${name}`, 'utf8');
check('saved file name', /^Wk13_SpotNine_CA48_\d{4}-\d\d-\d\d\.html$/.test(name), name);
check('saved file embeds the photos and the names', (html.match(/<img src="data:image\/jpeg/g) ?? []).length === 10 && html.includes('Mint &amp; Ploy'));
check('saved file includes the nine fixes', html.includes('Check: all nine mistakes'));

// Finish & delete
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open the wall');
await android.waitForSelector('text=This wall has ended');
check('phones show "This wall has ended"', true);
for (const b of bots) b.stop();

// ════════════════════════════════════════ 2. Wk14 · Describe a Chart (text, chart choice)
await host.setViewportSize({width: 1920, height: 1080});
const code2 = await openWall('TS66', 'Describe a Chart');
for (let i = 0; i < 3; i++) await host.click('.expected button[aria-label="more"]');
check('pairs-in-class stepper', (await host.textContent('.exp-n')) === '3');
await android.goto(`${BASE}?w=${code2}`);
await android.waitForSelector('.chart-card svg');
check('phone shows the four charts before joining', (await android.locator('.chart-card').count()) === 4);
check('the chart for TS66 is marked "your field"', (await android.textContent('.chart-card:has(.badge)'))!.includes('Hotel guests'));
await shot(android, '20-android-charts', true);
await android.fill('#team-name', 'Nok & Fah');
await android.click('button:has-text("Join")');
await android.waitForSelector('.composer');
await android.click('button:has-text("Post to the wall")');
check('chart must be chosen first', (await android.textContent('.composer .error'))!.includes('chart'));
await android.click('.chart-card.pick >> nth=0');
await android.fill('.composer .field >> nth=0 >> textarea', 'Hotel guests fell sharply from 3,400 in February to 1,900 in April.');
await android.fill('.composer .field >> nth=1 >> textarea', 'There was a slight rise in guests in May.');
await shot(android, '21-android-chart-composer', true);
await android.click('button:has-text("Post to the wall")');
await android.waitForSelector('.posted');
await ios.goto(`${BASE}?w=${code2}`);
await ios.fill('#team-name', 'Ice');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.composer');
await ios.click('.chart-card.pick >> nth=3');
await ios.fill('.composer .field >> nth=0 >> textarea', 'The price of jasmine rice rose steadily to 45 baht in March.');
await ios.click('button:has-text("Post to the wall")');
await ios.waitForSelector('.posted');
await host.waitForFunction(() => document.querySelectorAll('.tile.done').length === 2);
await sleep(500);
check('3 expected, 2 posted: still hidden, says it is waiting for 1 more', (await host.locator('.board').count()) === 0 && (await host.textContent('.status-line'))!.includes('waiting for 1 more'));
await shot(host, '22a-host-chart-waiting');
await host.click('button:has-text("Reveal now")');
await host.waitForSelector('.board .card');
await sleep(600);
await shot(host, '22-host-chart-revealed');
check('Reveal now opens the wall', (await host.locator('.board .card').count()) === 2);
check('chart choice shown on the card', (await host.textContent('.board'))!.includes('Hotel guests per month'));
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open the wall');

// ════════════════════════════════════════ 3. Wk13 · Map Your Company Profile (branch boxes)
const code3 = await openWall('BS11', 'Map Your Company Profile');
await android.goto(`${BASE}?w=${code3}`);
await android.fill('#team-name', 'Sunny Tea team');
await android.click('button:has-text("Join")');
await android.waitForSelector('.composer');
const notes = ['Sunny Tea', 'a Thai tea brand', '2021, Chiang Mai', 'Thai tea, green tea, snacks', 'students and tourists aged 18 to 30', '45 baht', 'open 3 branches by 2027'];
for (let i = 0; i < 7; i++) await android.fill(`.composer .field >> nth=${i} >> textarea`, notes[i]);
await shot(android, '30-android-profile-composer', true);
await android.click('button:has-text("Post to the wall")');
await android.waitForSelector('.posted');
await host.click('button:has-text("Close joining")');
await host.waitForSelector('.board .card');
await sleep(500);
await shot(host, '31-host-profile-revealed');
check('profile map card lists the branches', (await host.locator('.board .branch').count()) === 7);
await host.click('.board .card');
await sleep(300);
await shot(host, '32-host-profile-spotlight');
await host.keyboard.press('Escape');
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open the wall');

// ════════════════════════════════════════ 4. Wk14 · What Changed (branch boxes, teal) + reload resume
const code4 = await openWall('EC30', 'What Changed in Your Company?');
await ios.goto(`${BASE}?w=${code4}`);
await ios.fill('#team-name', 'Rice Gang');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.composer');
await ios.fill('.composer .field >> nth=0 >> textarea', 'rose by 20% in May');
await ios.click('button:has-text("Post to the wall")');
await ios.waitForSelector('.posted');
await ios.reload();
await ios.waitForSelector('.posted');
check('iPhone reload: still joined, post still there', (await ios.textContent('.posted'))!.includes('rose by 20% in May'));
await ios.click('button:has-text("Edit / replace")');
await ios.fill('.composer .field >> nth=4 >> textarea', 'a sharp rise in followers');
await ios.click('button:has-text("Save changes")');
await ios.waitForSelector('.posted');
await shot(ios, '40-ios-changed-posted', true);
await host.reload();
await host.waitForSelector('text=Resume wall');
await host.click('text=Resume wall');
await host.waitForSelector('.join-code');
check('projector reload: Resume wall works', (await host.textContent('.join-code'))!.replace(/\s/g, '') === code4);
await shot(host, '41-host-changed-collect');
await host.click('button:has-text("Reveal now")');
await host.waitForSelector('.board .card');
await sleep(400);
await shot(host, '42-host-changed-revealed');
check('edited post shows both branches', (await host.locator('.board .branch').count()) === 2);
await host.click('button:has-text("Finish & delete")');

console.log(`\n${passes} passed, ${failures} failed`);
await cr.close();
await wk.close();
process.exit(failures ? 1 : 0);
