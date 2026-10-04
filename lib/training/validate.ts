import { DEFAULT_EQUIPMENT } from "./equipment";
import { EXERCISES } from "./exercises";
import {
  DAYS,
  isWorkoutKey,
  WORKOUT_KEYS,
  type BackFeel,
  type DayName,
  type Effort,
  type Equipment,
  type ExerciseLog,
  type Level,
  type SessionLog,
  type WorkoutKey,
} from "./types";

/**
 * Guards for what the browser sends. Anything malformed is rejected before it
 * gets near Notion; numbers are clamped to sane ranges.
 */

export class InputError extends Error {}

export type ProgrammeInput = {
  startDate: string;
  trainingDays: DayName[];
  backCareDays: DayName[];
  equipment: Equipment;
  level: Level;
  backPain: boolean;
  /** "HH:MM", or null to clear; left out = unchanged. */
  reminderTime?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EFFORTS: Effort[] = ["easy", "good", "hard", "too_hard"];
const BACK_FEELS: BackFeel[] = ["none", "mild", "pain"];

function record(input: unknown, what: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InputError(`Expected ${what}`);
  }
  return input as Record<string, unknown>;
}

function number(value: unknown, min: number, max: number, fallback?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    throw new InputError(`Expected a number between ${min} and ${max}`);
  }
  return Math.min(max, Math.max(min, parsed));
}

function days(value: unknown): DayName[] {
  if (!Array.isArray(value)) return [];
  return DAYS.filter((day) => value.includes(day));
}

export function parseEquipment(input: unknown): Equipment {
  const raw = record(input, "equipment");
  const plates = Array.isArray(raw.plates)
    ? raw.plates
        .map((plate) => record(plate, "a plate"))
        .map((plate) => ({
          size: Math.round(number(plate.size, 0, 50) * 1000) / 1000,
          count: Math.round(number(plate.count, 0, 40)),
        }))
        .filter((plate) => plate.size > 0 && plate.count > 0)
        .slice(0, 12)
    : DEFAULT_EQUIPMENT.plates;

  return {
    handles: Number(raw.handles) === 1 ? 1 : 2,
    handleWeight: Math.round(number(raw.handleWeight, 0, 30, DEFAULT_EQUIPMENT.handleWeight) * 100) / 100,
    plates,
    platesPerSide: Math.round(number(raw.platesPerSide, 1, 8, DEFAULT_EQUIPMENT.platesPerSide)),
    bench: raw.bench === true,
  };
}

export function parseProgrammeInput(input: unknown): ProgrammeInput {
  const raw = record(input, "a JSON object");

  if (typeof raw.startDate !== "string" || !ISO_DATE.test(raw.startDate)) {
    throw new InputError("startDate must be YYYY-MM-DD");
  }
  const trainingDays = days(raw.trainingDays);
  if (!trainingDays.length) throw new InputError("Pick at least one training day");
  const backCareDays = days(raw.backCareDays).filter((day) => !trainingDays.includes(day));

  return {
    startDate: raw.startDate,
    trainingDays,
    backCareDays,
    equipment: parseEquipment(raw.equipment ?? {}),
    level: raw.level === "intermediate" ? "intermediate" : "beginner",
    backPain: raw.backPain === true,
    ...(raw.reminderTime === undefined ? {} : { reminderTime: parseTime(raw.reminderTime) }),
  };
}

function parseTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new InputError("Reminder time must be HH:MM");
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseExerciseLog(input: unknown): ExerciseLog {
  const raw = record(input, "an exercise");
  if (typeof raw.slotId !== "string" || !raw.slotId || raw.slotId.length > 64) {
    throw new InputError("Each exercise needs a slotId");
  }
  if (typeof raw.exerciseId !== "string" || !raw.exerciseId || raw.exerciseId.length > 64) {
    throw new InputError("Each exercise needs an exerciseId");
  }
  const sets = Array.isArray(raw.sets) ? raw.sets.slice(0, 12) : [];

  return {
    slotId: raw.slotId,
    exerciseId: raw.exerciseId,
    plannedSets: Math.round(number(raw.plannedSets, 1, 12, 1)),
    sets: sets.map((set) => {
      const entry = record(set, "a set");
      return {
        weight: Math.round(number(entry.weight, 0, 250) * 1000) / 1000,
        value: Math.round(number(entry.value, 0, 3600)),
      };
    }),
    effort: EFFORTS.includes(raw.effort as Effort) ? (raw.effort as Effort) : null,
    back: BACK_FEELS.includes(raw.back as BackFeel) ? (raw.back as BackFeel) : null,
    note: typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : undefined,
  };
}

