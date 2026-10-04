# Workout Timer

A home dumbbell training plan that adjusts as you get stronger, plus a spoken interval timer.

Open the app and **Today** shows what to do. On a training day that's a workout, with every
exercise, weight and rep target listed and a START button. On other days it's a short back care
session or a rest day. You follow along set by set, log reps with big +/− buttons, and the app
works out next session's weights. Everything is stored in your Notion **Health Tracker**.

## The programme

Built for a beginner training at home with adjustable dumbbells, aiming at general fitness, with a
lower back that needs care.

| Day | What |
| --- | --- |
| Mon · Wed · Fri | Strength — Workout A and Workout B alternate (A, B, A, then B, A, B…) |
| Tue · Thu · Sat | Back care — 8 minutes of gentle core and mobility work, plus a walk if you can |
| Sun | Rest |

| Workout A — Squat · Press · Row | Workout B — Hinge · Lunge · Press |
| --- | --- |
| Goblet squat 3 × 10–15 | Romanian deadlift 3 × 10–15 |
| Floor press 3 × 10–15 | Split squat 3 × 8–12 per leg |
| One-arm row 3 × 10–15 per side | One-arm shoulder press 3 × 10–15 per side |
| Glute bridge 2 × 12–20 | Bird dog 2 × 6–10 per side |
| Dead bug 2 × 6–10 per side | Side plank 2 × 20–45 s per side |

- Each workout starts with an optional 4-minute warm-up, run by the spoken timer.
- Beginners do 2 sets of everything for the first two weeks, then the full sets.
- Rest between sets is 90 s on the big lifts and 45–60 s on the rest. A spoken countdown says
  what's next, including the weight.
- Days are set on the **Plan settings** screen. A missed workout is never skipped: the next
  session simply carries on from it, and the day after a miss offers to catch it up.
- With a bench, the floor press becomes a bench press. With one handle, the two-dumbbell moves
  switch to one-dumbbell versions. Progress is kept either way.

## How the weights go up

Double progression: earn the reps, then the weight.

1. **First session with a lift:** pick a weight you could do about 15 times and log what you
   managed. If you landed in the range, that's your working weight. If not, the app estimates
   a better one and rounds it down to what your plates can make.
2. **Every set at the top of the range** (e.g. 15, 15, 15): next time moves to the next
   dumbbell up, at least ~5% heavier, and reps start again at the bottom of the range.
3. **In the range:** same weight, and the app pre-fills last time's reps plus one to beat.
4. **Well short of the range twice in a row:** down one step (~10%) to rebuild.
5. **"Too hard":** no increase that session, whatever the reps.
6. **Big jumps:** if the next dumbbell is more than 20% heavier (e.g. 2 kg → 4.5 kg), you first
   earn extra reps (+3, then +6) before moving up.
7. **Timed holds** add 5 s once every set is held, up to their ceiling.
8. **Back check:** after each exercise you say how your lower back felt. Mild discomfort holds
   the weight; pain drops it a step straight away.

The rules live in `lib/training/progression.ts`. The phone and the server use the same code, so
the summary screen shows exactly what Notion will record.

## Your dumbbells

Spin-lock dumbbells can only make the weights their plates add up to, with the same plates on
both ends. On **Plan settings** you enter:

- your handles (1 or 2) and what an empty one weighs
- every plate you own
- how many plates fit on each end

From those, the app lists every weight you can make. During a workout the weight buttons step
through only those, and show what to load, e.g. *each end: 2.5 + 1.25*.

Two matching dumbbells share the plates between them, so a single dumbbell (goblet squat,
one-arm moves) can go heavier than a pair.

## Notion setup

The app talks to Notion with an **internal integration token**. This is the one step that
cannot be automated — Notion only issues these through its own UI.

1. Go to <https://www.notion.so/my-integrations> → **New integration**.
   - Type: **Internal**
   - Associated workspace: *Faisal Merfin's*
   - Capabilities: **Read content**, **Update content**, **Insert content**
2. Copy the **Internal Integration Secret** (starts with `ntn_`).
3. Open the **Health Tracker** page in Notion → `⋯` menu → **Connections** → **Connect to**
   → pick your new integration. Connecting the parent page grants access to every database
   underneath it, including the ones the training plan creates.
4. Copy `.env.example` to `.env.local` and paste the token in.

The database IDs in `.env.example` are already filled in for this workspace:

| Variable | Database |
| --- | --- |
| `NOTION_ROUTINES_DB` | Workout Routines |
| `NOTION_EXERCISES_DB` | Routine Exercises |
| `NOTION_LOG_DB` | Workout Log (existing) |

> If step 3 is missed, every request fails with `Could not find database` — that error means
> the integration exists but has not been granted access to the page.

### Training databases

The first time you tap **Create my plan**, the app adds three databases to the Health Tracker
page, next to the Workout Log. It finds them by name after that, so no new environment variables
are needed. It never deletes, renames or changes existing columns. If a column it needs is
missing it adds it; if one has the wrong type it stops and says which.

**Training Programme**: one row, your plan. `Start Date`, `Training Days`, `Back Care Days`,
`Handles`, `Handle Weight (kg)`, `Plates` (e.g. `1.25×4, 1.5×4, 2×4`), `Plates Per Side`,
`Bench`, `Level`, `Back Pain`, `Active`.

**Programme Exercises**: one row per exercise in Workout A or B, holding its current target.
`Exercise ID`, `Workout`, `Order`, `Sets`, `Rep Min`, `Rep Max`, `Seconds`, `Max Seconds`,
`Rest (s)`, `Weight (kg)`, `Stretch`, `Stalls`, `Last Session`, `Last Done`, `Archived`.

