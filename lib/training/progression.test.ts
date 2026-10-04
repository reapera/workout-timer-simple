import { describe, expect, it } from "vitest";

import { DEFAULT_EQUIPMENT, ladderFor } from "./equipment";
import { getExercise } from "./exercises";
import { decide, workingSets } from "./progression";
import type { BackFeel, Effort, ExerciseLog, Slot } from "./types";

const goblet = getExercise("goblet-squat"); // single dumbbell
const floorPress = getExercise("floor-press"); // pair
const bridge = getExercise("glute-bridge"); // bodyweight start, single
const deadBug = getExercise("dead-bug"); // bodyweight only
const sidePlank = getExercise("side-plank"); // timed

const ladder = (exercise = goblet) => ladderFor(exercise, DEFAULT_EQUIPMENT);

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: "slot-1",
    exerciseId: "goblet-squat",
    workout: "A",
    order: 1,
    sets: 3,
    repMin: 10,
    repMax: 15,
    seconds: null,
    maxSeconds: null,
    rest: 90,
    weight: 8,
    stretch: 0,
    stalls: 0,
    lastSession: null,
    lastDone: null,
    ...overrides,
  };
}

function log(
  values: number[],
  weight: number,
  options: { effort?: Effort; back?: BackFeel; plannedSets?: number } = {},
): ExerciseLog {
  return {
    slotId: "slot-1",
    exerciseId: "goblet-squat",
    plannedSets: options.plannedSets ?? 3,
    sets: values.map((value) => ({ weight, value })),
    effort: options.effort ?? "good",
    back: options.back ?? "none",
  };
}

describe("loaded exercises", () => {
  it("moves up when every set reaches the top of the range", () => {
    const decision = decide(slot(), goblet, log([15, 15, 15], 8), ladder());
    expect(decision.outcome).toBe("up");
    expect(decision.next.weight).toBe(8.5);
    expect(decision.message).toBe("Next time: 8.5 kg ↑");
  });

  it("holds the weight inside the range and clears stalls", () => {
    const decision = decide(slot({ stalls: 1 }), goblet, log([14, 12, 11], 8), ladder());
    expect(decision.outcome).toBe("hold");
    expect(decision.next).toMatchObject({ weight: 8, stalls: 0 });
  });

  it("needs every planned set at the top before moving up", () => {
    expect(decide(slot(), goblet, log([15, 15], 8), ladder()).outcome).toBe("hold");
  });

  it("forgives one short session, then backs off after two", () => {
    const first = decide(slot(), goblet, log([9, 8, 7], 8), ladder());
    expect(first.outcome).toBe("hold");
    expect(first.next.stalls).toBe(1);

    const second = decide(slot({ stalls: 1 }), goblet, log([8, 8, 7], 8), ladder());
    expect(second.outcome).toBe("down");
    expect(second.next).toMatchObject({ weight: 7, stalls: 0 });
  });

  it("does not count an average just under the range as a stall", () => {
    expect(decide(slot(), goblet, log([10, 9, 8], 8), ladder()).next.stalls).toBe(0);
  });

  it("never increases after a set that felt too hard", () => {
    const decision = decide(slot(), goblet, log([15, 15, 15], 8, { effort: "too_hard" }), ladder());
    expect(decision.outcome).toBe("hold");
    expect(decision.next.weight).toBe(8);
  });

  describe("back check", () => {
    it("steps down straight away on pain", () => {
      const decision = decide(slot(), goblet, log([15, 15, 15], 8, { back: "pain" }), ladder());
      expect(decision.outcome).toBe("down");
      expect(decision.next.weight).toBe(7);
    });

    it("holds on mild discomfort even at the top of the range", () => {
      const decision = decide(slot({ stalls: 1 }), goblet, log([15, 15, 15], 8, { back: "mild" }), ladder());
      expect(decision.outcome).toBe("hold");
      expect(decision.next).toMatchObject({ weight: 8, stalls: 1 });
    });
  });

  describe("big jumps between dumbbells", () => {
    const press = (overrides: Partial<Slot>) =>
      slot({ exerciseId: "floor-press", weight: 2, ...overrides });

    it("asks for extra reps before a jump of more than 20%", () => {
      const first = decide(press({}), floorPress, log([15, 15, 15], 2), ladder(floorPress));
      expect(first.outcome).toBe("stretch");
      expect(first.next).toMatchObject({ weight: 2, stretch: 3 });
      expect(first.message).toContain("18 reps");

      const second = decide(press({ stretch: 3 }), floorPress, log([18, 18, 18], 2), ladder(floorPress));
      expect(second.next.stretch).toBe(6);

      const third = decide(press({ stretch: 6 }), floorPress, log([21, 21, 21], 2), ladder(floorPress));
      expect(third.outcome).toBe("up");
      expect(third.next).toMatchObject({ weight: 4.5, stretch: 0 });
    });

    it("requires the stretched top, not the normal one", () => {
      const decision = decide(press({ stretch: 3 }), floorPress, log([15, 15, 15], 2), ladder(floorPress));
      expect(decision.outcome).toBe("hold");
    });

    it("takes jumps of 20% or less directly", () => {
      const decision = decide(press({ weight: 5 }), floorPress, log([15, 15, 15], 5), ladder(floorPress));
      expect(decision.outcome).toBe("up");
      expect(decision.next.weight).toBe(6);
    });

    it("stretches the range at the heaviest setup, then holds", () => {
      const top = decide(press({ weight: 17 }), floorPress, log([15, 15, 15], 17), ladder(floorPress));
      expect(top.outcome).toBe("stretch");
      const maxed = decide(press({ weight: 17, stretch: 6 }), floorPress, log([21, 21, 21], 17), ladder(floorPress));
      expect(maxed.outcome).toBe("hold");
      expect(maxed.message).toMatch(/Maxed out/);
    });
  });

  it("follows the weight actually used when it differs from the plan", () => {
    const decision = decide(slot({ weight: 9 }), goblet, log([15, 15, 15], 8.5), ladder());
    expect(decision.next.weight).toBe(9);
  });

  it("adds the first dumbbell once a bodyweight move tops out", () => {
    const decision = decide(
      slot({ exerciseId: "glute-bridge", weight: 0, sets: 2, repMin: 12, repMax: 20 }),
      bridge,
      log([20, 20], 0, { plannedSets: 2 }),
      ladder(bridge),
    );
    expect(decision.outcome).toBe("up");
    expect(decision.next.weight).toBe(2);
  });
});

