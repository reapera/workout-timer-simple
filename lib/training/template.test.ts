import { describe, expect, it } from "vitest";

import { DEFAULT_EQUIPMENT } from "./equipment";
import { EXERCISES } from "./exercises";
import { buildSlots, estimateMinutes, setsForWeek, slotsFor } from "./template";
import type { Slot } from "./types";

const withIds = (seeds: ReturnType<typeof buildSlots>): Slot[] =>
  seeds.map((seed, index) => ({ ...seed, id: `slot-${index}`, lastSession: null, lastDone: null }));

describe("buildSlots", () => {
  it("builds two workouts from known exercises", () => {
    const slots = buildSlots(DEFAULT_EQUIPMENT);
    expect(slots.filter((s) => s.workout === "A").map((s) => s.exerciseId)).toEqual([
      "goblet-squat",
      "floor-press",
      "one-arm-row",
      "glute-bridge",
      "dead-bug",
    ]);
    expect(slots.filter((s) => s.workout === "B").map((s) => s.exerciseId)).toEqual([
      "romanian-deadlift",
      "split-squat",
      "shoulder-press",
      "bird-dog",
      "side-plank",
    ]);
    expect(slots.every((s) => s.exerciseId in EXERCISES)).toBe(true);
  });

  it("finds a working weight for lifts and starts the rest at bodyweight", () => {
    const byId = Object.fromEntries(buildSlots(DEFAULT_EQUIPMENT).map((s) => [s.exerciseId, s]));
    expect(byId["goblet-squat"].weight).toBeNull();
    expect(byId["romanian-deadlift"].weight).toBeNull();
    expect(byId["glute-bridge"].weight).toBe(0);
    expect(byId["split-squat"].weight).toBe(0);
    expect(byId["dead-bug"].weight).toBe(0);
    expect(byId["side-plank"]).toMatchObject({ seconds: 20, maxSeconds: 45, repMin: null });
  });

  it("numbers each workout from 1", () => {
    const slots = withIds(buildSlots(DEFAULT_EQUIPMENT));
    expect(slotsFor(slots, "B").map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("swaps in the bench press when there is a bench", () => {
    const ids = buildSlots({ ...DEFAULT_EQUIPMENT, bench: true }).map((s) => s.exerciseId);
    expect(ids).toContain("bench-press");
    expect(ids).not.toContain("floor-press");
  });

  it("uses one-dumbbell versions with a single handle", () => {
    const ids = buildSlots({ ...DEFAULT_EQUIPMENT, handles: 1, bench: true }).map((s) => s.exerciseId);
    expect(ids).toEqual(expect.arrayContaining(["floor-press-one-arm", "romanian-deadlift-single", "split-squat-goblet"]));
    expect(ids.some((id) => EXERCISES[id].load === "pair")).toBe(false);
  });
});

describe("setsForWeek", () => {
  it("eases beginners in with two sets for two weeks", () => {
    expect(setsForWeek(3, 1, "beginner")).toBe(2);
    expect(setsForWeek(3, 2, "beginner")).toBe(2);
    expect(setsForWeek(3, 3, "beginner")).toBe(3);
    expect(setsForWeek(3, 1, "intermediate")).toBe(3);
    expect(setsForWeek(2, 1, "beginner")).toBe(2);
  });
});

describe("estimateMinutes", () => {
  it("lands in a sensible range for each workout", () => {
    const slots = withIds(buildSlots(DEFAULT_EQUIPMENT));
    for (const workout of ["A", "B"] as const) {
      const early = estimateMinutes(slotsFor(slots, workout), 1, "beginner");
      const later = estimateMinutes(slotsFor(slots, workout), 3, "beginner");
      expect(early).toBeGreaterThan(15);
      expect(later).toBeGreaterThan(early);
      expect(later).toBeLessThan(50);
    }
  });
});
