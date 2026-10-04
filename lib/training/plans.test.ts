import { describe, expect, it } from "vitest";

import { canDo } from "./customize";
import { DEFAULT_EQUIPMENT } from "./equipment";
import { EXERCISES, getExercise } from "./exercises";
import {
  formatWorkoutNames,
  getPlan,
  parseSavedWorkouts,
  parseWorkoutNames,
  PLANS,
  serializeWorkouts,
  snapshotWorkouts,
} from "./plans";
import { buildSlots, seedsForPlan, workoutInitials, workoutTitle } from "./template";
import { WORKOUT_KEYS, type Equipment } from "./types";

describe("ready-made plans", () => {
  it.each(PLANS.map((plan) => [plan.id, plan] as const))("%s is complete and doable at home", (_, plan) => {
    // Workouts are lettered from A with no gaps, each with real strength exercises.
    expect(plan.workouts.map((workout) => workout.key)).toEqual(WORKOUT_KEYS.slice(0, plan.workouts.length));
    for (const workout of plan.workouts) {
      expect(workout.entries.length).toBeGreaterThan(0);
      for (const entry of workout.entries) {
        expect(EXERCISES[entry.exerciseId], entry.exerciseId).toBeDefined();
        expect(getExercise(entry.exerciseId).pattern).not.toBe("mobility");
        expect(canDo(getExercise(entry.exerciseId), DEFAULT_EQUIPMENT)).toBe(true);
        expect(Boolean(entry.reps) !== Boolean(entry.seconds)).toBe(true);
        expect(getExercise(entry.exerciseId).kind === "timed").toBe(Boolean(entry.seconds));
      }
    }
    for (const option of plan.days) {
      expect(option.trainingDays.length).toBeGreaterThan(0);
      expect(option.trainingDays.some((day) => option.backCareDays.includes(day))).toBe(false);
    }
  });

  it("keeps the hip hinge first on leg days, and core away from the day before legs", () => {
    const split = getPlan("upper-legs-core")!;
    expect(split.workouts.map((workout) => workout.name)).toEqual(["Upper body", "Legs", "Core"]);
    expect(split.workouts[1].entries[0].exerciseId).toBe("romanian-deadlift");
    // In rotation, Core (C) is followed by Upper (A), never by Legs.
    expect(split.workouts[2].key).toBe("C");
    expect(split.workouts[0].name).toBe("Upper body");
  });

  it("the starting plan is still the full-body A/B", () => {
    expect(buildSlots(DEFAULT_EQUIPMENT)).toEqual(seedsForPlan(PLANS[0], DEFAULT_EQUIPMENT));
    expect(buildSlots(DEFAULT_EQUIPMENT)).toHaveLength(10);
  });

  it("fits a plan to one handle: one-dumbbell versions in, two-dumbbell moves out", () => {
    const one: Equipment = { ...DEFAULT_EQUIPMENT, handles: 1 };
    const seeds = seedsForPlan(getPlan("upper-legs-core")!, one);
    const ids = seeds.map((seed) => seed.exerciseId);
    expect(ids).toContain("floor-press-one-arm");
    expect(ids).toContain("romanian-deadlift-single");
    expect(ids).not.toContain("farmer-carry");
    expect(ids.filter((id) => id === "suitcase-carry")).toHaveLength(2);
    expect(ids).not.toContain("dumbbell-curl");
    // Orders stay 1, 2, 3… within each workout.
    expect(seeds.filter((seed) => seed.workout === "A").map((seed) => seed.order)).toEqual([1, 2, 3]);
  });

  it("starts moves the plan marks as loaded with a dumbbell", () => {
    const seeds = seedsForPlan(getPlan("full-body-dumbbells")!, DEFAULT_EQUIPMENT);
    expect(seeds.find((seed) => seed.exerciseId === "glute-bridge")?.weight).toBeNull();
    expect(seedsForPlan(PLANS[0], DEFAULT_EQUIPMENT).find((seed) => seed.exerciseId === "glute-bridge")?.weight).toBe(0);
  });
});

describe("workout names", () => {
  it("round-trips through Notion text", () => {
    const names = { A: "Upper body", B: "Legs", C: "Core" };
    expect(formatWorkoutNames(names)).toBe("A: Upper body; B: Legs; C: Core");
    expect(parseWorkoutNames("A: Upper body; B: Legs; C: Core")).toEqual(names);
    expect(parseWorkoutNames("nonsense; E: nope; B:  Legs ")).toEqual({ B: "Legs" });
    expect(formatWorkoutNames({ A: "Push; pull" })).toBe("A: Push  pull");
  });

  it("titles and initials, falling back to the letters", () => {
    expect(workoutTitle({ workoutNames: { A: "Upper body" } }, "A")).toBe("Upper body");
    expect(workoutTitle({ workoutNames: {} }, "B")).toBe("Workout B");
    // A plan cached by an older version of the app has no names at all.
    expect(workoutTitle({} as { workoutNames: Record<string, string> }, "A")).toBe("Workout A");
    expect(workoutInitials({ workoutNames: { A: "Upper body", B: "Legs", C: "Core" } }, ["A", "B", "C"])).toEqual({ A: "U", B: "L", C: "C" });
    // "Lower body" and "Legs" would both be L: letters instead.
    expect(workoutInitials({ workoutNames: { A: "Legs", B: "Lower body" } }, ["A", "B"])).toEqual({ A: "A", B: "B" });
  });
});

describe("saved plans", () => {
  const slots = [
    { workout: "B" as const, order: 1, exerciseId: "side-plank", sets: 2, repMin: null, repMax: null, seconds: 30, maxSeconds: 45, rest: 45 },
    { workout: "A" as const, order: 2, exerciseId: "one-arm-row", sets: 3, repMin: 10, repMax: 15, seconds: null, maxSeconds: null, rest: 60 },
    { workout: "A" as const, order: 1, exerciseId: "goblet-squat", sets: 4, repMin: 8, repMax: 12, seconds: null, maxSeconds: null, rest: 120 },
  ];

  it("snapshots the current workouts in order, with names", () => {
    expect(snapshotWorkouts(slots, { A: "Mine" })).toEqual([
      {
        key: "A",
        name: "Mine",
        entries: [
          { exerciseId: "goblet-squat", sets: 4, reps: [8, 12], rest: 120 },
          { exerciseId: "one-arm-row", sets: 3, reps: [10, 15], rest: 60 },
        ],
      },
      { key: "B", entries: [{ exerciseId: "side-plank", sets: 2, seconds: [30, 45], rest: 45 }] },
    ]);
  });

  it("reads back what was saved, and survives hand edits in Notion", () => {
    const saved = snapshotWorkouts(slots, { A: "Mine" });
    expect(parseSavedWorkouts(serializeWorkouts(saved))).toEqual(saved);
    expect(parseSavedWorkouts("not json")).toBeNull();
    expect(parseSavedWorkouts(JSON.stringify({ workouts: [{ key: "A", entries: [{ exerciseId: "made-up" }] }] }))).toBeNull();
    const clamped = parseSavedWorkouts(
      JSON.stringify({ workouts: [{ key: "A", entries: [{ exerciseId: "goblet-squat", sets: 99, reps: [15, 8], rest: -5 }] }] }),
    );
    expect(clamped).toEqual([{ key: "A", entries: [{ exerciseId: "goblet-squat", sets: 6, reps: [15, 15], rest: 0 }] }]);
  });
});
