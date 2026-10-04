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
import { EXERCISES, getExercise } from "./exercises";
import { formatKg, formatValues } from "./format";
import { decide, workingSets, type Decision, type Outcome } from "./progression";
import { BACK_CARE } from "./routines";
import {
  DEFAULT_PLAN,
  formatWorkoutNames,
  getPlan,
  parseSavedWorkouts,
  parseWorkoutNames,
  serializeWorkouts,
  snapshotWorkouts,
  type PlanWorkout,
} from "./plans";
import { addDays, DELOAD_DAYS, inDeload } from "./schedule";
import {
  buildSlots,
  canonicalExercise,
  prescriptionFor,
  seedFor,
  seedsForPlan,
  startingWeight,
  substitute,
  targetsFor,
  type SlotSeed,
} from "./template";
import {
  DAYS,
  isWorkoutKey,
  type BackFeel,
  type DayName,
  type Effort,
  type ExerciseLog,
  type History,
  type LastResult,
  type LiftEntry,
  type Programme,
  type SessionLog,
  type SessionMark,
  type Slot,
  type TrainingData,
  type WeightEntry,
  type WorkoutKey,
} from "./types";
import {
  InputError,
  type ApplyPlanInput,
  type BodyWeightInput,
  type NewSlotInput,
  type ProgrammeInput,
  type ReviewInput,
  type SlotUpdate,
} from "./validate";

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
      "Deload Until": { type: "date" },
      "Last Review": { type: "number" },
      "Reminder Time": { type: "rich_text" },
      "Workout Names": { type: "rich_text" },
      "Plan Since": { type: "rich_text" },
    },
  },
  {
    key: "exercises",
    title: "Programme Exercises",
    properties: {
      Name: { type: "title" },
      "Exercise ID": { type: "rich_text" },
      Workout: { type: "select", options: ["A", "B", "C", "D"] },
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
      Workout: { type: "select", options: ["A", "B", "C", "D"] },
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

type Page = NotionPage & { created_time?: string; last_edited_time?: string };

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

type Discovery = {
  parentId: string | null;
  found: Partial<Dbs>;
  weightLog: string | null;
  savedPlans: string | null;
};

const WEIGHT_LOG_TITLE = "weight log";
const SAVED_PLANS_TITLE = "Saved Plans";

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
  let weightLog = process.env.NOTION_WEIGHT_LOG_DB || null;
  let savedPlans = process.env.NOTION_SAVED_PLANS_DB || null;
  if (SCHEMAS.every((schema) => found[schema.key]) && weightLog && savedPlans) {
    return { parentId: null, found, weightLog, savedPlans };
  }
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
      if (name === WEIGHT_LOG_TITLE && !weightLog) weightLog = block.id;
      if (name === SAVED_PLANS_TITLE.toLowerCase() && !savedPlans) savedPlans = block.id;
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const value = { parentId, found, weightLog, savedPlans };
  // Only a complete answer is worth remembering; a partial one is about to change.
  discoveryCache = SCHEMAS.every((schema) => found[schema.key]) ? { at: Date.now(), value } : null;
  return value;
}

/** Drops remembered database ids, e.g. after one was moved or deleted in Notion. */
export function forgetDatabases(): void {
  discoveryCache = null;
  programmeColumnsChecked = false;
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

let programmeColumnsChecked = false;

/**
 * Plans created before a column was added to the schema gain it on their next
 * write. Checked once per server instance.
 */
async function ensureProgrammeColumns(dbs: Dbs): Promise<void> {
  if (programmeColumnsChecked) return;
  await addMissingColumns(dbs.programme, SCHEMAS.find((schema) => schema.key === "programme")!);
  programmeColumnsChecked = true;
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
    deloadUntil: readDate(page, "Deload Until")?.slice(0, 10) ?? null,
    lastReview: Math.max(0, Math.round(readNumber(page, "Last Review") ?? 0)),
    reminderTime: parseTime(readText(page, "Reminder Time")),
    workoutNames: parseWorkoutNames(readText(page, "Workout Names")),
    planSince: readText(page, "Plan Since") || null,
  };
}

/** "18:30" → "18:30"; anything else → null. */
function parseTime(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? `${String(hours).padStart(2, "0")}:${match[2]}` : null;
}

function toSlot(page: Page): Slot | null {
  const exerciseId = readText(page, "Exercise ID");
  const workout = readSelect(page, "Workout");
  if (!exerciseId || !isWorkoutKey(workout)) return null;
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

/** Just the active programme: all the calendar feed needs. */
export async function loadProgramme(): Promise<Programme> {
  const dbs = await requireDbs();
  const programmes = await activeProgrammes(dbs);
  if (!programmes.length) throw new TrainingSetupError("programme");
  return toProgramme(programmes[0]);
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
    if (!day || !isWorkoutKey(workout)) continue;

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
        note: readText(row, "Note") || undefined,
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
    ...(input.reminderTime !== undefined ? { "Reminder Time": text(input.reminderTime ?? "") } : {}),
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
  // Removed (archived) rows count too: setup never brings back an exercise taken out on purpose.
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), queryAll(dbs.exercises, {}) as Promise<Page[]>]);

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
          Name: title(DEFAULT_PLAN.name),
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
  await ensureProgrammeColumns(dbs);
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);
  if (!programmes.length) throw new TrainingSetupError("programme");

  const before = toProgramme(programmes[0]).equipment;
  await notion(`/pages/${programmes[0].id}`, {
    method: "PATCH",
    body: { properties: programmeProperties(input) },
  });

  const swaps = slotPages.flatMap((page) => {
    const current = readText(page, "Exercise ID");
    const base = canonicalExercise(current);
    // Only exercises that were there for the old equipment follow the new one. A variation
    // chosen on purpose (a review's one-arm floor press, say) stays as it is.
    if (!current || substitute(base, before) !== current) return [];
    const wanted = substitute(base, input.equipment);
    return wanted !== current ? [{ id: page.id, exerciseId: wanted }] : [];
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
  const deload = inDeload(programme, session.date);
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
      const decision = fresh
        ? decide(slot, exercise, log, ladderFor(exercise, programme.equipment), { deload })
        : null;

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

/* ------------------------------------------------------------------ *
 * History, body weight and the 4-week review
 * ------------------------------------------------------------------ */

/** Every lift, every back care session, and body weight from the Weight Log. */
export async function loadHistory(): Promise<History> {
  const { found, weightLog } = await discover();
  const missing = missingTitles(found);
  if (missing.length) throw new TrainingSetupError("databases", missing);
  const dbs = found as Dbs;

  const [liftRows, backCareRows, weightRows] = await Promise.all([
    queryAll(dbs.liftLog, {
      sorts: [
        { property: "Date", direction: "ascending" },
        { timestamp: "created_time", direction: "ascending" },
      ],
    }) as Promise<Page[]>,
    queryAll(env("NOTION_LOG_DB"), {
      filter: { property: "Exercise", rich_text: { equals: BACK_CARE.name } },
    }) as Promise<Page[]>,
    // Body weight is a bonus: a missing or differently-shaped Weight Log never breaks the page.
    weightLog
      ? (queryAll(weightLog, { sorts: [{ property: "Date", direction: "ascending" }] }) as Promise<Page[]>).catch(
          () => [] as Page[],
        )
      : Promise.resolve([] as Page[]),
  ]);

  const lifts = liftRows.flatMap((row): LiftEntry[] => {
    const day = readDate(row, "Date")?.slice(0, 10);
    const workout = readSelect(row, "Workout");
    const exerciseId = readText(row, "Exercise ID");
    if (!day || !exerciseId || !isWorkoutKey(workout)) return [];
    return [
      {
        date: day,
        session: readText(row, "Session") || `${day}:${workout}`,
        workout,
        exerciseId,
        weight: readNumber(row, "Weight (kg)") ?? 0,
        values: parseValues(readText(row, "Reps")),
        result: readSelect(row, "Result"),
        back: readSelect(row, "Back"),
        effort: readSelect(row, "Effort"),
      },
    ];
  });

  const backCare = [
    ...new Set(backCareRows.flatMap((row) => readDate(row, "Date")?.slice(0, 10) ?? [])),
  ].sort();

  const bodyWeight = weightRows.flatMap((row): WeightEntry[] => {
    const day = readDate(row, "Date")?.slice(0, 10);
    const kg = readNumber(row, "Weight (kg)");
    if (!day || kg === null || kg <= 0) return [];
    const fat = Number.parseFloat(readText(row, "Body Fat %").replace(",", "."));
    return [{ date: day, kg, bodyFat: Number.isFinite(fat) ? fat : null }];
  });

  return { lifts, backCare, bodyWeight, weightLog: Boolean(weightLog) };
}

/**
 * Adds a row to the Weight Log in its own style ("2026-08-12" as the title).
 * Always a new row: existing entries are never edited.
 */
export async function logBodyWeight(input: BodyWeightInput): Promise<void> {
  const { weightLog } = await discover();
  if (!weightLog) {
    throw new NotionConfigError("No Weight Log database was found on the page with your Workout Log.");
  }
  await notion("/pages", {
    method: "POST",
    body: {
      parent: { database_id: weightLog },
      properties: {
        Name: title(input.date),
        Date: date(input.date),
        "Weight (kg)": num(input.kg),
        ...(input.bodyFat !== null ? { "Body Fat %": text(`${input.bodyFat}%`) } : {}),
      },
    },
  });
}

/**
 * Applies what was accepted in a 4-week review: a deload week, harder
 * variations, a different schedule. The block is marked reviewed either way.
 */
export async function applyReview(input: ReviewInput): Promise<void> {
  const dbs = await requireDbs();
  await ensureProgrammeColumns(dbs);
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);
  if (!programmes.length) throw new TrainingSetupError("programme");
  const programme = toProgramme(programmes[0]);

  const properties: Record<string, unknown> = {
    "Last Review": num(Math.max(programme.lastReview, input.block)),
  };
  if (input.deload) properties["Deload Until"] = date(addDays(input.today, DELOAD_DAYS - 1));
  if (input.schedule) {
    properties["Training Days"] = { multi_select: input.schedule.trainingDays.map((name) => ({ name })) };
    properties["Back Care Days"] = { multi_select: input.schedule.backCareDays.map((name) => ({ name })) };
  }
  await notion(`/pages/${programmes[0].id}`, { method: "PATCH", body: { properties } });

  const swaps = input.swaps.filter((swap) =>
    slotPages.some((page) => normalizeId(page.id) === normalizeId(swap.slotId)),
  );
  await inBatches(swaps, 3, (swap) => {
    const exercise = EXERCISES[swap.to];
    const weight = exercise.load === "none" || exercise.bodyweightStart ? 0 : null;
    return notion(`/pages/${swap.slotId}`, {
      method: "PATCH",
      body: {
        properties: {
          Name: title(exercise.name),
          "Exercise ID": text(exercise.id),
          // A new movement starts by finding its weight again.
          "Weight (kg)": num(weight),
          Stretch: num(0),
          Stalls: num(0),
        },
      },
    });
  });
}

/* ------------------------------------------------------------------ *
 * Editing the workouts
 * ------------------------------------------------------------------ */

/** Exercises taken out of a workout, which can be put back. */
export async function loadArchivedSlots(): Promise<Slot[]> {
  const dbs = await requireDbs();
  const pages = (await queryAll(dbs.exercises, {
    filter: { property: "Archived", checkbox: { equals: true } },
  })) as Page[];
  return pages.map(toSlot).filter((slot): slot is Slot => slot !== null);
}

/** Notion properties for one change to a programme exercise. */
function slotChanges(slot: Slot | null, update: SlotUpdate): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  let freshStart = false;

  if (update.exerciseId && update.exerciseId !== slot?.exerciseId) {
    const exercise = getExercise(update.exerciseId);
    properties.Name = title(exercise.name);
    properties["Exercise ID"] = text(exercise.id);
    // Reps and holds don't translate: a different kind of move gets its own sets, targets and rest.
    if (!slot || getExercise(slot.exerciseId).kind !== exercise.kind) {
      const prescription = prescriptionFor(exercise);
      const targets = targetsFor(exercise, prescription);
      properties.Sets = num(prescription.sets);
      properties["Rep Min"] = num(targets.repMin);
      properties["Rep Max"] = num(targets.repMax);
      properties.Seconds = num(targets.seconds);
      properties["Max Seconds"] = num(targets.maxSeconds);
      properties["Rest (s)"] = num(prescription.rest);
    }
    if (update.weight === undefined) properties["Weight (kg)"] = num(startingWeight(exercise));
    freshStart = true;
  }

  const numbers: Array<[keyof SlotUpdate, string]> = [
    ["sets", "Sets"],
    ["repMin", "Rep Min"],
    ["repMax", "Rep Max"],
    ["seconds", "Seconds"],
    ["maxSeconds", "Max Seconds"],
    ["rest", "Rest (s)"],
    ["order", "Order"],
  ];
  for (const [key, column] of numbers) {
    const value = update[key];
    if (typeof value === "number") properties[column] = num(value);
  }
  // Keep each range the right way round against what's already stored.
  if (update.repMin !== undefined && update.repMax === undefined && (slot?.repMax ?? 0) < update.repMin) {
    properties["Rep Max"] = num(update.repMin);
  }
  if (update.repMax !== undefined && update.repMin === undefined && (slot?.repMin ?? 0) > update.repMax) {
    properties["Rep Min"] = num(update.repMax);
  }
  if (update.seconds !== undefined && update.maxSeconds === undefined && (slot?.maxSeconds ?? 0) < update.seconds) {
    properties["Max Seconds"] = num(update.seconds);
  }
  if (update.repMin !== undefined || update.repMax !== undefined || update.seconds !== undefined) freshStart = true;

  if (update.weight !== undefined) {
    properties["Weight (kg)"] = num(update.weight);
    freshStart = true;
  }
  // A new target or a new movement starts its progress over.
  if (freshStart) {
    properties.Stretch = num(0);
    properties.Stalls = num(0);
  }
  if (update.archived !== undefined) properties.Archived = { checkbox: update.archived };
  return properties;
}

