import "server-only";

import {
  env,
  inBatches,
  normalizeId,
  notion,
  NotionApiError,
  NotionConfigError,
  queryAll,
  readCheckbox,
  readDate,
  readNumber,
  readTitle,
  type NotionPage,
} from "../notion";
import { DEFAULT_EQUIPMENT, formatPlates, ladderFor, parsePlates } from "./equipment";
import { getExercise } from "./exercises";
import { formatKg, formatValues } from "./format";
import { decide, workingSets, type Decision, type Outcome } from "./progression";
import { BACK_CARE } from "./routines";
import { buildSlots, canonicalExercise, substitute, type SlotSeed } from "./template";
import {
  DAYS,
  type BackFeel,
  type DayName,
  type Effort,
  type ExerciseLog,
  type LastResult,
  type Programme,
  type SessionLog,
  type SessionMark,
  type Slot,
  type TrainingData,
} from "./types";
import type { ProgrammeInput } from "./validate";

/**
 * Notion storage for the training programme: three databases that sit next
 * to the Workout Log on the Health Tracker page.
 *
 * Nothing here deletes, archives or renames anything. Missing databases and
 * missing columns are created; everything else is left exactly as found.
 */

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

type PropertyType = "title" | "rich_text" | "number" | "date" | "checkbox" | "select" | "multi_select";

type DatabaseKey = "programme" | "exercises" | "liftLog";

type DatabaseSchema = {
  key: DatabaseKey;
  title: string;
  properties: Record<string, { type: PropertyType; options?: readonly string[] }>;
};

const EFFORT_LABEL: Record<Effort, string> = { easy: "Easy", good: "Good", hard: "Hard", too_hard: "Too hard" };
const BACK_LABEL: Record<BackFeel, string> = { none: "No pain", mild: "Mild", pain: "Pain" };
const RESULT_LABEL: Record<Outcome, string> = {
  set: "Set",
  up: "Up",
  hold: "Hold",
  down: "Down",
  stretch: "Stretch",
  skipped: "Skipped",
};

export const SCHEMAS: DatabaseSchema[] = [
  {
    key: "programme",
    title: "Training Programme",
    properties: {
      Name: { type: "title" },
      Active: { type: "checkbox" },
      "Start Date": { type: "date" },
      "Training Days": { type: "multi_select", options: DAYS },
      "Back Care Days": { type: "multi_select", options: DAYS },
      Handles: { type: "number" },
      "Handle Weight (kg)": { type: "number" },
      Plates: { type: "rich_text" },
      "Plates Per Side": { type: "number" },
      Bench: { type: "checkbox" },
      Level: { type: "select", options: ["Beginner", "Intermediate"] },
      "Back Pain": { type: "checkbox" },
    },
  },
  {
    key: "exercises",
    title: "Programme Exercises",
    properties: {
      Name: { type: "title" },
      "Exercise ID": { type: "rich_text" },
      Workout: { type: "select", options: ["A", "B"] },
      Order: { type: "number" },
      Sets: { type: "number" },
      "Rep Min": { type: "number" },
      "Rep Max": { type: "number" },
      Seconds: { type: "number" },
      "Max Seconds": { type: "number" },
      "Rest (s)": { type: "number" },
      "Weight (kg)": { type: "number" },
      Stretch: { type: "number" },
      Stalls: { type: "number" },
      "Last Session": { type: "rich_text" },
      "Last Done": { type: "date" },
      Archived: { type: "checkbox" },
    },
  },
  {
    key: "liftLog",
    title: "Lift Log",
    properties: {
      Name: { type: "title" },
      Date: { type: "date" },
      Session: { type: "rich_text" },
      Workout: { type: "select", options: ["A", "B"] },
      "Exercise ID": { type: "rich_text" },
      "Weight (kg)": { type: "number" },
      Sets: { type: "number" },
      Reps: { type: "rich_text" },
      "Total Reps": { type: "number" },
      "Total Seconds": { type: "number" },
      "Volume (kg)": { type: "number" },
      Effort: { type: "select", options: Object.values(EFFORT_LABEL) },
      Back: { type: "select", options: Object.values(BACK_LABEL) },
      Result: { type: "select", options: Object.values(RESULT_LABEL) },
      Next: { type: "rich_text" },
      Note: { type: "rich_text" },
    },
  },
];

type Dbs = Record<DatabaseKey, string>;

