# Workout Timer

A spoken interval timer for timed workout routines. One big **START** button on the home
screen; it announces each exercise aloud, runs `5s prep → N seconds work → 5s rest`, and
writes the finished session to your Notion **Workout Log**.

Notion is the source of truth for routines, so the same lists appear on every device.

## How a session runs

For each exercise in the routine:

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

## Notion setup

The app talks to Notion with an **internal integration token**. This is the one step that
cannot be automated — Notion only issues these through its own UI.

1. Go to <https://www.notion.so/my-integrations> → **New integration**.
   - Type: **Internal**
   - Associated workspace: *Faisal Merfin's*
   - Capabilities: **Read content**, **Update content**, **Insert content**
2. Copy the **Internal Integration Secret** (starts with `ntn_`).
3. Open the **Health Tracker** page in Notion → `⋯` menu → **Connections** → **Connect to**
   → pick your new integration. Connecting the parent page grants access to all four
   databases underneath it, so you only have to do this once.
4. Copy `.env.example` to `.env.local` and paste the token in.

The database IDs in `.env.example` are already filled in for this workspace:

| Variable | Database |
| --- | --- |
| `NOTION_ROUTINES_DB` | Workout Routines |
| `NOTION_EXERCISES_DB` | Routine Exercises |
| `NOTION_LOG_DB` | Workout Log (existing) |

> If step 3 is missed, every request fails with `Could not find database` — that error means
> the integration exists but has not been granted access to the page.

## Databases

**Workout Routines** — one row per routine. `Name`, `Default` (which routine the home screen
offers), `Last Used`, `Archived` (deleting in the app ticks this rather than destroying the row).

**Routine Exercises** — one row per exercise. `Name`, `Routine` (relation), `Order`,
`Duration (s)`. Editable directly in Notion; the app reads `Order` to sequence them.

**Workout Log** — your existing log, with one property added: `Duration (s)`. The app appends
**one row per completed session**:

| Property | Value |
| --- | --- |
| `Name` | `2026-08-11 - Pushups & Core` |
| `Date` | Session date |
| `Exercise` | Routine name |
| `Duration (s)` | Total work seconds (excludes prep and rest) |
| `Notes` | `Pushups 45s · Plank 45s — 2/4 exercises, 90s work, 115s total (partial)` |
| `Reps`, `Level` | **Left empty on purpose** — they belong to your rep-based entries and mean nothing for a timed session |

Ending a workout early still logs whatever was finished, marked `(partial)`.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

## Deploying to Vercel

```bash
npx vercel
```

Then add the four environment variables from `.env.local` in **Project → Settings →
Environment Variables** (Production, Preview and Development), and redeploy. `.env.local` is
git-ignored and is never uploaded, so this step is required even after a successful local run.

## Offline behaviour

Notion being the source of truth means a dead connection would otherwise mean a dead app, so
two fallbacks exist:

- Routines are cached in `localStorage` after every successful load. If Notion is unreachable
  the last synced copy is used and the home screen says so.
- A session that finishes while offline is queued on the device and uploaded the next time the
  app opens. Nothing is lost, and nothing is written twice.

Editing routines still requires a connection.

## Layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Home — start button, routine switcher |
| `app/routines/` | List, create, edit |
| `app/api/` | Server routes; the Notion token never reaches the browser |
| `lib/useTimer.ts` | Interval engine |
| `lib/notion.ts` | Notion REST client |
| `lib/audio.ts` | Speech + beeps |
| `lib/client.ts` | Browser-side fetching, cache, offline log queue |