/**
 * Applies changes from the workout editor. Rows are only ever edited:
 * removing an exercise ticks Archived, so it can be put back with its history.
 */
export async function updateSlots(updates: SlotUpdate[]): Promise<void> {
  const dbs = await requireDbs();
  const pages = (await queryAll(dbs.exercises, {})) as Page[];
  const byId = new Map(pages.map((page) => [normalizeId(page.id), page]));
  for (const update of updates) {
    if (!byId.has(normalizeId(update.id))) throw new InputError("That exercise is no longer in your plan");
  }

  // The plan keeps at least one exercise. (Emptying one workout removes it from the rotation.)
  const archived = new Map(pages.map((page) => [normalizeId(page.id), readCheckbox(page, "Archived")]));
  for (const update of updates) {
    if (update.archived !== undefined) archived.set(normalizeId(update.id), update.archived);
  }
  const had = pages.some((page) => !readCheckbox(page, "Archived"));
  const has = pages.some((page) => !archived.get(normalizeId(page.id)));
  if (had && !has) throw new InputError("Your plan needs at least one exercise");

  await inBatches(updates, 3, (update) => {
    const page = byId.get(normalizeId(update.id))!;
    return notion(`/pages/${page.id}`, {
      method: "PATCH",
      body: { properties: slotChanges(toSlot(page), update) },
    });
  });
}

