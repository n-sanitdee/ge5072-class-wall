# GE5072 Class Wall

A live class wall for GE5072/GE072 Business English, in the spirit of Padlet / Poll Everywhere. The teacher opens a
wall on the projector; pairs or project groups post from **one phone each**. Posts stay **hidden — only the pair
names show — until every pair has posted**, then the whole wall opens at once. Students don't install anything or
log in.

- Students: **https://n-sanitdee.github.io/ge5072-class-wall/** (they scan the QR code on the wall screen)
- Teacher (projector): **https://n-sanitdee.github.io/ge5072-class-wall/#host**

**For the slide (Thai + English):** no link is needed on the slide — the QR code is on the wall screen.

> Scan the QR code on the screen → type your pair name (both nicknames) → post one answer per pair. Posts stay
> hidden until every pair has posted. · สแกน QR บนจอ → ตั้งชื่อคู่ (ชื่อเล่นทั้งสองคน) → ส่งคำตอบคู่ละ 1 โพสต์
> คำตอบจะซ่อนไว้จนกว่าทุกคู่จะส่ง

---

## Built-in activities

| Week | Activity | Who | Post | On the phone |
|---|---|---|---|---|
| 13 | Think-Pair-Share · **Spot the Nine Mistakes** | pairs | marked screenshot and/or typed fixes | the Sunny Tea passage (errors intact) to screenshot |
| 13 | Brainstorm · **Map Your Company Profile** | project groups | one box per sub-topic (7) | the sentence frame for each branch |
| 14 | Think-Pair-Share · **Describe a Chart** | pairs | chart choice + best sentence (+ up to 2 more) | the four invented field charts; the section's own field is marked |
| 14 | Brainstorm · **What Changed in Your Company?** | project groups | one box per branch (6) | what to think about + an example per branch |
| any | **Your own question** | pairs | text (photo optional) | the question you type |

Texts and chart data are copied from the Week 13/14 decks (`Teaching/_slide_toolkit/build_wk13.py`,
`build_wk14.py`) into [`src/lib/presets.ts`](src/lib/presets.ts) — change both together.

## Host guide

**Before class:** open the teacher link on the projector laptop (bookmark it). Chrome, Edge or Safari; ⛶ = full
screen.

1. **Pick your section and the activity**, then **Open the wall**. The screen shows the QR code, the web address
   and a 6-digit wall code.
2. **Students scan and join.** Each pair types its pair name; each group its group name. Names appear as tiles:
   dashed = still writing, coloured ✓ = posted. **Nobody — not even the projector — sees any post yet.**
   Click a tile to remove a duplicate (the same pair on two phones) or a pair that left.
3. **Let the wall open by itself.** Either set **Pairs in class** (− / +) or press **Close joining** once everyone is
   in: the wall opens the moment every pair on the screen has posted. **Reveal now** opens it at any time (for
   stragglers). Pairs can change their post until the wall opens; after that nothing can change.
4. **Discuss.** The wall is a grid of cards. Click a card for the big view (click a photo to zoom; ← / → or a
   presentation clicker moves between cards; Esc closes). Week 13 Spot the Nine Mistakes: **Show the nine fixes**.
   **QR** shows the code again so students can look at the wall on their phones.
5. **Save wall** downloads one HTML file with every post and photo inside, e.g.
   `Wk13_SpotNine_CA48_2026-11-04.html` — KPI teaching-technique evidence
   (`Performance_Evaluation_2026/01_Teaching/05_Teaching_Techniques/`).
6. **Finish & delete** deletes the wall's data; phones show "This wall has ended". Then open the next wall.

**If the projector browser reloads:** open the teacher link again on the same laptop and press **Resume wall**.

**Data:** a pair name (nicknames; the join screen refuses anything that looks like a student ID) and what the pair
posts. Nothing else. A wall is deleted at **Finish & delete**, or automatically 3 hours after it was opened.

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
- **Hidden really is hidden** ([`database.rules.json`](database.rules.json)): before the reveal only the host can
  list teams, posts, thumbnails or photos. A pair's id is a 20-character random secret kept on its phone (as in
  Hakoot), so it can read and change only its own post. After the reveal everyone with the code can read the wall
  and no post can change; the reveal can't be undone. Only the host that opened a wall can change or delete it.
- **One rules document:** the database has a single set of rules for Hakoot and the wall together. This file is
  the same document as `ge5072-live-quiz/database.rules.json`; keep the two identical and publish it in the
  Firebase console (Realtime Database → Rules) after any change.
- **Clean-up:** the host deletes a wall at "Finish & delete". [`.github/workflows/cleanup.yml`](.github/workflows/cleanup.yml)
  runs every hour (minute 47) and deletes walls older than 3 hours.

## Development

```bash
npm install
npm run emulators      # local Firebase emulators on 9010/9109 (needs Java 21+); keep running
npm run dev:emu        # app on http://localhost:5174 (students) and http://localhost:5174/#host
node tests/rules-test.ts                 # security rules (71 checks)
node tests/load-test.ts --pairs 30       # 30 pairs posting photos on one wall
node tests/browser-test.ts               # projector + Android + iPhone screens, screenshots in tests/out/screens
node tests/rules-test.ts --live          # the rules checks against the real project
node tests/load-test.ts --pairs 30 --live
```

The emulator ports differ from Hakoot's (9000/9099), so both projects' emulators can run at once.
