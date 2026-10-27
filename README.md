# Ladpet — the GE5072 class wall

**Ladpet** (Mew's name for it, 22 Oct 2026; the repo keeps its first name, `ge5072-class-wall`) is a live class wall for GE5072/GE072 Business English, in the spirit of Padlet / Poll Everywhere. The teacher opens a
wall on the projector. **Participants first** (Mew, 27 Oct 2026): the first phone of a pair / group types everyone's
nicknames; the others tap their own name under the group. Every member then writes the **same post from their own
phone** (changes save as they type and merge, Google-Docs style), presses **Post on Ladpet**, and can keep editing
afterwards. Answers have **no length limit**. On the projector every post is a **tile and all tiles fit on one screen**
(text shrinks to fit; photos get the biggest tiles). Posts stay **hidden — only the names show — until everyone has
posted** on the Think-Pair-Share / Brainstorm activities; the custom wall shows each post as soon as it is posted.
Students don't install anything or log in.

- Students: **https://n-sanitdee.github.io/ge5072-class-wall/** (they scan the QR code on the wall screen)
- Teacher (projector): **https://n-sanitdee.github.io/ge5072-class-wall/#host**

**For the slide (Thai + English):** no link is needed on the slide — the QR code is on the wall screen.

> Scan the Ladpet QR → type everyone's nicknames (or tap your name if your group is already in) → write together →
> Post on Ladpet. · สแกน QR ของ Ladpet → ใส่ชื่อเล่นทุกคนในกลุ่ม (หรือแตะชื่อตัวเองถ้ากลุ่มมีแล้ว) → เขียนด้วยกัน → โพสต์

---

## Built-in activities

| Week | Activity | Who | Post | On the phone |
|---|---|---|---|---|
| 13 | **Week 13 · Think-Pair-Share: Spot the Nine Mistakes** | pairs | marked screenshot and/or typed fixes | the Sunny Tea passage (errors intact) to screenshot |
| 13 | **Week 13 · Brainstorm: Map Your Company Profile** | project groups | the blanks of each sub-topic's sentence frame (7) | the frames; the finished sentences build up into one profile paragraph, which is what the wall shows |
| 14 | **Week 14 · Think-Pair-Share: Describe a Chart** | pairs | best sentence (+ up to 2 more) | page 1 = name only; page 2 = the chart Ladpet gave them (the four charts in turn) |
| 14 | **Week 14 · Brainstorm: What Changed in Your Company?** | project groups | one trend sentence per branch (6), built by tapping: what changed → verb (the form's 11, past) → adverb (the form's 7) → by / to / from … to + their number → when | the finished sentence as they tap |
| any | **Your own question** | anyone | text (photo optional) | the question you type; **posts show on the wall straight away** |

Texts and chart data are copied from the Week 13/14 decks (`Teaching/_slide_toolkit/build_wk13.py`,
`build_wk14.py`) into [`src/lib/presets.ts`](src/lib/presets.ts) — change both together.

## Host guide

**Before class:** open the teacher link on the projector laptop (bookmark it). Chrome, Edge or Safari; ⛶ = full
screen.

1. **Pick your section and the activity**, then **Open Ladpet**. The screen shows the QR code, the web address
   and a 6-digit wall code.
2. **Students scan and join.** The first phone of each pair / group types the members' nicknames (group name
   optional — e.g. the company); the others choose **My group is already here** and tap their name (or **+ me**).
   Groups appear as tiles: dashed = still writing (a draft does not count), coloured ✓ = posted (Describe a Chart also shows which chart each name got). **Nobody —
   not even the projector — sees any post yet.** Click a tile to remove a duplicate or someone who left.
3. **Let the wall open by itself.** Either set **Expected posts** (− / +) or press **Close joining** once everyone is
   in: the wall opens the moment every name on the screen has posted. **Reveal now** opens it at any time (for
   stragglers). Every member can keep editing their group's post — also after the wall opens — until you press
   Finish & delete (edits show on the projector at once).
   *Custom wall:* there is no hidden phase — each post appears when the group presses Post; the QR stays beside the
   wall until you hide it (hide it to give the tiles more room).
4. **Discuss.** Every post is a tile and they all fit on the screen at once — the layout gives the longest text and
   the photos the most room; a post too long to fit even at the smallest size fades out at the bottom. Click a tile
   for the big view (click a photo to zoom; ← / → or a
   presentation clicker moves between cards; Esc closes). Week 13 Spot the Nine Mistakes: **Show the nine fixes**.
   Describe a Chart: one column per chart, each sentence under its chart.
   **QR** shows the code again so students can look at the wall on their phones.
