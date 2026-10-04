import { EXERCISES } from "./exercises";
import { isWorkoutKey, WORKOUT_KEYS, type DayName, type Slot, type WorkoutKey } from "./types";

/**
 * Ready-made plans that can be copied into the workouts. Each is built on
 * the same rules as the starting plan: back-friendly versions of every move,
 * the hip hinge early while fresh, and the core work that protects the back.
 */

export type PlanEntry = {
  exerciseId: string;
  sets: number;
  reps?: [number, number];
  seconds?: [number, number];
  rest: number;
  /** Start with a dumbbell even though the move can begin at bodyweight. */
  loaded?: boolean;
};

export type PlanWorkout = {
  key: WorkoutKey;
  /** Shown instead of "Workout A". */
  name?: string;
  entries: PlanEntry[];
};

export type DayOption = {
  label: string;
  detail: string;
  trainingDays: DayName[];
  backCareDays: DayName[];
};

export type Plan = {
  id: string;
  name: string;
  summary: string;
  /** Why it's built this way, in a sentence or two. */
  why: string;
  workouts: PlanWorkout[];
  /** Suggested weeks; the first is recommended. */
  days: DayOption[];
};

const THREE_DAYS: DayOption = {
  label: "3 days: Mon · Wed · Fri",
  detail: "With back care on Tue, Thu and Sat.",
  trainingDays: ["Mon", "Wed", "Fri"],
  backCareDays: ["Tue", "Thu", "Sat"],
};