/** A setup step is still needed before training data exists. */
export class TrainingSetupError extends Error {
  constructor(
    readonly reason: "databases" | "programme",
    readonly missing: string[] = [],
  ) {
    super(
      reason === "databases"
        ? `Training databases not found in Notion: ${missing.join(", ")}`
        : "No training programme has been set up yet",
    );
  }
}

export class ConflictError extends Error {}

/* ------------------------------------------------------------------ *
 * Property helpers
 * ------------------------------------------------------------------ */

type Page = NotionPage & { created_time?: string };

function readText(page: Page, key: string): string {
  const parts = page.properties?.[key]?.rich_text ?? [];
  return parts.map((part: { plain_text?: string }) => part.plain_text ?? "").join("").trim();
}

function readSelect(page: Page, key: string): string | null {
  return page.properties?.[key]?.select?.name ?? null;
}

function readMultiSelect(page: Page, key: string): string[] {
  const options = page.properties?.[key]?.multi_select ?? [];
  return options.map((option: { name: string }) => option.name);
}

const text = (content: string) => ({
  rich_text: content ? [{ text: { content: content.slice(0, 2000) } }] : [],
});
const title = (content: string) => ({ title: [{ text: { content: content.slice(0, 200) } }] });
const num = (value: number | null) => ({ number: value });
const select = (name: string | null) => ({ select: name ? { name } : null });
const date = (iso: string | null) => ({ date: iso ? { start: iso } : null });

function definition(def: DatabaseSchema["properties"][string]) {
  switch (def.type) {
    case "select":
      return { select: { options: (def.options ?? []).map((name) => ({ name })) } };
    case "multi_select":
      return { multi_select: { options: (def.options ?? []).map((name) => ({ name })) } };
    case "number":
      return { number: { format: "number" } };
    default:
      return { [def.type]: {} };
  }
}

/* ------------------------------------------------------------------ *
 * Finding (and creating) the databases
 * ------------------------------------------------------------------ */

type Discovery = { parentId: string | null; found: Partial<Dbs> };

let discoveryCache: { at: number; value: Discovery } | null = null;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

function overrides(): Partial<Dbs> {
  const entries: Array<[DatabaseKey, string | undefined]> = [
    ["programme", process.env.NOTION_PROGRAMME_DB],
    ["exercises", process.env.NOTION_PROGRAMME_EXERCISES_DB],
    ["liftLog", process.env.NOTION_LIFT_LOG_DB],
  ];
  return Object.fromEntries(entries.filter(([, id]) => id)) as Partial<Dbs>;
}

/**
 * Database ids come from env vars when set; otherwise they are looked up by
 * title among the databases on the page that holds the Workout Log, so no
 * new configuration is needed after deploying.
 */
