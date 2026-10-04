import { DEFAULT_EQUIPMENT } from "./equipment";
import { DAYS, type BackFeel, type DayName, type Effort, type Equipment, type ExerciseLog, type Level, type SessionLog } from "./types";

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
  };
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
  if (raw.workout !== "A" && raw.workout !== "B") throw new InputError("workout must be A or B");
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
