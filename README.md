# Workout Timer

A home dumbbell training plan that adjusts as you get stronger, plus a spoken interval timer.

Open the app and **Today** shows what to do. On a training day that's a workout, with every
exercise, weight and rep target listed and a START button. On other days it's a short back care
session or a rest day. You follow along set by set, log reps with big +/− buttons, and the app
works out next session's weights. Everything is stored in your Notion **Health Tracker**.

**Progress** charts every lift and your body weight. Every four weeks a **review** looks back
and suggests changes, such as a lighter week or a harder exercise. Reminders go to your phone's
calendar, and the app installs to your home screen and opens without signal.

Everything about the workouts can be changed under **Edit workouts**: swap, add, remove and
reorder exercises, set sets, reps, rest and weights, or make it dumbbell-only in one tap.

## The programme

Built for a beginner training at home with adjustable dumbbells, aiming at general fitness, with a
lower back that needs care. This is the starting plan; change any of it under
[Edit workouts](#make-it-yours).

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
   **Carries** (holds with a dumbbell) do the same, then move to the next dumbbell up and start
   again from about half the time.
8. **Back check:** after each exercise you say how your lower back felt. Mild discomfort holds
   the weight; pain drops it a step straight away.

The rules live in `lib/training/progression.ts`. The phone and the server use the same code, so
the summary screen shows exactly what Notion will record.

Before the first set of each exercise, the workout shows what you did last time and any note you
left yourself, e.g. *"Hamstrings, not back. Keep the dumbbells close."*

## Make it yours

**Edit workouts** is on each workout card on Today, at the bottom of Today, and in Plan
settings. For Workout A and B you can:

- **Swap** an exercise: similar moves are offered first (squats for a squat, and so on). The new
  one finds its weight in its first session. Swapping between a counted move and a hold (e.g. a
  plank for a carry) also brings that exercise's own sets, targets and rest.
- **Add** an exercise from the library, grouped by what it trains. A **Dumbbell exercises only**
  filter is on by default.
- **Remove** an exercise. It's only marked removed (`Archived` in Notion), with its history kept,
  and **Put back** returns it. A workout always keeps at least one exercise.
- **Reorder** with the arrows.
- **Change** sets, the rep range (or hold times), rest, and the weight. Weights step through
  what your dumbbells can actually make. **Find it** lets the next session work the weight out
  again.

**Dumbbell only** swaps the bodyweight moves in one tap:

| From | To | Why |
| --- | --- | --- |
| Dead bug | Dumbbell dead bug | Same job: keeping your spine still while your legs move |
| Bird dog | Farmer carry | Bracing against a load, standing tall |
| Side plank | Suitcase carry | A side plank you can load: resisting being pulled sideways |
| Glute bridge, split squat | Same moves, with a dumbbell from the start | |

The core moves stay in, loaded, because they're the ones that protect your back. With one handle,
the farmer carry becomes a suitcase carry. Back care days are separate bodyweight stretching:
turn them off in Plan settings by unselecting the days.

The library now also has sumo squats, reverse lunges, step-ups, floor flies, lateral raises,
seated reverse flies, biceps and hammer curls, lying triceps extensions, calf raises, farmer and
suitcase carries, and the dumbbell dead bug, each with pictures and form cues.

## Progress

**Progress** (top of Today) is built from the Lift Log, so it includes everything you've ever
logged:

- **Totals:** workouts done, workouts in the last 4 weeks against plan, weeks on track in a row,
  and total kg lifted.
- **Calendar:** each day since you started (up to 8 weeks), showing what was planned and what
  you did.
- **Your lifts:** best set and gain for each exercise. Tap one for its chart: working weight
  for dumbbell lifts, best set for bodyweight moves, longest hold for planks. Use arrow keys or
  touch to read each session, or **Show as table**.
- **Weight lifted per week:** weight × reps, both dumbbells counted.
- **Body weight:** read from, and added to, your existing **Weight Log**.

## Every 4 weeks: a review

When a 4-week block ends, Today shows **Your 4-week review is ready**. The review lists workouts
done against plan, and each lift's sessions, weight change, steps up and down, and back-pain
flags. It then suggests changes:

- **Take a lighter week**: when your back reported pain twice or more, or lifts went backwards
  twice or more. Otherwise it's suggested every 8 weeks, but never within 4 weeks of the last
  one.
- **Make an exercise harder**: when a lift has topped out what your dumbbells can make, even with
  extra reps:
  - goblet squat or split squat → Bulgarian split squat
  - Romanian deadlift → single-leg RDL
  - glute bridge → single-leg glute bridge
  - floor press → one-arm floor press

  The new exercise starts by finding its weight again.
- **Switch to 2 strength days** (Mon/Thu, back care Tue/Sat): when fewer than half the planned
  workouts happened. Never after an empty block, which is more likely illness or travel than a
  bad fit.

Suggestions start ticked, so following the plan takes one tap. Nothing changes until you press
the button. A block with nothing to suggest still gets the summary, and the lighter week can be
taken anyway.

### Lighter weeks

For 7 days, every lift has one set fewer and is about 10% lighter. If the next weight down is a
much bigger drop (e.g. 4.5 kg → the 2 kg empty handle), you keep the weight and just do fewer
sets. Weights don't change after these sessions. A lift still finding its first weight works as
usual.

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

Three databases sit on the Health Tracker page, next to the Workout Log. They already exist in
this workspace, and the app finds them by name, so no new environment variables are needed. If
one is missing, **Create my plan** creates it. The app never deletes, renames or changes
existing columns. If a column it needs is missing it adds it; if one has the wrong type it stops
and says which.

**Training Programme**: one row, your plan. `Start Date`, `Training Days`, `Back Care Days`,
`Handles`, `Handle Weight (kg)`, `Plates` (e.g. `1.25×4, 1.5×4, 2×4`), `Plates Per Side`,
`Bench`, `Level`, `Back Pain`, `Active`, `Deload Until`, `Last Review`, `Reminder Time`. The last
three are added to an existing database automatically the first time they're needed.

**Programme Exercises**: one row per exercise in Workout A or B, holding its current target.
`Exercise ID`, `Workout`, `Order`, `Sets`, `Rep Min`, `Rep Max`, `Seconds`, `Max Seconds`,
`Rest (s)`, `Weight (kg)`, `Stretch`, `Stalls`, `Last Session`, `Last Done`, `Archived`.

- `Weight (kg)` is per dumbbell. Empty means "find it next session" and 0 means bodyweight.
- **Edit workouts** changes these rows for you. Editing them here works too; the app follows.
- `Archived` marks an exercise removed without deleting it (that's what **Remove** does).

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

**Weight Log** (existing, next to the Workout Log) feeds the body weight chart. Saving a weight
on Progress adds a row: `Name` and `Date` are the day, `Weight (kg)` the weight, and `Body Fat %`
is filled in if you enter it. The app finds the database by name. Set `NOTION_WEIGHT_LOG_DB` to
point it elsewhere.

## Passcode lock

By default anyone with the app's URL can use it, including reading and changing your Notion data
through it. Set `APP_PASSCODE` (in `.env.local` and on Vercel) to require a passcode once per
device:

- Pick something longer than a 4-digit PIN; each wrong guess is slowed down.
- The phone stays unlocked through an `HttpOnly` cookie.
- Changing the passcode, or `APP_SECRET`, signs every device out.
- The calendar feed is the one exception: calendar apps can't enter a passcode. Its link carries
  its own secret token, and only someone already unlocked can see it.
- The install files (manifest, icons, service worker) are public too. They contain no data.

## Reminders

**Plan settings → Reminders** sets a time (18:00 until you pick one) and gives you a calendar
link. Your phone's calendar then shows every strength and back care day, with an alert at that
time. Lighter weeks and the next review appear as all-day events. Calendar apps re-check the link
on their own (Apple's every few hours, Google's up to a day), so changing your days or time in
the app, or in a review, reaches the calendar by itself.

- **iPhone:** tap **Subscribe**, then **Subscribe** again. Keep "Remove alerts" off.
- **Google Calendar:** tap **Copy link**. Then, on a computer, go to calendar.google.com and
  choose **Other calendars → + → From URL**. Google ignores the feed's own alerts, so set a
  default notification in that calendar's settings.
- **One-off import:** **Download the calendar file** adds the repeating events once. They keep
  their alerts but won't follow later changes.

Anyone with the link can see your schedule and the app's address, nothing else. If a link gets
out, change `APP_SECRET`; every old link stops working.

## Install it on your phone

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ → **Install app**, or **Add to Home screen**.

It opens full screen like an app, with its own icon, and shortcuts to Progress and the timer on
Android (long-press the icon).

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
- every progression rule, including lighter weeks and carries
- editing the workouts: swaps, targets, remove and put back, adding, dumbbell-only
- the schedule and rotation
- the workout state machine
- progress read-outs and the 4-week review
- the calendar feed: format, line folding, and the secret link
- the passcode gate
- the Notion layer, run against the fake, including retried uploads, history, body weight and
  reviews

## Deploying to Vercel

```bash
npx vercel
```

Then add the environment variables from `.env.local` in **Project → Settings →
Environment Variables** (Production, Preview and Development), and redeploy. That means the four
Notion ones, plus `APP_PASSCODE` if you want the lock. Also set `APP_SECRET` to a long random
string: it signs the unlock cookie and the calendar link. Without it the Notion token is used,
and the calendar link could then only be revoked by changing the token. `.env.local` is
git-ignored and is never uploaded, so this step is required even after a successful local run.

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
- Progress keeps the last synced history, so the charts still open offline.
- Once installed (or after one visit in a production build), a service worker keeps the app
  itself on the phone. Pages you've opened before open with no signal. Pages you haven't say
  so and link back to Today.

Editing routines, workouts and plan settings, saving body weight and applying a review still
require a connection.

## Layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Today: the day's workout, back care or rest, and the week |
| `app/workout/` | The workout in progress |
| `app/progress/` | Charts, the consistency calendar and body weight |
| `app/review/` | The 4-week review |
| `app/workouts/` | Edit workouts: swap, add, remove, reorder, targets, dumbbell-only |
| `app/setup/` | First-time setup, plan settings and reminders |
| `app/exercises/` | Exercise guides: photos, steps, mistakes, back advice, demo video link |
| `app/timer/`, `app/routines/` | The spoken interval timer and its routines |
| `app/api/` | Server routes; the Notion token never reaches the browser |
| `app/api/calendar/` | The calendar feed and its link |
| `app/manifest.ts`, `public/sw.js`, `public/icons/` | Install to home screen and offline start-up |
| `proxy.ts`, `app/unlock/` | Optional passcode lock |
| `lib/training/` | Exercise library, plate maths, progression, schedule, workout state, editing, progress, reviews, calendar feed, Notion storage |
| `lib/useTimer.ts` | Interval engine |
| `lib/notion.ts` | Notion REST client and timer routines |
| `lib/audio.ts` | Speech and beeps |
| `lib/client.ts` | Browser-side fetching, cache, offline log queue |
| `test/fake-notion.mjs` | In-memory Notion stand-in for development and tests |

## Credits and care

- Exercise photos come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
  released into the public domain (Unlicense). The dataset doesn't say where the photos were
  originally taken, which is fine for a personal app. Replace them if you ever publish it.
- The goblet squat, bird dog, farmer and suitcase carry, and dumbbell dead bug drawings were
  made for this app.
- This is a training aid, not medical advice. Stop any exercise that causes sharp pain. Back
  pain that spreads down a leg, comes with numbness or weakness, or keeps getting worse needs a
  doctor or physiotherapist.