async function discover(fresh = false): Promise<Discovery> {
  const found = overrides();
  if (SCHEMAS.every((schema) => found[schema.key])) return { parentId: null, found };
  if (!fresh && discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.value;
  }

  const workoutLog = await notion<{ parent?: { type: string; page_id?: string } }>(
    `/databases/${env("NOTION_LOG_DB")}`,
  );
  const parentId = workoutLog.parent?.type === "page_id" ? (workoutLog.parent.page_id ?? null) : null;
  if (!parentId) {
    throw new NotionConfigError(
      "The Workout Log must sit directly on a page (your Health Tracker) so the training databases can live next to it.",
    );
  }

  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await notion<{
      results: Array<{ id: string; type: string; child_database?: { title?: string } }>;
      has_more: boolean;
      next_cursor: string | null;
    }>(`/blocks/${parentId}/children?${query}`);

    for (const block of page.results) {
      if (block.type !== "child_database") continue;
      const name = (block.child_database?.title ?? "").trim().toLowerCase();
      const schema = SCHEMAS.find((candidate) => candidate.title.toLowerCase() === name);
      if (schema && !found[schema.key]) found[schema.key] = block.id;
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const value = { parentId, found };
  // Only a complete answer is worth remembering; a partial one is about to change.
  discoveryCache = SCHEMAS.every((schema) => found[schema.key]) ? { at: Date.now(), value } : null;
  return value;
}

/** Drops remembered database ids, e.g. after one was moved or deleted in Notion. */
export function forgetDatabases(): void {
  discoveryCache = null;
}

function missingTitles(found: Partial<Dbs>): string[] {
  return SCHEMAS.filter((schema) => !found[schema.key]).map((schema) => schema.title);
}

async function requireDbs(): Promise<Dbs> {
  const { found } = await discover();
  const missing = missingTitles(found);
  if (missing.length) throw new TrainingSetupError("databases", missing);
  return found as Dbs;
}

/** Adds columns the app needs; never touches existing ones. */
async function addMissingColumns(databaseId: string, schema: DatabaseSchema): Promise<void> {
  const database = await notion<{ properties: Record<string, { type: string }> }>(
    `/databases/${databaseId}`,
  );
  const additions: Record<string, unknown> = {};
  const conflicts: string[] = [];

  for (const [name, def] of Object.entries(schema.properties)) {
    const existing = database.properties[name];
    if (!existing) {
      if (def.type === "title") conflicts.push(`"${name}" (the title column)`);
      else additions[name] = definition(def);
    } else if (existing.type !== def.type) {
      conflicts.push(`"${name}" should be ${def.type.replace("_", " ")}, not ${existing.type.replace("_", " ")}`);
    }
  }

  if (conflicts.length) {
    throw new NotionConfigError(
      `${schema.title} has columns the app can't use: ${conflicts.join("; ")}. ` +
        "Fix them in Notion — the app never changes or deletes existing columns.",
    );
  }
  if (Object.keys(additions).length) {
    await notion(`/databases/${databaseId}`, { method: "PATCH", body: { properties: additions } });
  }
}

/** Creates whichever training databases don't exist yet, next to the Workout Log. */
export async function ensureDatabases(): Promise<Dbs> {
  const { parentId, found } = await discover(true);
  const result: Partial<Dbs> = { ...found };

  for (const schema of SCHEMAS) {
    const existing = result[schema.key];
    if (existing) {
      await addMissingColumns(existing, schema);
      continue;
    }
    if (!parentId) {
      throw new NotionConfigError(`Set the database id for "${schema.title}" or remove the other overrides.`);
    }
    const created = await notion<{ id: string }>("/databases", {
      method: "POST",
      body: {
        parent: { type: "page_id", page_id: parentId },
        title: [{ type: "text", text: { content: schema.title } }],
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([name, def]) => [name, definition(def)]),
        ),
      },
    });
    result[schema.key] = created.id;
  }

  discoveryCache = null;
  return result as Dbs;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function toProgramme(page: Page): Programme {
  const plates = parsePlates(readText(page, "Plates"));
  const dayList = (key: string) =>
    DAYS.filter((day) => readMultiSelect(page, key).includes(day)) as DayName[];

  return {
    id: page.id,
    name: readTitle(page, "Name") || "Home dumbbell plan",
    startDate: (readDate(page, "Start Date") ?? new Date().toISOString()).slice(0, 10),
    trainingDays: dayList("Training Days"),
    backCareDays: dayList("Back Care Days"),
    equipment: {
      handles: readNumber(page, "Handles") === 1 ? 1 : 2,
      handleWeight: readNumber(page, "Handle Weight (kg)") ?? DEFAULT_EQUIPMENT.handleWeight,
      plates: plates.length ? plates : DEFAULT_EQUIPMENT.plates,
      platesPerSide: readNumber(page, "Plates Per Side") ?? DEFAULT_EQUIPMENT.platesPerSide,
      bench: readCheckbox(page, "Bench"),
    },
    level: readSelect(page, "Level") === "Intermediate" ? "intermediate" : "beginner",
    backPain: readCheckbox(page, "Back Pain"),
  };
}

function toSlot(page: Page): Slot | null {
  const exerciseId = readText(page, "Exercise ID");
  const workout = readSelect(page, "Workout");
  if (!exerciseId || (workout !== "A" && workout !== "B")) return null;
  const whole = (key: string, fallback: number) => Math.round(readNumber(page, key) ?? fallback);

  return {
    id: page.id,
    exerciseId,
    workout,
    order: readNumber(page, "Order") ?? 99,
    sets: Math.min(10, Math.max(1, whole("Sets", 3))),
    repMin: readNumber(page, "Rep Min"),
    repMax: readNumber(page, "Rep Max"),
    seconds: readNumber(page, "Seconds"),
    maxSeconds: readNumber(page, "Max Seconds"),
    rest: Math.max(0, whole("Rest (s)", 60)),
    weight: readNumber(page, "Weight (kg)"),
    stretch: Math.max(0, whole("Stretch", 0)),
    stalls: Math.max(0, whole("Stalls", 0)),
    lastSession: readText(page, "Last Session") || null,
    lastDone: readDate(page, "Last Done"),
  };
}