/** Adds an exercise to the end of a workout, with sensible starting targets. */
export async function addSlot(input: NewSlotInput): Promise<string> {
  const dbs = await requireDbs();
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);
  if (!programmes.length) throw new TrainingSetupError("programme");
  const orders = slotPages
    .map(toSlot)
    .filter((slot): slot is Slot => slot !== null && slot.workout === input.workout)
    .map((slot) => slot.order);
  const order = Math.floor(Math.max(0, ...orders)) + 1;

  const page = await notion<{ id: string }>("/pages", {
    method: "POST",
    body: {
      parent: { database_id: dbs.exercises },
      properties: slotProperties(seedFor(input.exerciseId, input.workout, order)),
    },
  });
  return page.id;
}

/* ------------------------------------------------------------------ *
 * Plans: switching to a ready-made or saved plan, and saving your own
 * ------------------------------------------------------------------ */

/** Rich text split into pieces under Notion's 2,000-character limit. */
function longText(content: string) {
  const pieces = content.match(/[\s\S]{1,1800}/g) ?? [];
  return { rich_text: pieces.map((piece) => ({ text: { content: piece } })) };
}

export type SavedPlan = { id: string; name: string; workouts: PlanWorkout[]; savedAt: string };

/** Your saved plans, newest first. None until the first one is saved. */
export async function loadSavedPlans(): Promise<SavedPlan[]> {
  const { savedPlans } = await discover();
  if (!savedPlans) return [];
  const pages = (await queryAll(savedPlans, {
    filter: { property: "Archived", checkbox: { equals: false } },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  })) as Page[];
  return pages.flatMap((page): SavedPlan[] => {
    const workouts = parseSavedWorkouts(readText(page, "Plan"));
    if (!workouts) return [];
    return [{ id: page.id, name: readTitle(page, "Name") || "Saved plan", workouts, savedAt: page.created_time ?? "" }];
  });
}