5. **Save the Ladpet** downloads one HTML file with every post and photo inside, e.g.
   `Ladpet_Week13_Think-Pair-Share_Spot-the-Nine-Mistakes_CA48_2026-11-04.html` — KPI teaching-technique evidence
   (`Performance_Evaluation_2026/01_Teaching/05_Teaching_Techniques/`).
6. **Finish & delete** deletes the wall's data; phones show "This wall has ended". Then open the next wall.

**If the projector browser reloads:** open the teacher link again on the same laptop and press **Resume wall**.

**Data:** the group name and the members' nicknames (the join screen refuses anything that looks like a student ID)
and what the group posts. Anyone with the wall code can see the group list (so members can tap their name); posts
stay closed until the wall opens. Nothing else. A wall is deleted at **Finish & delete**, or automatically 3 hours after it was opened.

## Limits

- Shares the Firebase project of the GE5072 Live Quiz (Hakoot): **100 simultaneous connections** in total — one
  per phone that has the wall open, plus the projector. A class of 56 is fine; don't run a wall and a Hakoot game
  in two big classes at the same moment.
- Photos are stored in the database itself (the free Spark plan has no file storage): the phone shrinks each
  photo to ≤ 1600 px (about 250 KB) plus a ~55 KB thumbnail. A photo wall for 56 phones downloads about 75 MB
  in total (10 GB a month are free); text walls are tiny.
- iPhones turn HEIC photos into JPEG when posting; Android Chrome cannot read HEIC — a screenshot (PNG/JPG) always
  works.

---

## How it works

- **Static site** (React + Vite) on GitHub Pages, deployed by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
  on every push to `main`.
- **Firebase Realtime Database** (project `ge5072-live-quiz`, Singapore, Spark plan), under `walls/<code>/…` and
  `wallIndex/<code>`:
  `meta` (host uid, created), `pub` (title, activity, section, revealed/locked, the name list with posted ✓ — no
  ids), `teams/<id>` (name), `names/<key>` (keeps names unique), `kicked/<id>`, `posts/<id>` (text / branch
  boxes / chart choice), `thumbs/<id>` and `photos/<id>` (JPEG data URLs, apart so lists never pull full photos).
- **Guided posts:** a post stores each finished sentence in `fields.f<i>` (what everyone sees) and the raw inputs in
  `fields.b<i>` (JSON, to refill the form when editing) — see [`src/lib/compose.ts`](src/lib/compose.ts). Describe a
  Chart: the host writes `assign/<id>` (the chart fewest names have, so the four stay even), and a post's chart
  must match it.
- **Hidden really is hidden** ([`database.rules.json`](database.rules.json)): before the reveal only the host can
  list teams, posts, thumbnails or photos. A pair's id is a 20-character random secret kept on its phone (as in
  Hakoot), so it can read and change only its own post. After the reveal everyone with the code can read the wall
  and no post can change; the reveal can't be undone. A custom wall is `live`: readable from the start, posts stay
  editable until it ends (the flag can't be switched on or off later). Only the host that opened a wall can change
  or delete it.
- **One rules document:** the database has a single set of rules for Hakoot and the wall together. This file is
  the same document as `ge5072-live-quiz/database.rules.json`. Change the wall's part in
  [`scripts/merge-rules.py`](scripts/merge-rules.py) and run it: it keeps Hakoot's part as it is and writes the
  merged document to both repos. Then publish it in the Firebase console (Realtime Database → Rules).
- **Clean-up:** the host deletes a wall at "Finish & delete". [`.github/workflows/cleanup.yml`](.github/workflows/cleanup.yml)
  runs every hour (minute 47) and deletes walls older than 3 hours.

## Development

```bash
npm install
npm run emulators      # local Firebase emulators on 9010/9109 (needs Java 21+); keep running
npm run dev:emu        # app on http://localhost:5174 (students) and http://localhost:5174/#host
python3 scripts/merge-rules.py           # after changing the wall's rules: rewrite both repos' database.rules.json
node tests/rules-test.ts                 # security rules (89 checks)
node tests/load-test.ts --pairs 30       # 30 pairs posting photos on one wall
node tests/browser-test.ts               # projector + Android + iPhone screens, screenshots in tests/out/screens
node tests/rules-test.ts --live          # the rules checks against the real project
node tests/load-test.ts --pairs 30 --live
```

The emulator ports differ from Hakoot's (9000/9099), so both projects' emulators can run at once.