export const PLANS: readonly Plan[] = [
  {
    id: "full-body",
    name: "Full body A/B",
    summary: "Two full-body workouts, alternated. The starting plan.",
    why: "Every session works legs, pushing, pulling and core, so each muscle gets trained about twice a week — the quickest way for a beginner to get stronger, in short sessions.",
    workouts: [
      {
        key: "A",
        entries: [
          { exerciseId: "goblet-squat", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "floor-press", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "one-arm-row", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "glute-bridge", sets: 2, reps: [12, 20], rest: 60 },
          { exerciseId: "dead-bug", sets: 2, reps: [6, 10], rest: 45 },
        ],
      },
      {
        key: "B",
        entries: [
          { exerciseId: "romanian-deadlift", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "split-squat", sets: 3, reps: [8, 12], rest: 60 },
          { exerciseId: "shoulder-press", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "bird-dog", sets: 2, reps: [6, 10], rest: 45 },
          { exerciseId: "side-plank", sets: 2, seconds: [20, 45], rest: 45 },
        ],
      },
    ],
    days: [THREE_DAYS],
  },
  {
    id: "full-body-dumbbells",
    name: "Full body, dumbbells only",
    summary: "The starting plan with a dumbbell in every exercise.",
    why: "Same structure, but the core moves are loaded versions (dumbbell dead bug, carries) and the bridge and split squat start with a dumbbell. The core work stays because it protects your back.",
    workouts: [
      {
        key: "A",
        entries: [
          { exerciseId: "goblet-squat", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "floor-press", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "one-arm-row", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "glute-bridge", sets: 2, reps: [12, 20], rest: 60, loaded: true },
          { exerciseId: "dumbbell-dead-bug", sets: 2, reps: [6, 10], rest: 45 },
        ],
      },
      {
        key: "B",
        entries: [
          { exerciseId: "romanian-deadlift", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "split-squat", sets: 3, reps: [8, 12], rest: 60, loaded: true },
          { exerciseId: "shoulder-press", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "farmer-carry", sets: 2, seconds: [20, 45], rest: 60 },
          { exerciseId: "suitcase-carry", sets: 2, seconds: [20, 45], rest: 60 },
        ],
      },
    ],
    days: [THREE_DAYS],
  },
  {
    id: "upper-legs-core",
    name: "Upper / Legs / Core",
    summary: "A day each for upper body, legs and core, in rotation.",
    why: "Each area gets its own day and several days' rest. On 3 days a week each part is trained once a week; on 6 days, twice — better for progress. Core never comes right before legs, so your back is fresh for the deadlifts.",
    workouts: [
      {
        key: "A",
        name: "Upper body",
        entries: [
          { exerciseId: "floor-press", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "one-arm-row", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "shoulder-press", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "reverse-fly", sets: 2, reps: [10, 15], rest: 60 },
          { exerciseId: "dumbbell-curl", sets: 2, reps: [10, 15], rest: 60 },
          { exerciseId: "floor-triceps-extension", sets: 2, reps: [10, 15], rest: 60 },
        ],
      },
      {
        key: "B",
        name: "Legs",
        entries: [
          { exerciseId: "romanian-deadlift", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "goblet-squat", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "split-squat", sets: 2, reps: [8, 12], rest: 60 },
          { exerciseId: "glute-bridge", sets: 2, reps: [12, 20], rest: 60 },
          { exerciseId: "calf-raise", sets: 2, reps: [12, 20], rest: 45 },
        ],
      },
      {
        key: "C",
        name: "Core",
        entries: [
          { exerciseId: "dumbbell-dead-bug", sets: 3, reps: [6, 10], rest: 45 },
          { exerciseId: "bird-dog", sets: 2, reps: [6, 10], rest: 45 },
          { exerciseId: "side-plank", sets: 2, seconds: [20, 45], rest: 45 },
          { exerciseId: "suitcase-carry", sets: 2, seconds: [20, 45], rest: 60 },
          { exerciseId: "farmer-carry", sets: 2, seconds: [20, 45], rest: 60 },
        ],
      },
    ],
    days: [
      {
        label: "3 days: Mon · Wed · Fri",
        detail: "Each part once a week, with back care on Tue, Thu and Sat.",
        trainingDays: ["Mon", "Wed", "Fri"],
        backCareDays: ["Tue", "Thu", "Sat"],
      },
      {
        label: "6 days: Mon to Sat",
        detail: "Each part twice a week — faster progress. Sunday off.",
        trainingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        backCareDays: [],
      },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    summary: "Upper-body and lower-body days, each twice a week.",
    why: "The middle ground most coaches suggest for beginners who like body-part days: separate days, but each part still trained twice a week. Core work is split between the two.",
    workouts: [
      {
        key: "A",
        name: "Upper body",
        entries: [
          { exerciseId: "floor-press", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "one-arm-row", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "shoulder-press", sets: 3, reps: [10, 15], rest: 60 },
          { exerciseId: "reverse-fly", sets: 2, reps: [10, 15], rest: 60 },
          { exerciseId: "dumbbell-curl", sets: 2, reps: [10, 15], rest: 60 },
          { exerciseId: "dumbbell-dead-bug", sets: 2, reps: [6, 10], rest: 45 },
        ],
      },
      {
        key: "B",
        name: "Lower body",
        entries: [
          { exerciseId: "romanian-deadlift", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "goblet-squat", sets: 3, reps: [10, 15], rest: 90 },
          { exerciseId: "split-squat", sets: 2, reps: [8, 12], rest: 60 },
          { exerciseId: "glute-bridge", sets: 2, reps: [12, 20], rest: 60 },
          { exerciseId: "side-plank", sets: 2, seconds: [20, 45], rest: 45 },
        ],
      },
    ],
    days: [
      {
        label: "4 days: Mon · Tue · Thu · Fri",
        detail: "Each part twice a week, with back care on Wed and Sat.",
        trainingDays: ["Mon", "Tue", "Thu", "Fri"],
        backCareDays: ["Wed", "Sat"],
      },
    ],
  },
];

export const DEFAULT_PLAN = PLANS[0];

export function getPlan(id: string): Plan | null {
  return PLANS.find((plan) => plan.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * Storing names and saved plans as text in Notion
 * ------------------------------------------------------------------ */

const clean = (name: string) => name.replace(/[;\n]/g, " ").trim().slice(0, 40);

/** { A: "Upper body", B: "Legs" } ⇄ "A: Upper body; B: Legs" (readable in Notion too). */
export function formatWorkoutNames(names: Partial<Record<WorkoutKey, string>>): string {
  return WORKOUT_KEYS.flatMap((key) => (names[key] && clean(names[key]!) ? [`${key}: ${clean(names[key]!)}`] : [])).join("; ");
}

export function parseWorkoutNames(text: string): Partial<Record<WorkoutKey, string>> {
  const names: Partial<Record<WorkoutKey, string>> = {};
  for (const part of text.split(";")) {
    const match = part.match(/^\s*([A-D])\s*:\s*(.+?)\s*$/);
    if (match && isWorkoutKey(match[1])) names[match[1]] = clean(match[2]);
  }
  return names;
}

/** The current workouts as a plan, so they can be saved and switched back to later. */
export function snapshotWorkouts(
  slots: ReadonlyArray<Pick<Slot, "workout" | "order" | "exerciseId" | "sets" | "repMin" | "repMax" | "seconds" | "maxSeconds" | "rest">>,
  names: Partial<Record<WorkoutKey, string>>,
): PlanWorkout[] {
  return WORKOUT_KEYS.flatMap((key): PlanWorkout[] => {
    const inWorkout = slots.filter((slot) => slot.workout === key).sort((a, b) => a.order - b.order);
    if (!inWorkout.length) return [];
    return [
      {
        key,
        ...(names[key] ? { name: names[key] } : {}),
        entries: inWorkout.map((slot) => ({
          exerciseId: slot.exerciseId,
          sets: slot.sets,
          ...(slot.seconds !== null ? { seconds: [slot.seconds, slot.maxSeconds ?? slot.seconds] as [number, number] } : {}),
          ...(slot.repMin !== null ? { reps: [slot.repMin, slot.repMax ?? slot.repMin] as [number, number] } : {}),
          rest: slot.rest,
        })),
      },
    ];
  });
}

const whole = (value: unknown, min: number, max: number): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : null;
};

const range = (value: unknown, min: number, max: number): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const low = whole(value[0], min, max);
  const high = whole(value[1], min, max);
  return low === null || high === null ? undefined : [low, Math.max(low, high)];
};

/**
 * A saved plan read back from Notion, checked like any other input: unknown
 * exercises are dropped and numbers are clamped, so an edit in Notion can
 * never break the app. `null` if nothing usable is left.
 */
export function parseSavedWorkouts(json: string): PlanWorkout[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const list = (raw as { workouts?: unknown })?.workouts;
  if (!Array.isArray(list)) return null;
  const workouts = list.flatMap((item): PlanWorkout[] => {
    const workout = item as { key?: unknown; name?: unknown; entries?: unknown };
    if (!isWorkoutKey(workout.key) || !Array.isArray(workout.entries)) return [];
    const entries = workout.entries.flatMap((value): PlanEntry[] => {
      const entry = value as Record<string, unknown>;
      const id = entry.exerciseId;
      if (typeof id !== "string" || !(id in EXERCISES) || EXERCISES[id].pattern === "mobility") return [];
      const sets = whole(entry.sets, 1, 6) ?? 3;
      const rest = whole(entry.rest, 0, 600) ?? 60;
      const reps = range(entry.reps, 1, 60);
      const seconds = range(entry.seconds, 5, 600);
      return [{ exerciseId: id, sets, rest, ...(reps ? { reps } : {}), ...(seconds ? { seconds } : {}) }];
    });
    if (!entries.length) return [];
    return [{ key: workout.key, ...(typeof workout.name === "string" && clean(workout.name) ? { name: clean(workout.name) } : {}), entries }];
  });
  // Keep the first workout of each letter only.
  const unique = workouts.filter((workout, index) => workouts.findIndex((other) => other.key === workout.key) === index);
  return unique.length ? unique : null;
}

export function serializeWorkouts(workouts: PlanWorkout[]): string {
  return JSON.stringify({ v: 1, workouts });
}
