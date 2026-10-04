import { getExercise } from "./exercises";
import type { Equipment, Level, Slot, WorkoutKey } from "./types";

/**
 * The home dumbbell programme: two full-body workouts, alternated. Chosen for
 * a beginner aiming at general fitness with a lower back that needs care:
 * front-loaded or floor-supported lifts, a light hip hinge to strengthen the
 * back, and core work that trains the spine to stay still.
 */

export type SlotSeed = Omit<Slot, "id" | "lastSession" | "lastDone">;

type Entry = {
  exerciseId: string;
  workout: WorkoutKey;
  sets: number;
  reps?: [number, number];
  seconds?: [number, number];
  rest: number;
};

export const WORKOUT_NAMES: Record<WorkoutKey, string> = {
  A: "Squat · Press · Row",
  B: "Hinge · Lunge · Press",
};

const PROGRAMME: Entry[] = [
  { exerciseId: "goblet-squat", workout: "A", sets: 3, reps: [10, 15], rest: 90 },
  { exerciseId: "floor-press", workout: "A", sets: 3, reps: [10, 15], rest: 90 },
  { exerciseId: "one-arm-row", workout: "A", sets: 3, reps: [10, 15], rest: 60 },
  { exerciseId: "glute-bridge", workout: "A", sets: 2, reps: [12, 20], rest: 60 },
  { exerciseId: "dead-bug", workout: "A", sets: 2, reps: [6, 10], rest: 45 },

  { exerciseId: "romanian-deadlift", workout: "B", sets: 3, reps: [10, 15], rest: 90 },
  { exerciseId: "split-squat", workout: "B", sets: 3, reps: [8, 12], rest: 60 },
  { exerciseId: "shoulder-press", workout: "B", sets: 3, reps: [10, 15], rest: 60 },
  { exerciseId: "bird-dog", workout: "B", sets: 2, reps: [6, 10], rest: 45 },
  { exerciseId: "side-plank", workout: "B", sets: 2, seconds: [20, 45], rest: 45 },
];

/** The programme's own exercise behind an equipment-specific variant. */
export function canonicalExercise(exerciseId: string): string {
  const variants: Record<string, string> = {
    "floor-press-one-arm": "floor-press",
    "bench-press": "floor-press",
    "romanian-deadlift-single": "romanian-deadlift",
    "split-squat-goblet": "split-squat",
  };
  return variants[exerciseId] ?? exerciseId;
}

/** Swaps for what you own: a bench, or a single handle. */
export function substitute(exerciseId: string, equipment: Equipment): string {
  if (equipment.handles < 2) {
    const single: Record<string, string> = {
      "floor-press": "floor-press-one-arm",
      "bench-press": "floor-press-one-arm",
      "romanian-deadlift": "romanian-deadlift-single",
      "split-squat": "split-squat-goblet",
    };
    return single[exerciseId] ?? exerciseId;
  }
  if (equipment.bench && exerciseId === "floor-press") return "bench-press";
  return exerciseId;
}

export function buildSlots(equipment: Equipment): SlotSeed[] {
  const order: Record<WorkoutKey, number> = { A: 0, B: 0 };

  return PROGRAMME.map((entry) => {
    const exerciseId = substitute(entry.exerciseId, equipment);
    const exercise = getExercise(exerciseId);
    order[entry.workout] += 1;

    return {
      exerciseId,
      workout: entry.workout,
      order: order[entry.workout],
      sets: entry.sets,
      repMin: entry.reps?.[0] ?? null,
      repMax: entry.reps?.[1] ?? null,
      seconds: entry.seconds?.[0] ?? null,
      maxSeconds: entry.seconds?.[1] ?? null,
      rest: entry.rest,
      // Loaded lifts start by finding your weight; bodyweight moves start at 0.
      weight: exercise.load === "none" || exercise.bodyweightStart ? 0 : null,
      stretch: 0,
      stalls: 0,
    };
  });
}

/** Beginners ease in: at most two sets per exercise in weeks 1–2. */
export const RAMP_WEEKS = 2;

export function setsForWeek(sets: number, week: number, level: Level): number {
  return level === "beginner" && week <= RAMP_WEEKS ? Math.min(sets, 2) : sets;
}

export function slotsFor(slots: Slot[], workout: WorkoutKey): Slot[] {
  return slots.filter((slot) => slot.workout === workout).sort((a, b) => a.order - b.order);
}

/** Rough wall-clock length: warm-up, every set (≈3 s a rep), rests, changeovers. */
export function estimateMinutes(slots: Slot[], week: number, level: Level): number {
  let seconds = 5 * 60;
  for (const slot of slots) {
    const exercise = getExercise(slot.exerciseId);
    const sides = exercise.perSide ? 2 : 1;
    const sets = setsForWeek(slot.sets, week, level);
    const reps = ((slot.repMin ?? 0) + (slot.repMax ?? 0)) / 2;
    const work = exercise.kind === "timed" ? (slot.seconds ?? 0) * sides + 5 : reps * 3 * sides;
    seconds += sets * work + (sets - 1) * slot.rest + 60;
  }
  return Math.round(seconds / 60);
}
