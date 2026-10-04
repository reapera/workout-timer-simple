import type { Routine } from "../types";

/**
 * Timed routines that belong to the programme, run on the existing spoken
 * timer. They live in code rather than Notion because the Today screen links
 * each move to its guide in the exercise library.
 */

export type Move = {
  /** Spoken aloud by the timer, so it should read naturally. */
  name: string;
  exerciseId: string;
  seconds: number;
};

export type BuiltinRoutine = {
  id: string;
  name: string;
  summary: string;
  moves: Move[];
};

/** Ids with this prefix are not Notion pages and must never be written to. */
export const BUILTIN_PREFIX = "builtin-";

export const WARM_UP: BuiltinRoutine = {
  id: `${BUILTIN_PREFIX}warm-up`,
  name: "Warm-up",
  summary: "Gets your joints moving and your back ready before lifting.",
  moves: [
    { name: "March in place", exerciseId: "march", seconds: 40 },
    { name: "Arm circles", exerciseId: "arm-circles", seconds: 30 },
    { name: "Cat cow", exerciseId: "cat-cow", seconds: 40 },
    { name: "Hip hinge", exerciseId: "hip-hinge", seconds: 40 },
    { name: "Bodyweight squat", exerciseId: "bodyweight-squat", seconds: 40 },
    { name: "Glute bridge", exerciseId: "glute-bridge", seconds: 30 },
  ],
};

export const BACK_CARE: BuiltinRoutine = {
  id: `${BUILTIN_PREFIX}back-care`,
  name: "Back Care",
  summary: "Gentle core and mobility work that keeps your lower back strong between lifting days.",
  moves: [
    { name: "Cat cow", exerciseId: "cat-cow", seconds: 45 },
    { name: "Bird dog, alternating sides", exerciseId: "bird-dog", seconds: 60 },
    { name: "Dead bug", exerciseId: "dead-bug", seconds: 45 },
    { name: "Glute bridge", exerciseId: "glute-bridge", seconds: 45 },
    { name: "Side plank, left side", exerciseId: "side-plank", seconds: 20 },
    { name: "Side plank, right side", exerciseId: "side-plank", seconds: 20 },
    { name: "Knee to chest, left", exerciseId: "knee-to-chest", seconds: 30 },
    { name: "Knee to chest, right", exerciseId: "knee-to-chest", seconds: 30 },
    { name: "Hip flexor stretch, left", exerciseId: "hip-flexor-stretch", seconds: 30 },
    { name: "Hip flexor stretch, right", exerciseId: "hip-flexor-stretch", seconds: 30 },
    { name: "Child's pose", exerciseId: "childs-pose", seconds: 40 },
  ],
};

/** Adapts a built-in routine to the shape the timer engine runs. */
export function asRoutine(routine: BuiltinRoutine): Routine {
  return {
    id: routine.id,
    name: routine.name,
    isDefault: false,
    lastUsed: null,
    exercises: routine.moves.map((move, index) => ({
      id: `${routine.id}-${index}`,
      name: move.name,
      duration: move.seconds,
    })),
  };
}

export function isBuiltin(routineId: string): boolean {
  return routineId.startsWith(BUILTIN_PREFIX);
}

// Built once: the timer restarts if handed a new routine object mid-run.
export const WARM_UP_ROUTINE = asRoutine(WARM_UP);
export const BACK_CARE_ROUTINE = asRoutine(BACK_CARE);
