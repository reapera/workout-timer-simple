import { getExercise, PATTERN_LABELS, STRENGTH_EXERCISES, type ExerciseDef, type Pattern } from "./exercises";
import type { Equipment, Slot } from "./types";
import type { SlotUpdate } from "./validate";

/**
 * Helpers for editing the workouts: what can be swapped in, what can be
 * added, and the changes that turn every exercise into a dumbbell one.
 */

/** Dumbbell versions of the bodyweight core moves, chosen to train the same job. */
export const DUMBBELL_VERSION: Readonly<Record<string, string>> = {
  // Keeping the spine still while the limbs move.
  "dead-bug": "dumbbell-dead-bug",
  // Bracing against a load trying to bend or twist you.
  "bird-dog": "farmer-carry",
  // Resisting being pulled sideways, like a side plank you can load.
  "side-plank": "suitcase-carry",
};

/** Two-dumbbell moves need two handles; the bench press needs a bench. */
export function canDo(exercise: ExerciseDef, equipment: Equipment): boolean {
  if (exercise.load === "pair" && equipment.handles < 2) return false;
  if (exercise.id === "bench-press" && !equipment.bench) return false;
  return true;
}

/** The programme's own exercise behind an equipment-specific variant. */
export function canonicalExercise(exerciseId: string): string {
  const variants: Record<string, string> = {
    "floor-press-one-arm": "floor-press",
    "bench-press": "floor-press",
    "romanian-deadlift-single": "romanian-deadlift",
    "split-squat-goblet": "split-squat",
    "dumbbell-dead-bug-single": "dumbbell-dead-bug",
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
      "dumbbell-dead-bug": "dumbbell-dead-bug-single",
    };
    return single[exerciseId] ?? exerciseId;
  }
  if (equipment.bench && exerciseId === "floor-press") return "bench-press";
  return exerciseId;
}

/** Uses a dumbbell today: not bodyweight-only, and not still at bodyweight. */
export function slotUsesDumbbell(slot: Pick<Slot, "exerciseId" | "weight">): boolean {
  return getExercise(slot.exerciseId).load !== "none" && slot.weight !== 0;
}

/** Changes that make every exercise a dumbbell one. Empty when they all are. */
export function dumbbellOnlyChanges(slots: Slot[], equipment: Equipment): SlotUpdate[] {
  return slots.flatMap((slot): SlotUpdate[] => {
    const swap = DUMBBELL_VERSION[slot.exerciseId];
    if (swap) {
      // The version for these dumbbells: with one handle, the one-dumbbell carry and dead bug.
      const version = substitute(swap, equipment);
      const to = canDo(getExercise(version), equipment) ? version : "suitcase-carry";
      return [{ id: slot.id, exerciseId: to }];
    }
    const exercise = getExercise(slot.exerciseId);
    // Moves that start at bodyweight pick up a dumbbell straight away.
    if (exercise.load !== "none" && slot.weight === 0) return [{ id: slot.id, weight: null }];
    return [];
  });
}

export type ExerciseGroup = { pattern: Pattern; label: string; exercises: ExerciseDef[] };

/**
 * Strength exercises in movement groups, for the add and swap pickers. With
 * `prefer`, that group comes first (similar moves to the one being swapped).
 */
export function exerciseGroups(
  equipment: Equipment,
  options: { dumbbellOnly?: boolean; exclude?: string[]; prefer?: Pattern } = {},
): ExerciseGroup[] {
  const exclude = new Set(options.exclude ?? []);
  const patterns = Object.keys(PATTERN_LABELS).filter((pattern) => pattern !== "mobility") as Pattern[];
  if (options.prefer) patterns.sort((a, b) => Number(b === options.prefer) - Number(a === options.prefer));

  return patterns
    .map((pattern) => ({
      pattern,
      label: PATTERN_LABELS[pattern],
      exercises: STRENGTH_EXERCISES.filter(
        (exercise) =>
          exercise.pattern === pattern &&
          !exclude.has(exercise.id) &&
          canDo(exercise, equipment) &&
          (!options.dumbbellOnly || exercise.load !== "none"),
      ),
    }))
    .filter((group) => group.exercises.length > 0);
}