- `Weight (kg)` is per dumbbell. Empty means "find it next session" and 0 means bodyweight.
- You can edit weights, rep ranges or rest here and the app follows.
- Tick `Archived` to drop an exercise without deleting it.

**Lift Log**: one row per exercise per workout. `Date`, `Workout`, `Exercise ID`,
`Weight (kg)`, `Sets`, `Reps` (e.g. `12, 11, 10` or `20 s, 18 s`), `Total Reps`,
`Total Seconds`, `Volume (kg)`, `Effort`, `Back`, `Result` (Set / Up / Hold / Down / Stretch),
`Next` (what changes next time), `Note`, `Session`.

**Workout Log** also gets one summary row per strength workout, alongside your existing
entries:

| Property | Value |
| --- | --- |
| `Name` | `2026-10-05 - Dumbbell Workout A` |
| `Exercise` | `Dumbbell Workout A` |
| `Reps` | Total reps |
| `Notes` | `Goblet squat 7 kg × 15/14 · Floor press 5 kg × 12/11 · … — 32 min · ref 1a2b3c4d` |

Timed sessions (the spoken timer, and back care) keep writing their single row as before:
`Duration (s)` holds the work seconds, and `Reps` and `Level` stay empty.

## Passcode lock

By default anyone with the app's URL can use it, including reading and changing your Notion data
through it. Set `APP_PASSCODE` (in `.env.local` and on Vercel) to require a passcode once per
device:

- Pick something longer than a 4-digit PIN; each wrong guess is slowed down.
- The phone stays unlocked through an `HttpOnly` cookie.
- Changing the passcode, or `APP_SECRET`, signs every device out.

## The spoken timer

The original interval timer is still there under **Timer**. Its START button runs a timed
routine, announces each exercise aloud, and runs `5s prep → N seconds work → 5s rest`.

| Phase | Length | Spoken |
| --- | --- | --- |
| Prep | 5s (fixed) | "Get ready. *Pushups*." |
| Work | per-exercise, customisable | "*Pushups*. Go." |
| Rest | 5s (fixed) | "Rest." |

The trailing rest is skipped after the final exercise. Three short beeps count down the
last 3 seconds of every phase.

Pause at any time by tapping anywhere on the timer, or with the **Pause** button.
`Space` toggles pause, `←`/`→` step between phases, `Esc` ends the session.
The screen is kept awake for the whole workout via the Wake Lock API.

Routines live in **Workout Routines** (`Name`, `Default`, `Last Used`, `Archived`) and
**Routine Exercises** (`Name`, `Routine`, `Order`, `Duration (s)`), and can be edited in the app
or in Notion. The warm-up and back care routines are built into the app instead, because each
move links to its exercise guide.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

To work without a Notion workspace, run the fake Notion in one terminal and point the app at it:

```bash
npm run notion:fake
```

```bash
NOTION_API_BASE=http://127.0.0.1:4010/v1 NOTION_TOKEN=fake \
NOTION_LOG_DB=3570c782-4a59-8141-8842-fce74812fd2e \
NOTION_ROUTINES_DB=71118190-7086-43f5-80b1-a13fdb3840fd \
NOTION_EXERCISES_DB=a5288f02-c641-439f-8bc6-b4a82b504504 npm run dev
```

It keeps everything in memory and is as strict as Notion about column names and types.

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

The tests cover:

- the plate maths
- every progression rule
- the schedule and rotation
- the workout state machine
- the passcode gate
- the Notion layer, run against the fake, including retried uploads

## Deploying to Vercel

```bash
npx vercel
```

Then add the environment variables from `.env.local` in **Project → Settings →
Environment Variables** (Production, Preview and Development), and redeploy. That means the four
Notion ones, plus `APP_PASSCODE` if you want the lock. `.env.local` is git-ignored and is never
uploaded, so this step is required even after a successful local run.

## Offline behaviour

Notion being the source of truth means a dead connection would otherwise mean a dead app, so the
phone keeps working copies:

- The plan and the timer routines are cached after every successful load. If Notion is
  unreachable, the last synced copy is used and the app says so.
- A workout in progress is saved on the phone after every set. A reload, a locked screen or a
  closed tab picks up where it left off, rest timer included.
- A finished workout that can't reach Notion is queued and uploaded the next time the app opens.
  Its new weights show straight away. The upload is safe to repeat: rows already written are
  skipped, so nothing is written twice.

Editing routines and plan settings still requires a connection.

## Layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Today: the day's workout, back care or rest, and the week |
| `app/workout/` | The workout in progress |
| `app/setup/` | First-time setup and plan settings |
| `app/exercises/` | Exercise guides: photos, steps, mistakes, back advice, demo video link |
| `app/timer/`, `app/routines/` | The spoken interval timer and its routines |
| `app/api/` | Server routes; the Notion token never reaches the browser |
| `proxy.ts`, `app/unlock/` | Optional passcode lock |
| `lib/training/` | Exercise library, plate maths, progression, schedule, workout state, Notion storage |
| `lib/useTimer.ts` | Interval engine |
| `lib/notion.ts` | Notion REST client and timer routines |
| `lib/audio.ts` | Speech and beeps |
| `lib/client.ts` | Browser-side fetching, cache, offline log queue |
| `test/fake-notion.mjs` | In-memory Notion stand-in for development and tests |

## Credits and care

- Exercise photos come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
  released into the public domain (Unlicense). The dataset doesn't say where the photos were
  originally taken, which is fine for a personal app. Replace them if you ever publish it.
- The goblet squat and bird dog drawings were made for this app.
- This is a training aid, not medical advice. Stop any exercise that causes sharp pain. Back
  pain that spreads down a leg, comes with numbness or weakness, or keeps getting worse needs a
  doctor or physiotherapist.
