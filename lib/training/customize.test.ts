import { describe, expect, it } from "vitest";

import { canDo, dumbbellOnlyChanges, exerciseGroups, slotUsesDumbbell } from "./customize";
import { DEFAULT_EQUIPMENT } from "./equipment";
import { EXERCISE_LIST, getExercise } from "./exercises";
import { buildSlots, prescriptionFor, seedFor, startingWeight, workoutName } from "./template";
import type { Equipment, Slot } from "./types";
import { InputError, parseNewSlot, parseSlotUpdates } from "./validate";

const slots = (equipment = DEFAULT_EQUIPMENT): Slot[] =>
  buildSlots(equipment).map((seed, index) => ({ ...seed, id: `slot-${index}`, lastSession: null, lastDone: null }));

describe("the exercise library", () => {
  it("has pictures, cues and a movement group for every move", () => {
    for (const exercise of EXERCISE_LIST) {
      expect(exercise.pattern, exercise.id).toBeTruthy();
      expect(exercise.cues.length, exercise.id).toBeGreaterThan(0);
      if (exercise.pattern !== "mobility") expect(exercise.images.length, exercise.id).toBe(2);
    }
  });
});

describe("dumbbellOnlyChanges", () => {
  it("swaps the bodyweight core moves and loads the moves that start at bodyweight", () => {
    const plan = slots();
    const byExercise = Object.fromEntries(plan.map((slot) => [slot.exerciseId, slot.id]));
    expect(dumbbellOnlyChanges(plan, DEFAULT_EQUIPMENT)).toEqual([
      { id: byExercise["glute-bridge"], weight: null },
      { id: byExercise["dead-bug"], exerciseId: "dumbbell-dead-bug" },
      { id: byExercise["split-squat"], weight: null },
      { id: byExercise["bird-dog"], exerciseId: "farmer-carry" },
      { id: byExercise["side-plank"], exerciseId: "suitcase-carry" },
    ]);
  });

  it("uses the one-dumbbell carry when there's only one handle", () => {
    const one: Equipment = { ...DEFAULT_EQUIPMENT, handles: 1 };
    const changes = dumbbellOnlyChanges(slots(one), one);
    expect(changes.filter((change) => change.exerciseId === "suitcase-carry")).toHaveLength(2);
    expect(changes.some((change) => change.exerciseId === "farmer-carry")).toBe(false);
  });

  it("has nothing left to do once every exercise uses a dumbbell", () => {
    // As the server applies them: a swap starts the new exercise at its starting weight.
    const converted = slots().map((slot) => {
      const change = dumbbellOnlyChanges([slot], DEFAULT_EQUIPMENT)[0];
      if (!change) return slot;
      if (change.exerciseId) return { ...slot, exerciseId: change.exerciseId, weight: startingWeight(getExercise(change.exerciseId)) };
      return { ...slot, weight: change.weight ?? null };
    });
    expect(converted.every(slotUsesDumbbell)).toBe(true);
    expect(dumbbellOnlyChanges(converted, DEFAULT_EQUIPMENT)).toEqual([]);
  });
});

describe("exerciseGroups", () => {
  it("offers strength moves only, similar ones first", () => {
    const groups = exerciseGroups(DEFAULT_EQUIPMENT, { prefer: "arms", exclude: ["dumbbell-curl"] });
    expect(groups[0].pattern).toBe("arms");
    expect(groups[0].exercises.map((exercise) => exercise.id)).toEqual(["hammer-curl", "floor-triceps-extension"]);
    expect(groups.some((group) => group.pattern === "mobility")).toBe(false);
  });

  it("hides bodyweight-only moves when asked, and what your equipment can't do", () => {
    const dumbbells = exerciseGroups(DEFAULT_EQUIPMENT, { dumbbellOnly: true }).flatMap((group) => group.exercises);
    expect(dumbbells.some((exercise) => exercise.load === "none")).toBe(false);
    expect(dumbbells.some((exercise) => exercise.id === "bench-press")).toBe(false);

    const oneHandle = exerciseGroups({ ...DEFAULT_EQUIPMENT, handles: 1 }).flatMap((group) => group.exercises);
    expect(oneHandle.some((exercise) => exercise.load === "pair")).toBe(false);
    expect(canDo(getExercise("bench-press"), { ...DEFAULT_EQUIPMENT, bench: true })).toBe(true);
  });
});

describe("new exercises' starting targets", () => {
  it("uses the exercise's own default, then the plan's, then one by kind", () => {
    expect(prescriptionFor(getExercise("dumbbell-curl"))).toEqual({ sets: 2, reps: [10, 15], rest: 60 });
    expect(prescriptionFor(getExercise("floor-press-one-arm"))).toMatchObject({ sets: 3, reps: [10, 15], rest: 90 });
    expect(prescriptionFor(getExercise("bulgarian-split-squat"))).toEqual({ sets: 3, reps: [10, 15], rest: 90 });
  });

  it("seeds reps or seconds, and a weight to find", () => {
    expect(seedFor("farmer-carry", "B", 6)).toMatchObject({
      workout: "B",
      order: 6,
      repMin: null,
      seconds: 20,
      maxSeconds: 45,
      weight: null,
    });
    expect(seedFor("reverse-lunge", "A", 3)).toMatchObject({ repMin: 8, repMax: 12, seconds: null, weight: 0 });
  });

  it("names a workout after its first three kinds of move", () => {
    const plan = slots();
    expect(workoutName(plan.filter((slot) => slot.workout === "A"))).toBe("Squat · Press · Row");
    expect(workoutName(plan.filter((slot) => slot.workout === "B"))).toBe("Hinge · Lunge · Press");
    expect(workoutName([])).toBe("No exercises yet");
  });
});

describe("input checks", () => {
  it("accepts tidy edits and clamps numbers", () => {
    expect(parseSlotUpdates({ updates: [{ id: "abc-123", sets: 9, rest: 75, weight: null, archived: true }] })).toEqual([
      { id: "abc-123", sets: 6, rest: 75, weight: null, archived: true },
    ]);
  });

  it("refuses unknown exercises, stretches and back-to-front ranges", () => {
    expect(() => parseSlotUpdates({ updates: [{ id: "a", exerciseId: "nope" }] })).toThrow(InputError);
    expect(() => parseSlotUpdates({ updates: [{ id: "a", exerciseId: "cat-cow" }] })).toThrow(InputError);
    expect(() => parseSlotUpdates({ updates: [{ id: "a", repMin: 12, repMax: 8 }] })).toThrow(/rep range/);
    expect(() => parseSlotUpdates({ updates: [] })).toThrow(/Nothing/);
    expect(() => parseNewSlot({ workout: "E", exerciseId: "dumbbell-curl" })).toThrow(InputError);
    expect(parseNewSlot({ workout: "C", exerciseId: "farmer-carry" })).toEqual({ workout: "C", exerciseId: "farmer-carry" });
    expect(parseNewSlot({ workout: "B", exerciseId: "dumbbell-curl" })).toEqual({ workout: "B", exerciseId: "dumbbell-curl" });
  });
});