export function parseSessionLog(input: unknown): SessionLog {
  const raw = record(input, "a JSON object");

  if (typeof raw.id !== "string" || !/^[\w-]{8,64}$/.test(raw.id)) {
    throw new InputError("A session needs an id");
  }
  if (!isWorkoutKey(raw.workout)) throw new InputError("workout must be A, B, C or D");
  if (typeof raw.date !== "string" || !ISO_DATE.test(raw.date)) {
    throw new InputError("date must be YYYY-MM-DD");
  }
  if (!Array.isArray(raw.exercises) || raw.exercises.length > 20) {
    throw new InputError("exercises must be a list of up to 20");
  }

  const exercises = raw.exercises.map(parseExerciseLog);
  if (!exercises.some((exercise) => exercise.sets.length)) {
    throw new InputError("A session with no completed sets is not logged");
  }

  return {
    id: raw.id,
    workout: raw.workout,
    date: raw.date,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt.slice(0, 40) : new Date().toISOString(),
    elapsedSeconds: Math.round(number(raw.elapsedSeconds, 0, 6 * 3600, 0)),
    exercises,
  };
}

export type BodyWeightInput = { date: string; kg: number; bodyFat: number | null };

export function parseBodyWeight(input: unknown): BodyWeightInput {
  const raw = record(input, "a JSON object");
  if (typeof raw.date !== "string" || !ISO_DATE.test(raw.date)) throw new InputError("date must be YYYY-MM-DD");
  const kg = Number(raw.kg);
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) throw new InputError("Weight must be between 20 and 400 kg");
  const fat = raw.bodyFat === null || raw.bodyFat === undefined || raw.bodyFat === "" ? null : Number(raw.bodyFat);
  if (fat !== null && (!Number.isFinite(fat) || fat < 2 || fat > 70)) throw new InputError("Body fat must be between 2 and 70%");
  return { date: raw.date, kg: Math.round(kg * 10) / 10, bodyFat: fat === null ? null : Math.round(fat * 10) / 10 };
}

export type ReviewInput = {
  block: number;
  today: string;
  deload: boolean;
  swaps: Array<{ slotId: string; to: string }>;
  schedule?: { trainingDays: DayName[]; backCareDays: DayName[] };
};

export function parseReview(input: unknown): ReviewInput {
  const raw = record(input, "a JSON object");
  const block = Math.round(number(raw.block, 1, 520));
  if (typeof raw.today !== "string" || !ISO_DATE.test(raw.today)) throw new InputError("today must be YYYY-MM-DD");
  const swaps = (Array.isArray(raw.swaps) ? raw.swaps : []).slice(0, 10).map((item) => {
    const swap = record(item, "a swap");
    if (typeof swap.slotId !== "string" || !swap.slotId || swap.slotId.length > 64) throw new InputError("A swap needs a slotId");
    if (typeof swap.to !== "string" || !(swap.to in EXERCISES)) throw new InputError("Unknown exercise to swap to");
    return { slotId: swap.slotId, to: swap.to };
  });

  let schedule: ReviewInput["schedule"];
  if (raw.schedule !== undefined && raw.schedule !== null) {
    const value = record(raw.schedule, "a schedule");
    const trainingDays = days(value.trainingDays);
    if (!trainingDays.length) throw new InputError("Pick at least one training day");
    schedule = { trainingDays, backCareDays: days(value.backCareDays).filter((day) => !trainingDays.includes(day)) };
  }

  return { block, today: raw.today, deload: raw.deload === true, swaps, schedule };
}

/* ------------------------------------------------------------------ *
 * Editing the workouts
 * ------------------------------------------------------------------ */

/** One change to a programme exercise. Anything left out stays as it is. */
export type SlotUpdate = {
  id: string;
  /** Swap for another exercise; its weight is found again. */
  exerciseId?: string;
  sets?: number;
  repMin?: number;
  repMax?: number;
  seconds?: number;
  maxSeconds?: number;
  rest?: number;
  /** kg per dumbbell; 0 = bodyweight; null = find it again next session. */
  weight?: number | null;
  order?: number;
  /** Removed from the workout (kept in Notion, can be put back). */
  archived?: boolean;
};

export type NewSlotInput = { workout: WorkoutKey; exerciseId: string };

const ROW_ID = /^[A-Za-z0-9-]{1,64}$/;