/** The "Saved Plans" database, created next to the others the first time a plan is saved. */
async function ensureSavedPlansDb(): Promise<string> {
  const discovery = await discover();
  if (discovery.savedPlans) return discovery.savedPlans;
  if (!discovery.parentId) throw new NotionConfigError("Set NOTION_SAVED_PLANS_DB to save plans.");
  const created = await notion<{ id: string }>("/databases", {
    method: "POST",
    body: {
      parent: { type: "page_id", page_id: discovery.parentId },
      title: [{ type: "text", text: { content: SAVED_PLANS_TITLE } }],
      properties: { Name: { title: {} }, Plan: { rich_text: {} }, Archived: { checkbox: {} } },
    },
  });
  discoveryCache = null;
  return created.id;
}

/** Saves the current workouts (exercises, targets, rest and names) as a plan to come back to. */
export async function saveCurrentAsPlan(name: string): Promise<string> {
  const dbs = await requireDbs();
  const [programmes, slotPages] = await Promise.all([activeProgrammes(dbs), activeSlots(dbs)]);
  if (!programmes.length) throw new TrainingSetupError("programme");
  const slots = slotPages.map(toSlot).filter((slot): slot is Slot => slot !== null);
  if (!slots.length) throw new InputError("There are no exercises to save yet");

  const workouts = snapshotWorkouts(slots, toProgramme(programmes[0]).workoutNames);
  const database = await ensureSavedPlansDb();
  const page = await notion<{ id: string }>("/pages", {
    method: "POST",
    body: {
      parent: { database_id: database },
      properties: { Name: title(name), Plan: longText(serializeWorkouts(workouts)), Archived: { checkbox: false } },
    },
  });
  return page.id;
}

