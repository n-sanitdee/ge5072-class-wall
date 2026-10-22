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
  await host.waitForSelector('text=Open Ladpet');
  await host.click(`.section-btn:has-text("${section}")`);
  await host.click(`.preset-card:has-text("${title}")`);
  await shot(host, `${title.replace(/\W+/g, '_')}-00-setup`);
  await host.click('text=Open Ladpet');
  await host.waitForSelector('.join-code');
  return (await host.textContent('.join-code'))!.replace(/\s/g, '');
}

// ════════════════════════════════════════ 1. Wk13 · Spot the Nine Mistakes (photo wall)
const code = await openWall('CA48', 'Spot the Nine Mistakes');
check('photo wall created', /^\d{6}$/.test(code), code);
check('projector header: Ladpet + "Week 13 · Think-Pair-Share: Spot the Nine Mistakes"', (await host.textContent('.wall-bar'))!.includes('Week 13 · Think-Pair-Share: Spot the Nine Mistakes') && (await host.textContent('.wall-bar .kicker'))!.includes('Ladpet'));
await shot(host, '01-host-collect-empty');

// Android: open the wall from the QR link, screenshot the passage, join, post the screenshot
await android.goto(`${BASE}?w=${code}`);
await android.waitForSelector('.passage');
check('phone header shows the week + activity title', (await android.textContent('.phone-head h1'))!.includes('Week 13 · Think-Pair-Share: Spot the Nine Mistakes'));
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
await android.click('button:has-text("Post on Ladpet")');
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
await ios.click('button:has-text("Post on Ladpet")');
check('iPhone: an empty post is refused', (await ios.textContent('.composer .error'))!.includes('photo'));
await ios.fill('.composer textarea', '1. Sunny Tea is a Thai tea brand.\n2. brand. It\n3. founded');
await ios.click('button:has-text("Post on Ladpet")');
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
const [dl] = await Promise.all([host.waitForEvent('download'), host.click('button:has-text("Save the Ladpet")')]);
const name = dl.suggestedFilename();
await dl.saveAs(`tests/out/${name}`);
const html = readFileSync(`tests/out/${name}`, 'utf8');
check('saved file name has the app, week, activity, title and section', /^Ladpet_Week13_Think-Pair-Share_Spot-the-Nine-Mistakes_CA48_\d{4}-\d\d-\d\d\.html$/.test(name), name);
check('saved file is titled with the week and activity', html.includes('Week 13 · Think-Pair-Share:'));
check('saved file embeds the photos and the names', (html.match(/<img src="data:image\/jpeg/g) ?? []).length === 10 && html.includes('Mint &amp; Ploy'));
check('saved file includes the nine fixes', html.includes('Check: all nine mistakes'));

// Finish & delete
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open Ladpet');
await android.waitForSelector('text=This wall has ended');
check('phones show "This wall has ended"', true);
for (const b of bots) b.stop();

// ════════════════════════════════════════ 2. Wk14 · Describe a Chart (Ladpet gives each name a chart)
await host.setViewportSize({width: 1920, height: 1080});
const code2 = await openWall('TS66', 'Describe a Chart');
for (let i = 0; i < 3; i++) await host.click('.expected button[aria-label="more"]');
check('expected-posts stepper', (await host.textContent('.exp-n')) === '3');
await android.goto(`${BASE}?w=${code2}`);
await android.waitForSelector('#team-name');
check('page 1 asks for a name only (no charts yet)', (await android.locator('.chart-card').count()) === 0);
check('the join box says "Your name"', (await android.textContent('.join-form label'))!.includes('Your name'));
await shot(android, '20-android-chart-name', true);
await android.fill('#team-name', 'Nok & Fah');
await android.click('button:has-text("Join")');
await android.waitForSelector('.my-chart .chart-card');
check('page 2 shows the chart Ladpet gave (chart 1)', (await android.textContent('.my-chart'))!.includes('Your chart · 1 of 4') && (await android.textContent('.my-chart'))!.includes('Hotel guests'));
check('no "your field" anywhere', !(await android.textContent('body'))!.toLowerCase().includes('your field'));
await android.click('button:has-text("Post on Ladpet")');
check('best sentence required', (await android.textContent('.composer .error'))!.includes('best sentence'));
await android.fill('.composer .field >> nth=0 >> textarea', 'Hotel guests fell sharply from 3,400 in February to 1,900 in April.');
await android.fill('.composer .field >> nth=1 >> textarea', 'There was a slight rise in guests in May.');
await shot(android, '21-android-chart-composer', true);
await android.click('button:has-text("Post on Ladpet")');
await android.waitForSelector('.posted');
await ios.goto(`${BASE}?w=${code2}`);
await ios.fill('#team-name', 'Ice');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.my-chart .chart-card');
check('the second name gets chart 2 (followers)', (await ios.textContent('.my-chart'))!.includes('Your chart · 2 of 4') && (await ios.textContent('.my-chart'))!.includes('TikTok followers'));
await ios.fill('.composer .field >> nth=0 >> textarea', 'TikTok followers grew steadily to 16,000 in May.');
await ios.click('button:has-text("Post on Ladpet")');
await ios.waitForSelector('.posted');
await host.waitForFunction(() => document.querySelectorAll('.tile.done').length === 2);
check('projector tiles show the chart each name got', (await host.textContent('.tiles'))!.includes('chart 1') && (await host.textContent('.tiles'))!.includes('chart 2'));
await sleep(500);
check('3 expected, 2 posted: still hidden, waiting for 1 more', (await host.locator('.chart-board, .board').count()) === 0 && (await host.textContent('.status-line'))!.includes('waiting for 1 more'));
await shot(host, '22a-host-chart-waiting');
await host.click('button:has-text("Reveal now")');
await host.waitForSelector('.chart-board .card');
await sleep(600);
await shot(host, '22-host-chart-revealed');
check('revealed: one column per chart, each card under its chart', (await host.locator('.chart-col').count()) === 4 && (await host.locator('.chart-col >> nth=0 >> .card').count()) === 1 && (await host.locator('.chart-col >> nth=1 >> .card').count()) === 1);
await host.click('.chart-col >> nth=1 >> .card');
await host.waitForSelector('.spot-box .chart-card');
await sleep(300);
await shot(host, '23-host-chart-spotlight');
check('the big view shows the chart with the sentence', (await host.textContent('.spot-box'))!.includes('TikTok followers'));
await host.keyboard.press('Escape');
await android.waitForSelector('.phone-board .chart-group');
await shot(android, '24-android-chart-revealed', true);
check('phones: posts grouped under their chart', (await android.locator('.phone-board .chart-group').count()) === 2);
const [dl2] = await Promise.all([host.waitForEvent('download'), host.click('button:has-text("Save the Ladpet")')]);
await dl2.saveAs(`tests/out/${dl2.suggestedFilename()}`);
const html2 = readFileSync(`tests/out/${dl2.suggestedFilename()}`, 'utf8');
check('saved chart file: charts drawn, sentences under them', dl2.suggestedFilename().startsWith('Ladpet_Week14_Think-Pair-Share_Describe-a-Chart_TS66_') && (html2.match(/<svg/g) ?? []).length === 2 && html2.includes('fell sharply from 3,400'));
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open Ladpet');

// ════════════════════════════════════════ 3. Wk13 · Map Your Company Profile (fill the blanks → one paragraph)
const code3 = await openWall('BS11', 'Map Your Company Profile');
await android.goto(`${BASE}?w=${code3}`);
await android.fill('#team-name', 'Sunny Tea team');
await android.click('button:has-text("Join")');
await android.waitForSelector('.composer .frame-card');
const blank = (branch: number, k: number) => `.frame-card >> nth=${branch} >> input.blank >> nth=${k}`;
await android.fill(blank(0, 0), 'Sunny Tea');
// branch 2 starts with {@name}: left empty, it uses the company name
await android.fill(blank(1, 1), 'a Thai tea brand');
await android.fill(blank(2, 0), '2021');
await android.fill(blank(2, 1), 'Chiang Mai');
await android.fill(blank(3, 0), 'Thai teas and snacks');
await android.fill(blank(3, 1), 'local tea leaves');
await android.fill(blank(4, 0), 'students and tourists');
await android.fill(blank(4, 1), '18');
await android.fill(blank(4, 2), '30');
await android.fill(blank(5, 0), '45');
// branch 7 left half-done on purpose: no sentence for it
const PARA =
  'Our company is called Sunny Tea. Sunny Tea is a Thai tea brand. It was founded in 2021 in Chiang Mai. It sells Thai teas and snacks. ' +
  'They are made from local tea leaves. Its main customers are students and tourists aged 18 to 30. Prices start at 45 baht.';
check('live preview builds the paragraph', (await android.textContent('.paragraph-preview p'))!.trim() === PARA, await android.textContent('.paragraph-preview p') ?? '');
await shot(android, '30-android-profile-composer', true);
await android.click('button:has-text("Post on Ladpet")');
await android.waitForSelector('.posted');
check('the group\'s own screen shows the paragraph', (await android.textContent('.posted .paragraph'))!.trim() === PARA);
await shot(android, '30b-android-profile-posted', true);
await host.click('button:has-text("Close joining")');
await host.waitForSelector('.board .card');
await sleep(500);
await shot(host, '31-host-profile-revealed');
check('revealed card shows one paragraph of full sentences', (await host.textContent('.board .card .paragraph'))!.trim() === PARA);
await host.click('.board .card');
await sleep(300);
await shot(host, '32-host-profile-spotlight');
await host.keyboard.press('Escape');
await android.reload();
await android.waitForSelector('.phone-board .paragraph');
check('phones after the reveal: the paragraph too', (await android.textContent('.phone-board .paragraph'))!.trim() === PARA);
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open Ladpet');

// ════════════════════════════════════════ 4. Wk14 · What Changed (tap-to-build sentences) + reload + edit
const code4 = await openWall('EC30', 'What Changed in Your Company?');
await ios.goto(`${BASE}?w=${code4}`);
await ios.fill('#team-name', 'Rice Gang');
await ios.click('button:has-text("Join")');
await ios.waitForSelector('.build-card.open');
await ios.click('.build-card.open .chip-btn >> text="Sales"');
await ios.click('.build-card.open .chip-btn:has-text("rose")');
await ios.click('.build-card.open .chip-btn:text-is("sharply")');
await ios.click('.build-card.open .chip-btn:text-is("by …")');
await ios.fill('.build-card.open .amount-row input', '20%');
await ios.click('.build-card.open .chip-btn:text-is("in May")');
check('sentence 1 builds: "Sales rose sharply by 20% in May."', (await ios.textContent('.build-card.open .sentence-preview'))!.trim() === 'Sales rose sharply by 20% in May.');
await shot(ios, '40a-ios-builder-1', true);
await ios.click('.build-card.open button:has-text("Next branch")');
await ios.click('.build-card.open .chip-btn:text-is("The number of customers")');
await ios.click('.build-card.open .chip-btn:has-text("grew")');
await ios.click('.build-card.open .chip-btn:text-is("steadily")');
await ios.click('.build-card.open .chip-btn:text-is("from … to …")');
await ios.fill('.build-card.open .amount-row input >> nth=0', '800');
check('an unfinished branch blocks posting', await (async () => {
  await ios.click('button:has-text("Post on Ladpet")');
  return (await ios.textContent('.composer .error'))!.includes('Customers');
})());
await ios.fill('.build-card.open .amount-row input >> nth=1', '1,200');
await ios.click('.build-card.open .chip-btn:text-is("last year")');
check('sentence 2: "The number of customers grew steadily from 800 to 1,200 last year."', (await ios.textContent('.build-card.open .sentence-preview'))!.trim() === 'The number of customers grew steadily from 800 to 1,200 last year.');
// Online: remained steady → no adverbs offered, "at …" only
await ios.click('.build-card >> nth=4 >> .build-head');
await ios.click('.build-card.open .chip-btn:text-is("The number of followers")');
await ios.click('.build-card.open .chip-btn:has-text("remained steady")');
check('"remained steady" offers no adverbs', (await ios.locator('.build-card.open .chip-btn:text-is("sharply")').count()) === 0);
check('"remained steady" takes "at …", not "by …"', (await ios.locator('.build-card.open .chip-btn:text-is("at …")').count()) === 1 && (await ios.locator('.build-card.open .chip-btn:text-is("by …")').count()) === 0);
await ios.click('.build-card.open .chip-btn:text-is("at …")');
await ios.fill('.build-card.open .amount-row input', '12,000');
check('sentence 3: "The number of followers remained steady at 12,000."', (await ios.textContent('.build-card.open .sentence-preview'))!.trim() === 'The number of followers remained steady at 12,000.');
await shot(ios, '40b-ios-builder-3', true);
await ios.click('button:has-text("Post on Ladpet")');
await ios.waitForSelector('.posted');
await ios.reload();
await ios.waitForSelector('.posted');
check('iPhone reload: still joined, sentences still there', (await ios.textContent('.posted'))!.includes('Sales rose sharply by 20% in May.'));
await ios.click('button:has-text("Edit / replace")');
await ios.waitForSelector('.build-card');
check('editing refills the builder', (await ios.textContent('.build-card >> nth=0'))!.includes('Sales rose sharply by 20% in May.'));
await ios.click('.build-card >> nth=3 >> .build-head');
await ios.click('.build-card.open .chip-btn:text-is("Rent")');
await ios.click('.build-card.open .chip-btn:has-text("fell")');
await ios.click('.build-card.open .chip-btn:text-is("to …")');
await ios.fill('.build-card.open .amount-row input', '40,000 baht');
await ios.click('.build-card.open .chip-btn:text-is("in 2025")');
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
const board4 = (await host.textContent('.board'))!;
check('revealed: four full sentences', ['Sales rose sharply by 20% in May.', 'The number of customers grew steadily from 800 to 1,200 last year.', 'Rent fell to 40,000 baht in 2025.', 'The number of followers remained steady at 12,000.'].every((x) => board4.includes(x)));
await host.click('button:has-text("Finish & delete")');
await host.waitForSelector('text=Open Ladpet');

// ════════════════════════════════════════ 5. Custom wall: posts show straight away
await host.goto(`${BASE}#host`);
await host.click('.section-btn:has-text("AC21")');
await host.click('.preset-card:has-text("Your own question")');
await host.fill('.custom input', 'Best slogan for the UTCC café');
await host.fill('.custom textarea', 'Write one slogan for the UTCC Coffee Corner.');
await host.click('text=Open Ladpet');
await host.waitForSelector('.join-code');
const code5 = (await host.textContent('.join-code'))!.replace(/\s/g, '');
await android.goto(`${BASE}?w=${code5}`);
await android.waitForSelector('#team-name');
check('custom wall join hint: nickname only, no pair wording', !(await android.textContent('.join-form'))!.toLowerCase().includes('pair'));
await android.fill('#team-name', 'Mint');
await android.click('button:has-text("Join")');
await android.fill('.composer textarea', 'Coffee that wakes up your ideas.');
await android.click('button:has-text("Post on Ladpet")');
await android.waitForSelector('.posted');
check('phone: "it\'s on the wall now"', (await android.textContent('.posted'))!.includes('on the wall now'));
await host.waitForSelector('.live .board .card');
check('projector shows the post at once (no reveal step)', (await host.textContent('.live .board'))!.includes('Coffee that wakes up your ideas.'));
await ios.goto(`${BASE}?w=${code5}`);
await ios.waitForSelector('.live-wall .card');
check('a new phone sees the wall before joining', (await ios.textContent('.live-wall'))!.includes('Coffee that wakes up'));
await ios.fill('#team-name', 'Bo');
await ios.click('button:has-text("Join")');
await ios.fill('.composer textarea', 'Small cup, big ideas.');
await ios.click('button:has-text("Post on Ladpet")');
await ios.waitForSelector('.posted');
await android.waitForFunction(() => document.querySelectorAll('.live-wall .card').length === 2);
check('phones see each other\'s posts live', (await android.textContent('.live-wall'))!.includes('Small cup, big ideas.'));
await android.click('button:has-text("Edit / replace")');
await android.fill('.composer textarea', 'Coffee that wakes up your best ideas.');
await android.click('button:has-text("Save changes")');
await host.waitForFunction(() => document.querySelector('.live .board')!.textContent!.includes('best ideas'));
check('an edit shows on the projector at once', true);
await shot(host, '50-host-live-wall');
await shot(android, '51-android-live-wall', true);
check('android: no sideways scrolling on the live wall', await noHScroll(android));
await host.click('button:has-text("Finish & delete")');

console.log(`\n${passes} passed, ${failures} failed`);
await cr.close();
await wk.close();
process.exit(failures ? 1 : 0);