function strengthExercise(value: unknown): string {
  if (typeof value !== "string" || !(value in EXERCISES) || EXERCISES[value].pattern === "mobility") {
    throw new InputError("Unknown exercise");
  }
  return value;
}

export function parseSlotUpdates(input: unknown): SlotUpdate[] {
  const raw = record(input, "a JSON object");
  if (!Array.isArray(raw.updates) || !raw.updates.length) throw new InputError("Nothing to change");
  if (raw.updates.length > 40) throw new InputError("Too many changes at once");

  return raw.updates.map((item) => {
    const change = record(item, "a change");
    if (typeof change.id !== "string" || !ROW_ID.test(change.id)) throw new InputError("A change needs an exercise row id");
    const update: SlotUpdate = { id: change.id };
    const whole = (key: string, min: number, max: number) =>
      change[key] === undefined ? undefined : Math.round(number(change[key], min, max));

    if (change.exerciseId !== undefined) update.exerciseId = strengthExercise(change.exerciseId);
    const fields = {
      sets: whole("sets", 1, 6),
      repMin: whole("repMin", 1, 50),
      repMax: whole("repMax", 1, 60),
      seconds: whole("seconds", 5, 300),
      maxSeconds: whole("maxSeconds", 5, 600),
      rest: whole("rest", 0, 600),
      order: whole("order", 1, 99),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) (update as Record<string, unknown>)[key] = value;
    }
    if (change.weight !== undefined) {
      update.weight = change.weight === null ? null : Math.round(number(change.weight, 0, 200) * 1000) / 1000;
    }
    if (change.archived !== undefined) update.archived = change.archived === true;

    if (update.repMin !== undefined && update.repMax !== undefined && update.repMax < update.repMin) {
      throw new InputError("The top of the rep range can't be below the bottom");
    }
    if (update.seconds !== undefined && update.maxSeconds !== undefined && update.maxSeconds < update.seconds) {
      throw new InputError("The longest hold can't be shorter than the target");
    }
    return update;
  });
}

export function parseNewSlot(input: unknown): NewSlotInput {
  const raw = record(input, "a JSON object");
  if (!isWorkoutKey(raw.workout)) throw new InputError("workout must be A, B, C or D");
  return { workout: raw.workout, exerciseId: strengthExercise(raw.exerciseId) };
}

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

export type ApplyPlanInput = {
  /** A ready-made plan's id, or the Notion row id of a saved plan. */
  plan: { kind: "builtin" | "saved"; id: string };
  /** New training and back care days, if they should change too. */
  days?: { trainingDays: DayName[]; backCareDays: DayName[] };
  /** Save the current workouts under this name first, to switch back later. */
  saveCurrentAs?: string;
};

function planName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new InputError("Give the plan a name");
  return value.trim().slice(0, 60);
}

export function parseApplyPlan(input: unknown): ApplyPlanInput {
  const raw = record(input, "a JSON object");
  const plan = record(raw.plan, "a plan");
  if (plan.kind !== "builtin" && plan.kind !== "saved") throw new InputError("Unknown kind of plan");
  if (typeof plan.id !== "string" || !ROW_ID.test(plan.id)) throw new InputError("Unknown plan");

  const result: ApplyPlanInput = { plan: { kind: plan.kind, id: plan.id } };
  if (raw.days !== undefined && raw.days !== null) {
    const value = record(raw.days, "days");
    const trainingDays = days(value.trainingDays);
    if (!trainingDays.length) throw new InputError("Pick at least one training day");
    result.days = { trainingDays, backCareDays: days(value.backCareDays).filter((day) => !trainingDays.includes(day)) };
  }
  if (raw.saveCurrentAs !== undefined && raw.saveCurrentAs !== null) result.saveCurrentAs = planName(raw.saveCurrentAs);
  return result;
}

export function parseSavePlan(input: unknown): { name: string } {
  return { name: planName(record(input, "a JSON object").name) };
}

export function parsePlanId(input: unknown): { id: string } {
  const raw = record(input, "a JSON object");
  if (typeof raw.id !== "string" || !ROW_ID.test(raw.id)) throw new InputError("Unknown plan");
  return { id: raw.id };
}

/** Workout names to set; an empty name goes back to "Workout A". */
export function parseWorkoutNamesInput(input: unknown): Partial<Record<WorkoutKey, string>> {
  const raw = record(record(input, "a JSON object").names, "names");
  const names: Partial<Record<WorkoutKey, string>> = {};
  for (const key of WORKOUT_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new InputError("A workout name must be text");
    names[key] = value.replace(/[;\n]/g, " ").trim().slice(0, 40);
  }
  return names;
}