/** Hides a saved plan (Archived), never deletes it. Only rows of Saved Plans can be touched. */
export async function removeSavedPlan(id: string): Promise<void> {
  const plans = await loadSavedPlans();
  if (!plans.some((plan) => normalizeId(plan.id) === normalizeId(id))) throw new InputError("That plan doesn't exist");
  await notion(`/pages/${id}`, { method: "PATCH", body: { properties: { Archived: { checkbox: true } } } });
}

/** Names for the workouts; an empty name removes it. */
export async function renameWorkouts(names: Partial<Record<WorkoutKey, string>>): Promise<void> {
  const dbs = await requireDbs();
  await ensureProgrammeColumns(dbs);
  const programmes = await activeProgrammes(dbs);
  if (!programmes.length) throw new TrainingSetupError("programme");
  const merged = { ...toProgramme(programmes[0]).workoutNames, ...names };
  await notion(`/pages/${programmes[0].id}`, {
    method: "PATCH",
    body: { properties: { "Workout Names": text(formatWorkoutNames(merged)) } },
  });
}

/**
 * Switches to another plan. The current exercises are archived (kept, with
 * their history), the plan's exercises are added, and any weight you've
 * already worked out for an exercise carries over. The rotation starts again
 * from the plan's first workout.
 */
export async function applyPlan(input: ApplyPlanInput): Promise<void> {
  const dbs = await requireDbs();
  await ensureProgrammeColumns(dbs);
  const programmes = await activeProgrammes(dbs);
  if (!programmes.length) throw new TrainingSetupError("programme");
  const programme = toProgramme(programmes[0]);

  let plan: { name: string; workouts: PlanWorkout[] };
  if (input.plan.kind === "builtin") {
    const found = getPlan(input.plan.id);
    if (!found) throw new InputError("Unknown plan");
    plan = found;
  } else {
    const saved = (await loadSavedPlans()).find((candidate) => normalizeId(candidate.id) === normalizeId(input.plan.id));
    if (!saved) throw new InputError("That saved plan no longer exists");
    plan = saved;
  }

  const seeds = seedsForPlan(plan, programme.equipment);
  if (!seeds.length) throw new InputError("None of this plan's exercises work with your equipment");

  if (input.saveCurrentAs) await saveCurrentAsPlan(input.saveCurrentAs);

  // The weight already worked out for each exercise: the current one first, then the latest removed one.
  const pages = (await queryAll(dbs.exercises, {})) as Page[];
  const ranked = [...pages].sort(
    (a, b) =>
      Number(readCheckbox(a, "Archived")) - Number(readCheckbox(b, "Archived")) ||
      String(b.last_edited_time ?? "").localeCompare(String(a.last_edited_time ?? "")),
  );
  const known = new Map<string, number>();
  for (const page of ranked) {
    const exerciseId = readText(page, "Exercise ID");
    const weight = readNumber(page, "Weight (kg)");
    if (exerciseId && weight !== null && !known.has(exerciseId)) known.set(exerciseId, weight);
  }

  const active = pages.filter((page) => !readCheckbox(page, "Archived"));
  await inBatches(active, 3, (page) =>
    notion(`/pages/${page.id}`, { method: "PATCH", body: { properties: { Archived: { checkbox: true } } } }),
  );

  await inBatches(seeds, 3, (seed) => {
    const weight = known.get(seed.exerciseId);
    // A plan that starts a move with a dumbbell doesn't drop back to bodyweight.
    const carried = weight === undefined || (weight === 0 && seed.weight === null) ? seed : { ...seed, weight };
    return notion("/pages", {
      method: "POST",
      body: { parent: { database_id: dbs.exercises }, properties: slotProperties(carried) },
    });
  });

  const names = Object.fromEntries(plan.workouts.flatMap((workout) => (workout.name ? [[workout.key, workout.name]] : [])));
  const properties: Record<string, unknown> = {
    Name: title(plan.name),
    "Workout Names": text(formatWorkoutNames(names)),
  };
  if (input.days) {
    properties["Training Days"] = { multi_select: input.days.trainingDays.map((name) => ({ name })) };
    properties["Back Care Days"] = { multi_select: input.days.backCareDays.map((name) => ({ name })) };
  }
  const updated = await notion<{ last_edited_time?: string }>(`/pages/${programmes[0].id}`, {
    method: "PATCH",
    body: { properties },
  });
  // The switch is timed by Notion's own clock, the same one that stamps logged workouts,
  // so "workouts since the switch" never depends on two clocks agreeing.
  await notion(`/pages/${programmes[0].id}`, {
    method: "PATCH",
    body: { properties: { "Plan Since": text(updated.last_edited_time ?? new Date().toISOString()) } },
  });
}