describe("finding your weight", () => {
  const unknown = slot({ weight: null });

  it("keeps a weight that landed in the range", () => {
    const decision = decide(unknown, goblet, log([12, 11, 10], 6), ladder());
    expect(decision.outcome).toBe("set");
    expect(decision.next.weight).toBe(6);
  });

  it("goes heavier when the reps blew past the range, by at most 30%", () => {
    expect(decide(unknown, goblet, log([20, 19], 6), ladder()).next.weight).toBe(7);
    expect(decide(unknown, goblet, log([40, 40], 6), ladder()).next.weight).toBe(7.5);
  });

  it("goes lighter when the weight was too heavy", () => {
    expect(decide(unknown, goblet, log([6, 5], 10), ladder()).next.weight).toBe(8);
  });

  it("errs lighter still if the back complained", () => {
    // 6 kg was in range; pain drops it to the heaviest setup at least 10% lighter.
    expect(decide(unknown, goblet, log([12, 11, 10], 6, { back: "pain" }), ladder()).next.weight).toBe(5);
  });
});

describe("bodyweight-only moves", () => {
  it("never changes state; the goal is cleaner, slower reps", () => {
    const state = slot({ exerciseId: "dead-bug", weight: 0, repMin: 6, repMax: 10, sets: 2 });
    const decision = decide(state, deadBug, log([10, 10], 0, { plannedSets: 2 }), [0]);
    expect(decision.outcome).toBe("hold");
    expect(decision.next).toEqual({ weight: 0, stretch: 0, stalls: 0, seconds: null });
  });
});

describe("timed holds", () => {
  const hold = (overrides: Partial<Slot> = {}) =>
    slot({ exerciseId: "side-plank", weight: 0, repMin: null, repMax: null, sets: 2, seconds: 20, maxSeconds: 45, ...overrides });

  it("adds five seconds after holding every set", () => {
    const decision = decide(hold(), sidePlank, log([20, 19], 0, { plannedSets: 2 }), [0]);
    expect(decision.outcome).toBe("up");
    expect(decision.next.seconds).toBe(25);
  });

  it("stops at the ceiling", () => {
    const decision = decide(hold({ seconds: 45 }), sidePlank, log([45, 45], 0, { plannedSets: 2 }), [0]);
    expect(decision.outcome).toBe("hold");
    expect(decision.next.seconds).toBe(45);
  });

  it("backs off after two short sessions or any back pain", () => {
    const short = decide(hold({ stalls: 1 }), sidePlank, log([20, 12], 0, { plannedSets: 2 }), [0]);
    expect(short.next).toMatchObject({ seconds: 15, stalls: 0 });
    const pain = decide(hold(), sidePlank, log([20, 20], 0, { plannedSets: 2, back: "pain" }), [0]);
    expect(pain.next.seconds).toBe(15);
  });
});

it("leaves everything alone when an exercise was skipped", () => {
  const decision = decide(slot(), goblet, log([], 8), ladder());
  expect(decision.outcome).toBe("skipped");
  expect(decision.next.weight).toBe(8);
});

describe("workingSets", () => {
  it("uses the weight most sets were done at, lighter on a tie", () => {
    const sets = [
      { weight: 8, value: 12 },
      { weight: 8, value: 11 },
      { weight: 7.5, value: 14 },
    ];
    expect(workingSets(sets)).toEqual({ weight: 8, values: [12, 11] });
    expect(workingSets(sets.slice(1)).weight).toBe(7.5);
  });
});

describe("deload weeks", () => {
  it("changes nothing, whatever the reps", () => {
    const decision = decide(slot(), goblet, log([15, 15, 15], 7), ladder(), { deload: true });
    expect(decision).toMatchObject({ outcome: "hold", next: { weight: 8, stretch: 0, stalls: 0 } });
    expect(decision.message).toMatch(/^Lighter week/);
  });

  it("still finds a first working weight", () => {
    const decision = decide(slot({ weight: null }), goblet, log([12, 11], 6), ladder(), { deload: true });
    expect(decision).toMatchObject({ outcome: "set", next: { weight: 6 } });
  });
});
