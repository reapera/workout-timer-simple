import { canDo } from "./customize";
import { getExercise, type ExerciseDef, type Pattern, type Prescription } from "./exercises";
import { DEFAULT_PLAN, type Plan } from "./plans";
import type { Equipment, Level, Programme, Slot, WorkoutKey } from "./types";

/**
 * Turning a plan into programme rows, plus the defaults and labels that go
 * with them. The starting plan (two full-body workouts, alternated) is chosen
 * for a beginner aiming at general fitness with a lower back that needs care:
 * front-loaded or floor-supported lifts, a light hip hinge to strengthen the
 * back, and core work that trains the spine to stay still.
 */

export type SlotSeed = Omit<Slot, "id" | "lastSession" | "lastDone">;

/** What the starting plan's two workouts are made of, for the exercise library. */
export const WORKOUT_NAMES: Record<"A" | "B", string> = {
  A: "Squat · Press · Row",
  B: "Hinge · Lunge · Press",
};

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
      "farmer-carry": "suitcase-carry",
    };
    return single[exerciseId] ?? exerciseId;
  }
  if (equipment.bench && exerciseId === "floor-press") return "bench-press";
  return exerciseId;
}

/** What a newly added exercise starts with: its own default, the plan's, or one by kind. */
export function prescriptionFor(exercise: ExerciseDef): Prescription {
  if (exercise.prescription) return exercise.prescription;
  const entry = DEFAULT_PLAN.workouts
    .flatMap((workout) => workout.entries)
    .find((candidate) => candidate.exerciseId === canonicalExercise(exercise.id));
  if (entry) return { sets: entry.sets, reps: entry.reps, seconds: entry.seconds, rest: entry.rest };
  if (exercise.kind === "timed") return { sets: 2, seconds: [20, 45], rest: 45 };
  return exercise.load === "none" ? { sets: 2, reps: [8, 12], rest: 45 } : { sets: 3, reps: [10, 15], rest: 90 };
}

/** Loaded lifts start by finding your weight; bodyweight moves start at 0. */
export function startingWeight(exercise: ExerciseDef): number | null {
  return exercise.load === "none" || exercise.bodyweightStart ? 0 : null;
}

/** A programme row for an exercise added to a workout. */
export function seedFor(exerciseId: string, workout: WorkoutKey, order: number): SlotSeed {
  const exercise = getExercise(exerciseId);
  const prescription = prescriptionFor(exercise);
  return {
    exerciseId,
    workout,
    order,
    sets: prescription.sets,
    ...targetsFor(exercise, prescription),
    rest: prescription.rest,
    weight: startingWeight(exercise),
    stretch: 0,
    stalls: 0,
  };
}

/** Reps for counted moves, seconds for holds; the other pair is cleared. */
export function targetsFor(
  exercise: ExerciseDef,
  prescription: Prescription = prescriptionFor(exercise),
): Pick<Slot, "repMin" | "repMax" | "seconds" | "maxSeconds"> {
  if (exercise.kind === "timed") {
    const [seconds, maxSeconds] = prescription.seconds ?? [20, 45];
    return { repMin: null, repMax: null, seconds, maxSeconds };
  }
  const [repMin, repMax] = prescription.reps ?? [8, 12];
  return { repMin, repMax, seconds: null, maxSeconds: null };
}

const SHORT_NAMES: Record<Pattern, string> = {
  squat: "Squat",
  lunge: "Lunge",
  hinge: "Hinge",
  glutes: "Glutes",
  push: "Press",
  overhead: "Press",
  pull: "Row",
  arms: "Arms",
  calves: "Calves",
  core: "Core",
  mobility: "Mobility",
};

/** "Squat · Press · Row": the first three kinds of move in a workout. */
export function workoutName(slots: Slot[]): string {
  const names = [...new Set(slots.map((slot) => SHORT_NAMES[getExercise(slot.exerciseId).pattern]))];
  return names.slice(0, 3).join(" · ") || "No exercises yet";
}

/**
 * Programme rows for a plan, matched to your equipment: one-handle and bench
 * variants swapped in, and anything your dumbbells can't do left out.
 */
export function seedsForPlan(plan: Pick<Plan, "workouts">, equipment: Equipment): SlotSeed[] {
  return plan.workouts.flatMap((workout) => {
    let order = 0;
    return workout.entries.flatMap((entry): SlotSeed[] => {
      const exerciseId = substitute(entry.exerciseId, equipment);
      const exercise = getExercise(exerciseId);
      if (!canDo(exercise, equipment)) return [];
      order += 1;
      return [
        {
          exerciseId,
          workout: workout.key,
          order,
          sets: entry.sets,
          ...targetsFor(exercise, entry),
          rest: entry.rest,
          // Loaded lifts start by finding your weight; bodyweight moves start at 0 unless the plan says otherwise.
          weight: entry.loaded && exercise.load !== "none" ? null : startingWeight(exercise),
          stretch: 0,
          stalls: 0,
        },
      ];
    });
  });
}

/** The starting plan's rows. */
export function buildSlots(equipment: Equipment): SlotSeed[] {
  return seedsForPlan(DEFAULT_PLAN, equipment);
}

/** "Upper body", or "Workout A" for an unnamed workout. */
export function workoutTitle(programme: Pick<Programme, "workoutNames">, workout: WorkoutKey): string {
  // `?.`: a plan cached on the phone by an older version has no names.
  return programme.workoutNames?.[workout]?.trim() || `Workout ${workout}`;
}

/** One or two characters for the week strip: "U" for Upper body, else the letter. */
export function workoutInitials(
  programme: Pick<Programme, "workoutNames">,
  rotation: readonly WorkoutKey[],
): Record<WorkoutKey, string> {
  const initials = Object.fromEntries(
    rotation.map((key) => [key, programme.workoutNames?.[key]?.trim().charAt(0).toUpperCase() || key]),
  ) as Record<WorkoutKey, string>;
  // Two names starting with the same letter would be ambiguous: use the letters instead.
  const values = rotation.map((key) => initials[key]);
  if (new Set(values).size !== values.length) for (const key of rotation) initials[key] = key;
  return initials;
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
export function estimateMinutes(slots: Slot[], week: number, level: Level, deload = false): number {
  let seconds = 5 * 60;
  for (const slot of slots) {
    const exercise = getExercise(slot.exerciseId);
    const sides = exercise.perSide ? 2 : 1;
    const normal = setsForWeek(slot.sets, week, level);
    const sets = deload ? Math.max(1, normal - 1) : normal;
    const reps = ((slot.repMin ?? 0) + (slot.repMax ?? 0)) / 2;
    const work = exercise.kind === "timed" ? (slot.seconds ?? 0) * sides + 5 : reps * 3 * sides;
    seconds += sets * work + (sets - 1) * slot.rest + 60;
  }
  return Math.round(seconds / 60);
}