/** "12, 11, 10", "30 s, 25 s" or "12 @ 8 kg, …" → the reps (or seconds) of each set. */
function parseValues(reps: string): number[] {
  return reps
    .split(",")
    .map((part) => Number(part.match(/\d+(?:\.\d+)?/)?.[0]))
    .filter((value) => Number.isFinite(value));
}

function activeProgrammes(dbs: Dbs) {
  return queryAll(dbs.programme, {
    filter: { property: "Active", checkbox: { equals: true } },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  }) as Promise<Page[]>;
}

function activeSlots(dbs: Dbs) {
  return queryAll(dbs.exercises, {
    filter: { property: "Archived", checkbox: { equals: false } },
  }) as Promise<Page[]>;
}

export type TrainingResponse =
  | { status: "ready"; data: TrainingData }
  | { status: "setup"; reason: "databases" | "programme"; missing: string[] };

export async function loadTraining(): Promise<TrainingResponse> {
  try {
    return await readTraining();
  } catch (error) {
    // A remembered database that has since gone away: look again next time.
    if (error instanceof NotionApiError && error.status === 404) forgetDatabases();
    throw error;
  }
}

async function readTraining(): Promise<TrainingResponse> {
  const { found } = await discover();
  const missing = missingTitles(found);
  if (missing.length) return { status: "setup", reason: "databases", missing };
  const dbs = found as Dbs;

  // Back care is logged by the timer; two weeks is plenty for the week view.
  const since = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10);

  const [programmes, slotPages, recentLifts, backCare] = await Promise.all([
    activeProgrammes(dbs),
    activeSlots(dbs),
    notion<{ results: Page[] }>(`/databases/${dbs.liftLog}/query`, {
      method: "POST",
      body: {
        page_size: 100,
        sorts: [
          { property: "Date", direction: "descending" },
          { timestamp: "created_time", direction: "descending" },
        ],
      },
    }),
    queryAll(env("NOTION_LOG_DB"), {
      filter: {
        and: [
          { property: "Exercise", rich_text: { equals: BACK_CARE.name } },
          { property: "Date", date: { on_or_after: since } },
        ],
      },
    }) as Promise<Page[]>,
  ]);

  if (!programmes.length) return { status: "setup", reason: "programme", missing: [] };

  const sessions = new Map<string, SessionMark>();
  const last: Record<string, LastResult> = {};

  for (const row of recentLifts.results) {
    const day = readDate(row, "Date")?.slice(0, 10);
    const workout = readSelect(row, "Workout");
    if (!day || (workout !== "A" && workout !== "B")) continue;

    const key = readText(row, "Session") || `${day}:${workout}`;
    const at = row.created_time;
    const existing = sessions.get(key);
    if (!existing || (at && (!existing.at || at < existing.at))) {
      sessions.set(key, { date: day, kind: "strength", workout, at });
    }

    const exerciseId = readText(row, "Exercise ID");
    if (exerciseId && !last[exerciseId]) {
      last[exerciseId] = {
        date: day,
        weight: readNumber(row, "Weight (kg)") ?? 0,
        values: parseValues(readText(row, "Reps")),
      };
    }
  }

  const history: SessionMark[] = [
    ...sessions.values(),
    ...backCare.flatMap((row): SessionMark[] => {
      const day = readDate(row, "Date")?.slice(0, 10);
      return day ? [{ date: day, kind: "backcare", at: row.created_time }] : [];
    }),
  ];

  return {
    status: "ready",
    data: {
      programme: toProgramme(programmes[0]),
      slots: slotPages.map(toSlot).filter((slot): slot is Slot => slot !== null),
      history,
      last,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Programme setup and settings
 * ------------------------------------------------------------------ */

function programmeProperties(input: ProgrammeInput) {
  const { equipment } = input;
  return {
    "Start Date": date(input.startDate),
    "Training Days": { multi_select: input.trainingDays.map((name) => ({ name })) },
    "Back Care Days": { multi_select: input.backCareDays.map((name) => ({ name })) },
    Handles: num(equipment.handles),
    "Handle Weight (kg)": num(equipment.handleWeight),
    Plates: text(formatPlates(equipment.plates)),
    "Plates Per Side": num(equipment.platesPerSide),
    Bench: { checkbox: equipment.bench },
    Level: select(input.level === "intermediate" ? "Intermediate" : "Beginner"),
    "Back Pain": { checkbox: input.backPain },
  };
}

function slotProperties(seed: SlotSeed) {
  return {
    Name: title(getExercise(seed.exerciseId).name),
    "Exercise ID": text(seed.exerciseId),
    Workout: select(seed.workout),
    Order: num(seed.order),
    Sets: num(seed.sets),
    "Rep Min": num(seed.repMin),
    "Rep Max": num(seed.repMax),
    Seconds: num(seed.seconds),
    "Max Seconds": num(seed.maxSeconds),
    "Rest (s)": num(seed.rest),
    "Weight (kg)": num(seed.weight),
    Stretch: num(seed.stretch),
    Stalls: num(seed.stalls),
    Archived: { checkbox: false },
  };
}

/**
 * Creates the databases (if needed), the programme row and its exercises.
 * Safe to retry: anything already there is reused, never duplicated.
 */
export async function createProgramme(input: ProgrammeInput): Promise<void> {
  const dbs = await ensureDatabases();
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);

  // Keyed by position, not exercise, so a bench/handle swap never looks "missing".
  const existing = new Set(
    slotPages.map((page) => `${readSelect(page, "Workout")}:${readNumber(page, "Order")}`),
  );
  const seeds = buildSlots(input.equipment).filter(
    (seed) => !existing.has(`${seed.workout}:${seed.order}`),
  );

  if (programmes.length && !seeds.length) {
    throw new ConflictError("A programme already exists. Change its settings instead.");
  }

  if (!programmes.length) {
    await notion("/pages", {
      method: "POST",
      body: {
        parent: { database_id: dbs.programme },
        properties: {
          Name: title("Home dumbbell plan"),
          Active: { checkbox: true },
          ...programmeProperties(input),
        },
      },
    });
  }

  await inBatches(seeds, 3, (seed) =>
    notion("/pages", {
      method: "POST",
      body: { parent: { database_id: dbs.exercises }, properties: slotProperties(seed) },
    }),
  );
}

/**
 * Saves schedule and equipment. A new bench or a change in handles swaps the
 * affected exercises for their matching variant, keeping their progress.
 */
export async function updateProgramme(input: ProgrammeInput): Promise<void> {
  const dbs = await requireDbs();
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);
  if (!programmes.length) throw new TrainingSetupError("programme");

  await notion(`/pages/${programmes[0].id}`, {
    method: "PATCH",
    body: { properties: programmeProperties(input) },
  });

  const swaps = slotPages.flatMap((page) => {
    const current = readText(page, "Exercise ID");
    const wanted = substitute(canonicalExercise(current), input.equipment);
    return current && wanted !== current ? [{ id: page.id, exerciseId: wanted }] : [];
  });
  await inBatches(swaps, 3, (swap) =>
    notion(`/pages/${swap.id}`, {
      method: "PATCH",
      body: {
        properties: {
          Name: title(getExercise(swap.exerciseId).name),
          "Exercise ID": text(swap.exerciseId),
        },
      },
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Recording a workout
 * ------------------------------------------------------------------ */

function describeSets(log: ExerciseLog): string {
  const kind = getExercise(log.exerciseId).kind;
  const weights = new Set(log.sets.map((set) => set.weight));
  if (weights.size <= 1) return formatValues(kind, log.sets.map((set) => set.value));
  return log.sets
    .map((set) => `${formatValues(kind, [set.value])} @ ${formatKg(set.weight)}`)
    .join(", ");
}

function liftRowProperties(session: SessionLog, log: ExerciseLog, decision: Decision | null) {
  const exercise = getExercise(log.exerciseId);
  const working = workingSets(log.sets);
  const total = log.sets.reduce((sum, set) => sum + set.value, 0);
  const pairFactor = exercise.load === "pair" ? 2 : 1;
  const volume =
    exercise.kind === "reps"
      ? log.sets.reduce((sum, set) => sum + set.weight * set.value * pairFactor, 0)
      : 0;

  return {
    Name: title(`${session.date} · ${exercise.name}`),
    Date: date(session.date),
    Session: text(session.id),
    Workout: select(session.workout),
    "Exercise ID": text(log.exerciseId),
    "Weight (kg)": num(working.weight),
    Sets: num(log.sets.length),
    Reps: text(describeSets(log)),
    "Total Reps": num(exercise.kind === "reps" ? total : null),
    "Total Seconds": num(exercise.kind === "timed" ? total : null),
    "Volume (kg)": num(volume ? Math.round(volume * 10) / 10 : null),
    Effort: select(log.effort ? EFFORT_LABEL[log.effort] : null),
    Back: select(log.back ? BACK_LABEL[log.back] : null),
    Result: select(decision ? RESULT_LABEL[decision.outcome] : null),
    Next: text(decision?.message ?? ""),
    Note: text(log.note ?? ""),
  };
}

/** The tag that marks a Workout Log row as belonging to one session. */
const sessionRef = (session: SessionLog) => `ref ${session.id.slice(0, 8)}`;

async function writeSummary(session: SessionLog): Promise<void> {
  const ref = sessionRef(session);
  const existing = await queryAll(env("NOTION_LOG_DB"), {
    filter: { property: "Notes", rich_text: { contains: ref } },
  });
  if (existing.length) return;

  const done = session.exercises.filter((log) => log.sets.length);
  const parts = done.map((log) => {
    const exercise = getExercise(log.exerciseId);
    const { weight } = workingSets(log.sets);
    const load = weight > 0 ? ` ${formatKg(weight)}` : "";
    const values = log.sets.map((set) => (exercise.kind === "timed" ? `${set.value}s` : set.value));
    return `${exercise.name}${load} × ${values.join("/")}`;
  });
  const totalReps = done
    .filter((log) => getExercise(log.exerciseId).kind === "reps")
    .reduce((sum, log) => sum + log.sets.reduce((inner, set) => inner + set.value, 0), 0);
  const minutes = Math.max(1, Math.round(session.elapsedSeconds / 60));
  const name = `Dumbbell Workout ${session.workout}`;

  await notion("/pages", {
    method: "POST",
    body: {
      parent: { database_id: env("NOTION_LOG_DB") },
      properties: {
        Name: title(`${session.date} - ${name}`),
        Date: date(session.date),
        Exercise: text(name),
        Reps: num(totalReps || null),
        Notes: text(`${parts.join(" · ")} — ${minutes} min · ${ref}`),
      },
    },
  });
}

/**
 * Writes a finished workout: one Lift Log row per exercise, the progression
 * decision onto each programme exercise, and a summary row in the Workout
 * Log. Every step checks whether it already happened, so a retried upload
 * (offline queue, flaky signal) fills gaps instead of writing twice.
 */
export async function recordSession(session: SessionLog): Promise<{ rows: number; updates: number }> {
  const dbs = await requireDbs();
  const [programmes, slotPages, already] = await Promise.all([
    activeProgrammes(dbs),
    activeSlots(dbs),
    queryAll(dbs.liftLog, { filter: { property: "Session", rich_text: { equals: session.id } } }) as Promise<Page[]>,
  ]);
  if (!programmes.length) throw new TrainingSetupError("programme");

  const programme = toProgramme(programmes[0]);
  const slots = slotPages.map(toSlot).filter((slot): slot is Slot => slot !== null);
  const written = new Set(already.map((row) => readText(row, "Exercise ID")));
  let rows = 0;
  let updates = 0;

  await inBatches(
    session.exercises.filter((log) => log.sets.length),
    3,
    async (log) => {
      const slot =
        slots.find((candidate) => normalizeId(candidate.id) === normalizeId(log.slotId)) ??
        slots.find((candidate) => candidate.exerciseId === log.exerciseId && candidate.workout === session.workout);
      const exercise = getExercise(log.exerciseId);
      const fresh = slot && slot.lastSession !== session.id;
      const decision = fresh ? decide(slot, exercise, log, ladderFor(exercise, programme.equipment)) : null;

      if (!written.has(log.exerciseId)) {
        await notion("/pages", {
          method: "POST",
          body: { parent: { database_id: dbs.liftLog }, properties: liftRowProperties(session, log, decision) },
        });
        rows += 1;
      }

      if (slot && decision) {
        await notion(`/pages/${slot.id}`, {
          method: "PATCH",
          body: {
            properties: {
              "Weight (kg)": num(decision.next.weight),
              Stretch: num(decision.next.stretch),
              Stalls: num(decision.next.stalls),
              Seconds: num(decision.next.seconds),
              "Last Session": text(session.id),
              "Last Done": date(session.date),
            },
          },
        });
        updates += 1;
      }
    },
  );

  await writeSummary(session);
  return { rows, updates };
}
