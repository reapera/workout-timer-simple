import { describe, expect, it } from "vitest";

import { DEFAULT_EQUIPMENT } from "./equipment";
import { blockRange, buildReview, nextReviewDate, reviewDue } from "./review";
import { buildSlots } from "./template";
import type { History, LiftEntry, Programme, TrainingData } from "./types";

const PROGRAMME: Programme = {
  id: "programme",
  name: "Home dumbbell plan",
  startDate: "2026-09-28",
  trainingDays: ["Mon", "Wed", "Fri"],
  backCareDays: ["Tue", "Thu", "Sat"],
  equipment: DEFAULT_EQUIPMENT,
  level: "beginner",
  backPain: true,
  deloadUntil: null,
  lastReview: 0,
  reminderTime: null,
      workoutNames: {},
      planSince: null,
};

function data(programme: Partial<Programme> = {}): TrainingData {
  return {
    programme: { ...PROGRAMME, ...programme },
    slots: buildSlots(DEFAULT_EQUIPMENT).map((seed, index) => ({ ...seed, id: `slot-${index}`, lastSession: null, lastDone: null })),
    history: [],
    last: {},
  };
}

function lift(date: string, exerciseId: string, overrides: Partial<LiftEntry> = {}): LiftEntry {
  return { date, session: `s-${date}`, workout: "A", exerciseId, weight: 8, values: [12, 12], result: "Hold", back: "No pain", effort: "Good", ...overrides };
}

const history = (lifts: LiftEntry[], backCare: string[] = []): History => ({ lifts, backCare, bodyWeight: [], weightLog: true });

/** Every planned strength day in weeks 1–4, all done. */
function fullBlock(overrides: (date: string, index: number) => Partial<LiftEntry> = () => ({})): LiftEntry[] {
  const lifts: LiftEntry[] = [];
  let index = 0;
  for (let day = 0; day < 28; day += 1) {
    const date = new Date(Date.UTC(2026, 8, 28 + day)).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 1 || weekday === 3 || weekday === 5) lifts.push(lift(date, "goblet-squat", overrides(date, index++)));
  }
  return lifts;
}

describe("reviewDue", () => {
  it("comes due once a 4-week block has finished, until reviewed", () => {
    expect(reviewDue(PROGRAMME, "2026-10-25")).toBeNull(); // week 4
    expect(reviewDue(PROGRAMME, "2026-10-26")).toBe(1); // week 5
    expect(reviewDue({ ...PROGRAMME, lastReview: 1 }, "2026-11-20")).toBeNull();
    expect(reviewDue({ ...PROGRAMME, lastReview: 1 }, "2026-11-23")).toBe(2); // week 9
  });

  it("says when the next one comes due", () => {
    expect(nextReviewDate(PROGRAMME, "2026-10-04")).toBe("2026-10-26");
    expect(nextReviewDate({ ...PROGRAMME, lastReview: 1 }, "2026-10-26")).toBe("2026-11-23");
    // A plan that starts next week still waits a full block.
    expect(nextReviewDate({ ...PROGRAMME, startDate: "2026-10-12" }, "2026-10-04")).toBe("2026-11-09");
  });

  it("covers four weeks exactly", () => {
    expect(blockRange("2026-09-28", 1)).toEqual({ from: "2026-09-28", to: "2026-10-25" });
    expect(blockRange("2026-09-28", 2)).toEqual({ from: "2026-10-26", to: "2026-11-22" });
  });
});

describe("buildReview", () => {
  it("summarises a good block and suggests nothing on week 5", () => {
    const lifts = fullBlock((_, index) => (index % 3 === 2 ? { result: "Up" } : {}));
    const review = buildReview(data(), history(lifts, ["2026-09-29"]), 1, "2026-10-26");
    expect(review.strength).toEqual({ done: 12, planned: 12 });
    expect(review.backCare).toEqual({ done: 1, planned: 12 });
    expect(review.suggestions).toEqual([]);
    expect(review.headline).toBe("12 of 12 workouts done, and your weights went up 4 times.");
    expect(review.lifts.find((l) => l.exerciseId === "goblet-squat")).toMatchObject({ sessions: 12, ups: 4, startWeight: 8 });
  });

  it("suggests a lighter week when the back complains", () => {
    const lifts = fullBlock((_, index) => (index < 2 ? { back: "Pain" } : {}));
    const review = buildReview(data(), history(lifts), 1, "2026-10-26");
    expect(review.suggestions.map((s) => s.kind)).toEqual(["deload"]);
    expect(review.suggestions[0].detail).toMatch(/back reported pain 2 times/);
  });

  it("plans a lighter week every 8 weeks, but not right after one", () => {
    // Block 2 is 26 Oct – 22 Nov: twelve steady sessions, no setbacks.
    const steady = Array.from({ length: 12 }, (_, i) =>
      lift(new Date(Date.UTC(2026, 9, 26 + i * 2)).toISOString().slice(0, 10), "goblet-squat"),
    );
    const block2 = buildReview(data({ lastReview: 1 }), history(steady), 2, "2026-11-23");
    expect(block2.suggestions.map((s) => s.kind)).toEqual(["deload"]);

    const justRested = buildReview(data({ lastReview: 1, deloadUntil: "2026-11-08" }), history(steady), 2, "2026-11-23");
    expect(justRested.suggestions).toEqual([]);

    // Nothing logged in the block: no lighter week to recover from.
    expect(buildReview(data({ lastReview: 1 }), history(fullBlock()), 2, "2026-11-23").suggestions).toEqual([]);
  });

  it("offers a harder variation once a lift tops out the dumbbells", () => {
    const source = data();
    source.slots = source.slots.map((slot) =>
      slot.exerciseId === "goblet-squat" ? { ...slot, weight: 19, stretch: 6 } : slot,
    );
    const review = buildReview(source, history(fullBlock()), 1, "2026-10-26");
    const swap = review.suggestions.find((s) => s.kind === "swap");
    expect(swap).toMatchObject({ kind: "swap", to: "bulgarian-split-squat", title: "Make goblet squat harder" });
  });

  it("suggests two strength days when three didn't fit", () => {
    const lifts = fullBlock().slice(0, 4);
    const review = buildReview(data(), history(lifts), 1, "2026-10-26");
    expect(review.suggestions.find((s) => s.kind === "schedule")).toMatchObject({
      trainingDays: ["Mon", "Thu"],
      backCareDays: ["Tue", "Sat"],
    });
  });

  it("encourages a restart after an empty block", () => {
    expect(buildReview(data(), history([]), 1, "2026-10-26").headline).toMatch(/restart/);
  });
});
