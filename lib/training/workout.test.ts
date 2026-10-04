import { describe, expect, it } from "vitest";

import { DEFAULT_EQUIPMENT } from "./equipment";
import { buildSlots } from "./template";
import type { TrainingData } from "./types";
import {
  aimFor,
  applySession,
  applyWorkout,
  createWorkout,
  outcomes,
  plannedLoad,
  reduce,
  toSessionLog,
  totals,
  type WorkoutState,
} from "./workout";

function data(overrides: Partial<TrainingData> = {}): TrainingData {
  return {
    programme: {
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
    },
    slots: buildSlots(DEFAULT_EQUIPMENT).map((seed, index) => ({
      ...seed,
      id: `slot-${index}`,
      lastSession: null,
      lastDone: null,
    })),
    history: [],
    last: {},
    ...overrides,
  };
}

const T0 = Date.parse("2026-09-28T07:00:00Z");

function start(source = data(), week = 1): WorkoutState {
  return createWorkout({ data: source, workout: "A", date: "2026-09-28", week, id: "session-1234abcd", now: T0 });
}

describe("createWorkout", () => {
  it("lays out today's exercises with weights to try", () => {
    const state = start();
    expect(state.phase).toBe("warmup");
    expect(state.exercises.map((e) => e.exerciseId)).toEqual([
      "goblet-squat",
      "floor-press",
      "one-arm-row",
      "glute-bridge",
      "dead-bug",
    ]);
    // Week 1 for a beginner: two sets each.
    expect(state.exercises.every((e) => e.plannedSets === 2)).toBe(true);
    const [squat, press] = state.exercises;
    expect(squat).toMatchObject({ finding: true, weight: 6 });
    expect(press).toMatchObject({ finding: true, weight: 5 });
    expect(state.exercises[3]).toMatchObject({ finding: false, weight: 0 });
  });

  it("uses the stored weight and the earned rep stretch", () => {
    const source = data();
    source.slots[0] = { ...source.slots[0], weight: 9.5, stretch: 3 };
    const squat = start(source, 3).exercises[0];
    expect(squat).toMatchObject({ weight: 9.5, finding: false, repMax: 18, plannedSets: 3 });
  });

  it("snaps a stored weight the plates can no longer make", () => {
    // A 2.2 kg handle makes 7.7 or 8.2 kg, not 8.
    const source = data({ programme: { ...data().programme, equipment: { ...DEFAULT_EQUIPMENT, handleWeight: 2.2 } } });
    source.slots[0] = { ...source.slots[0], weight: 8 };
    expect(start(source).exercises[0].weight).toBe(8.2);
  });
});

describe("reduce", () => {
  it("runs sets, rests and ratings through to the end", () => {
    let state = reduce(start(), { type: "warmup-done" });
    expect(state.phase).toBe("set");

    state = reduce(state, { type: "log-set", value: 14, now: T0 + 60_000 });
    expect(state.phase).toBe("rest");
    expect(state.restUntil).toBe(T0 + 60_000 + 90_000);

    state = reduce(state, { type: "rest-extend", seconds: 30 });
    expect(state.restUntil).toBe(T0 + 180_000);
    state = reduce(state, { type: "rest-done" });
    state = reduce(state, { type: "log-set", value: 13, now: T0 + 200_000 });
    expect(state.phase).toBe("rate");

    state = reduce(state, { type: "rate", effort: "good", back: "none", now: T0 + 210_000 });
    expect(state).toMatchObject({ index: 1, phase: "set" });
    expect(state.exercises[0]).toMatchObject({ effort: "good", back: "none" });
    expect(state.exercises[0].sets).toEqual([
      { weight: 6, value: 14 },
      { weight: 6, value: 13 },
    ]);
  });

  it("logs each set at the weight chosen for it", () => {
    let state = reduce(start(), { type: "warmup-done" });
    state = reduce(state, { type: "log-set", value: 15, now: T0 });
    state = reduce(state, { type: "rest-done" });
    state = reduce(state, { type: "set-weight", weight: 7 });
    state = reduce(state, { type: "log-set", value: 12, now: T0 });
    expect(state.exercises[0].sets.map((s) => s.weight)).toEqual([6, 7]);
  });

  it("undoes the last set", () => {
    let state = reduce(start(), { type: "warmup-done" });
    state = reduce(state, { type: "log-set", value: 15, now: T0 });
    state = reduce(state, { type: "undo-set" });
    expect(state).toMatchObject({ phase: "set", restUntil: null });
    expect(state.exercises[0].sets).toEqual([]);
  });

  it("skips exercises and finishes after the last one", () => {
    let state = reduce(start(), { type: "warmup-done" });
    for (let i = 0; i < 5; i += 1) state = reduce(state, { type: "skip-exercise", now: T0 + 1000 });
    expect(state).toMatchObject({ phase: "done", finishedAt: T0 + 1000 });
    expect(state.exercises.every((e) => e.skipped)).toBe(true);
  });

  it("ends early on request, keeping what was done", () => {
    let state = reduce(start(), { type: "warmup-done" });
    state = reduce(state, { type: "log-set", value: 12, now: T0 });
    state = reduce(state, { type: "finish", now: T0 + 5 * 60_000 });
    expect(state.phase).toBe("done");
    expect(toSessionLog(state)).toMatchObject({
      id: "session-1234abcd",
      workout: "A",
      date: "2026-09-28",
      elapsedSeconds: 300,
    });
    expect(totals(state)).toEqual({ sets: 1, reps: 12, volume: 72, minutes: 5 });
  });

  it("ignores actions that don't fit the phase", () => {
    const state = start();
    expect(reduce(state, { type: "log-set", value: 10, now: T0 })).toBe(state);
    expect(reduce(state, { type: "rest-done" })).toBe(state);
  });
});

