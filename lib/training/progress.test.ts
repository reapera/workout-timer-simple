import { describe, expect, it } from "vitest";

import {
  consistencyGrid,
  exerciseSeries,
  liftVolume,
  metricFor,
  personalBest,
  summarize,
  weeklyVolume,
} from "./progress";
import type { LiftEntry } from "./types";

const programme = { trainingDays: ["Mon", "Wed", "Fri"] as const, backCareDays: ["Tue", "Thu", "Sat"] as const, startDate: "2026-09-28" };
const plan = { ...programme, trainingDays: [...programme.trainingDays], backCareDays: [...programme.backCareDays] };

function lift(date: string, exerciseId: string, weight: number, values: number[], session = `s-${date}`): LiftEntry {
  return { date, session, workout: "A", exerciseId, weight, values, result: null, back: null, effort: null };
}

// Two full weeks (Mon/Wed/Fri) starting 2026-09-28, then one session in week 3.
const LIFTS: LiftEntry[] = [
  lift("2026-09-28", "goblet-squat", 6, [20, 19]),
  lift("2026-09-28", "floor-press", 5, [12, 11]),
  lift("2026-09-30", "glute-bridge", 0, [15, 15]),
  lift("2026-10-02", "goblet-squat", 7, [14, 13]),
  lift("2026-10-05", "goblet-squat", 7, [15, 15]),
  lift("2026-10-07", "side-plank", 0, [20, 18]),
  lift("2026-10-09", "goblet-squat", 7.5, [12, 12]),
  lift("2026-10-12", "goblet-squat", 7.5, [15, 14]),
];

describe("series and bests", () => {
  it("charts weight for lifts and the best set otherwise", () => {
    const squat = exerciseSeries(LIFTS, "goblet-squat");
    expect(squat.map((p) => p.weight)).toEqual([6, 7, 7, 7.5, 7.5]);
    expect(metricFor("goblet-squat", squat)).toBe("weight");
    expect(metricFor("glute-bridge", exerciseSeries(LIFTS, "glute-bridge"))).toBe("reps");
    expect(metricFor("side-plank", exerciseSeries(LIFTS, "side-plank"))).toBe("seconds");
  });

  it("finds the heaviest weight, then the most reps at it", () => {
    expect(personalBest("goblet-squat", exerciseSeries(LIFTS, "goblet-squat"))).toEqual({
      date: "2026-10-12",
      weight: 7.5,
      value: 15,
    });
    expect(personalBest("side-plank", exerciseSeries(LIFTS, "side-plank"))?.value).toBe(20);
    expect(personalBest("dead-bug", [])).toBeNull();
  });

  it("counts both dumbbells for pair lifts and nothing for holds", () => {
    expect(liftVolume(LIFTS[0])).toBe(234);
    expect(liftVolume(LIFTS[1])).toBe(230);
    expect(liftVolume(LIFTS[5])).toBe(0);
  });
});

describe("weekly volume", () => {
  it("buckets by Monday-first week, oldest first, including empty weeks", () => {
    const weeks = weeklyVolume(LIFTS, "2026-10-14", 4);
    expect(weeks.map((w) => w.week)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(weeks[0]).toEqual({ week: "2026-09-21", kg: 0, sessions: 0 });
    expect(weeks[1]).toEqual({ week: "2026-09-28", kg: 234 + 230 + 0 + 189, sessions: 3 });
    expect(weeks[3].sessions).toBe(1);
  });
});

describe("consistency grid", () => {
  it("lays out weeks with what was planned and done", () => {
    const grid = consistencyGrid(plan, LIFTS, ["2026-09-29"], "2026-10-14", 3);
    expect(grid).toHaveLength(3);
    expect(grid[0][0]).toMatchObject({ date: "2026-09-28", plan: "strength", did: "strength", future: false });
    expect(grid[0][1]).toMatchObject({ plan: "backcare", did: "backcare" });
    expect(grid[2][4]).toMatchObject({ date: "2026-10-16", future: true, did: null });
  });

  it("treats days before the start as rest", () => {
    const grid = consistencyGrid(plan, [], [], "2026-09-30", 2);
    expect(grid[0].every((cell) => cell.plan === "rest")).toBe(true);
  });
});

describe("summary", () => {
  it("counts workouts, the last four weeks and weeks that met the plan", () => {
    expect(summarize(plan, LIFTS, "2026-10-14")).toEqual({
      workouts: 7,
      // Mon/Wed/Fri from 28 Sep through Wednesday 14 Oct: 8 planned, 7 done so far.
      last28: { done: 7, planned: 8 },
      totalKg: expect.any(Number),
      weeksInARow: 2,
    });
  });

  it("doesn't break the run for the week still in progress", () => {
    // Monday of week 3 with nothing logged yet: weeks 1 and 2 still count.
    expect(summarize(plan, LIFTS.slice(0, 7), "2026-10-12").weeksInARow).toBe(2);
  });
});