describe("aimFor", () => {
  it("aims one rep past last time at the same weight, within the range", () => {
    const source = data({ last: { "goblet-squat": { date: "2026-09-25", weight: 6, values: [12, 11] } } });
    const squat = start(source).exercises[0];
    expect(aimFor(squat, 0)).toBe(13);
    expect(aimFor(squat, 1)).toBe(12);
    expect(aimFor({ ...squat, last: { date: "x", weight: 6, values: [15, 15] } }, 0)).toBe(15);
  });

  it("starts at the bottom of the range at a new weight", () => {
    const source = data({ last: { "goblet-squat": { date: "2026-09-25", weight: 5, values: [15, 15] } } });
    expect(aimFor(start(source).exercises[0], 0)).toBe(10);
  });

  it("uses the hold time for timed exercises", () => {
    const source = data();
    const state = createWorkout({ data: source, workout: "B", date: "2026-09-30", week: 1, id: "s", now: T0 });
    expect(aimFor(state.exercises[4], 0)).toBe(20);
  });
});

describe("after the workout", () => {
  function finished(): WorkoutState {
    let state = reduce(start(), { type: "warmup-done" });
    state = reduce(state, { type: "log-set", value: 20, now: T0 });
    state = reduce(state, { type: "rest-done" });
    state = reduce(state, { type: "log-set", value: 19, now: T0 });
    state = reduce(state, { type: "rate", effort: "easy", back: "none", now: T0 });
    return reduce(state, { type: "finish", now: T0 + 30 * 60_000 });
  }

  it("predicts the same decisions the server will make", () => {
    const results = outcomes(finished());
    expect(results[0].decision?.message).toBe("Your working weight: 7 kg");
    expect(results[1].decision).toBeNull();
  });

  it("updates the cached plan once, and only once", () => {
    const source = data();
    const state = finished();
    const after = applyWorkout(source, state);
    expect(after.slots[0]).toMatchObject({ weight: 7, lastSession: "session-1234abcd", lastDone: "2026-09-28" });
    expect(after.slots[1].weight).toBeNull();
    expect(after.history).toHaveLength(1);
    expect(after.last["goblet-squat"]).toEqual({ date: "2026-09-28", weight: 6, values: [20, 19] });

    const twice = applyWorkout(after, state);
    expect(twice.slots[0].weight).toBe(7);
    expect(twice.history).toHaveLength(1);
  });

  it("re-applies a queued session on top of fresh data until Notion has it", () => {
    const session = toSessionLog(finished());
    // Fresh from Notion, which hasn't seen the queued session yet.
    const overlaid = applySession(data(), session);
    expect(overlaid.slots[0].weight).toBe(7);
    expect(overlaid.history).toEqual([
      { date: "2026-09-28", kind: "strength", workout: "A", at: "2026-09-28T07:00:00.000Z" },
    ]);

    // Once Notion has it, its own state wins and nothing is applied again.
    const synced = data();
    synced.slots[0] = { ...synced.slots[0], weight: 7, lastSession: session.id };
    expect(applySession(synced, session)).toBe(synced);
  });

  it("judges against the plan as it was when the workout started", () => {
    const state = finished();
    // Even after the cached plan has moved on, the summary stays the same.
    const moved = applyWorkout(data(), state);
    expect(moved.slots[0].weight).toBe(7);
    expect(outcomes(state)[0].decision?.next.weight).toBe(7);
    expect(state.exercises[0].slot.weight).toBeNull();
  });
});

describe("deload weeks", () => {
  const deloading = () => {
    const source = data({ programme: { ...data().programme, deloadUntil: "2026-10-04" } });
    source.slots[0] = { ...source.slots[0], weight: 8 };
    return source;
  };

  it("drops a set and about 10% of the weight", () => {
    const state = start(deloading(), 3);
    expect(state.deload).toBe(true);
    expect(state.exercises[0]).toMatchObject({ weight: 7, plannedSets: 2 });
    // A lift still finding its weight starts from the usual guess.
    expect(state.exercises[1]).toMatchObject({ finding: true, weight: 5 });
    // Never below one set.
    expect(start(deloading(), 1).exercises[3].plannedSets).toBe(1);
  });

  it("keeps the weight when the next one down is a much bigger drop", () => {
    // One dumbbell: 4.5 kg, then nothing lighter but the 2 kg empty handle.
    const source = deloading();
    source.slots[0] = { ...source.slots[0], weight: 4.5 };
    expect(plannedLoad(source.slots[0], source.programme, 3, true)).toEqual({ sets: 2, weight: 4.5, finding: false });
    expect(plannedLoad(source.slots[0], source.programme, 3, false)).toEqual({ sets: 3, weight: 4.5, finding: false });
  });

  it("leaves the plan unchanged afterwards", () => {
    const source = deloading();
    let state = reduce(start(source, 3), { type: "warmup-done" });
    state = reduce(state, { type: "log-set", value: 15, now: T0 });
    state = reduce(state, { type: "rest-done" });
    state = reduce(state, { type: "log-set", value: 15, now: T0 });
    state = reduce(state, { type: "rate", effort: "easy", back: "none", now: T0 });
    state = reduce(state, { type: "finish", now: T0 });
    expect(outcomes(state)[0].decision?.outcome).toBe("hold");
    expect(applyWorkout(source, state).slots[0].weight).toBe(8);
  });

  it("only covers the seven days ending on the deload date", () => {
    const source = deloading();
    const after = createWorkout({ data: source, workout: "A", date: "2026-10-05", week: 2, id: "s2", now: T0 });
    expect(after.deload).toBe(false);
    const before = createWorkout({ data: source, workout: "A", date: "2026-09-27", week: 1, id: "s3", now: T0 });
    expect(before.deload).toBe(false);
  });
});
