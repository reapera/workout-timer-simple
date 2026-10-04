import { describe, expect, it } from "vitest";

import {
  addDays,
  buildToday,
  dayOf,
  daysBetween,
  nextInRotation,
  nextWorkoutKey,
  planFor,
  rotationFor,
  weekNumber,
  weekStart,
} from "./schedule";
import type { DayName, SessionMark } from "./types";

const programme = {
  trainingDays: ["Mon", "Wed", "Fri"] as const,
  backCareDays: ["Tue", "Thu", "Sat"] as const,
  startDate: "2026-09-28",
};
const days = { ...programme, trainingDays: [...programme.trainingDays], backCareDays: [...programme.backCareDays] };

// 2026-09-28 is a Monday.
const MON = "2026-09-28";
const TUE = "2026-09-29";
const WED = "2026-09-30";
const THU = "2026-10-01";
const FRI = "2026-10-02";

const strength = (date: string, workout: "A" | "B" | "C", at?: string): SessionMark => ({
  date,
  kind: "strength",
  workout,
  at,
});

describe("dates", () => {
  it("works in local calendar days", () => {
    expect(dayOf(MON)).toBe("Mon");
    expect(dayOf(THU)).toBe("Thu");
    expect(addDays(THU, 1)).toBe(FRI);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween(MON, FRI)).toBe(4);
    expect(weekStart(THU)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
  });

  it("counts programme weeks from the start date", () => {
    expect(weekNumber(MON, MON)).toBe(1);
    expect(weekNumber(MON, "2026-10-04")).toBe(1);
    expect(weekNumber(MON, "2026-10-05")).toBe(2);
    expect(weekNumber(MON, "2026-09-01")).toBe(1);
  });
});

describe("rotation", () => {
  it("starts with A and alternates from the last session", () => {
    expect(nextWorkoutKey([])).toBe("A");
    expect(nextWorkoutKey([strength(MON, "A")])).toBe("B");
    expect(nextWorkoutKey([strength(WED, "B"), strength(MON, "A")])).toBe("A");
  });

  it("orders two sessions on the same day by time", () => {
    const marks = [strength(MON, "B", "2026-09-28T18:00:00Z"), strength(MON, "A", "2026-09-28T08:00:00Z")];
    expect(nextWorkoutKey(marks)).toBe("A");
  });

  it("ignores back care sessions", () => {
    expect(nextWorkoutKey([strength(MON, "A"), { date: TUE, kind: "backcare" }])).toBe("B");
  });
});

describe("planFor", () => {
  it("maps weekdays onto the schedule", () => {
    expect(planFor(days, MON)).toBe("strength");
    expect(planFor(days, TUE)).toBe("backcare");
    expect(planFor(days, "2026-10-04")).toBe("rest");
  });
});

describe("buildToday", () => {
  it("offers Workout A on the very first training day", () => {
    const today = buildToday(days, [], MON);
    expect(today).toMatchObject({ plan: "strength", workout: "A", doneStrength: false, week: 1 });
    expect(today.next).toEqual({ date: MON, day: "Mon", workout: "A" });
    expect(today.strip.map((d) => [d.day, d.status, d.workout])).toEqual([
      ["Mon", "today", "A"],
      ["Tue", "upcoming", undefined],
      ["Wed", "upcoming", "B"],
      ["Thu", "upcoming", undefined],
      ["Fri", "upcoming", "A"],
      ["Sat", "upcoming", undefined],
      ["Sun", "rest", undefined],
    ]);
  });

  it("shows what was done and what is next once today's workout is logged", () => {
    const today = buildToday(days, [strength(MON, "A")], MON);
    expect(today).toMatchObject({ doneStrength: true, workout: "A", doneWorkout: "A" });
    expect(today.next).toEqual({ date: WED, day: "Wed", workout: "B" });
    expect(today.strip[0]).toMatchObject({ status: "done", workout: "A" });
  });

  it("offers to catch up a missed workout without skipping it", () => {
    const today = buildToday(days, [strength(MON, "A")], THU);
    expect(today.plan).toBe("backcare");
    expect(today.catchUp).toEqual({ date: WED, day: "Wed" });
    expect(today.workout).toBe("B");
    expect(today.next).toEqual({ date: FRI, day: "Fri", workout: "B" });
    expect(today.strip[2]).toMatchObject({ day: "Wed", status: "missed" });
  });

  it("counts a catch-up session on a back care day", () => {
    const history = [strength(MON, "A"), strength(THU, "B")];
    const today = buildToday(days, history, THU);
    expect(today.catchUp).toBeNull();
    expect(today.strip[3]).toMatchObject({ day: "Thu", status: "done", workout: "B" });
    expect(today.next?.workout).toBe("A");
  });

  it("marks back care done or skipped", () => {
    const history: SessionMark[] = [strength(MON, "A"), { date: TUE, kind: "backcare" }];
    const today = buildToday(days, history, THU);
    expect(today.strip[1].status).toBe("done");
    expect(buildToday(days, [strength(MON, "A")], THU).strip[1].status).toBe("skipped");
    expect(buildToday(days, [{ date: THU, kind: "backcare" }], THU).doneBackCare).toBe(true);
  });

  it("does not ask to catch up days before the programme started", () => {
    const today = buildToday({ ...days, startDate: THU }, [], THU);
    expect(today.catchUp).toBeNull();
    expect(today.strip.slice(0, 3).every((d) => d.plan === "rest")).toBe(true);
  });

  it("does not ask to catch up once more than three days have passed", () => {
    const today = buildToday(days, [strength(MON, "A")], "2026-10-04");
    expect(today.catchUp).toEqual({ date: FRI, day: "Fri" });
    expect(buildToday(days, [strength(MON, "A")], "2026-10-04").next?.date).toBe("2026-10-05");
  });
});

describe("plans with more workouts", () => {
  const split = ["A", "B", "C"] as const;

  it("rotates through every workout that has exercises", () => {
    expect(rotationFor([{ workout: "C" }, { workout: "A" }, { workout: "B" }, { workout: "A" }])).toEqual(["A", "B", "C"]);
    expect(rotationFor([{ workout: "B" }])).toEqual(["B"]);
    expect(rotationFor([])).toEqual(["A"]);
    expect(nextInRotation(split, "B")).toBe("C");
    expect(nextInRotation(split, "C")).toBe("A");
    // A workout that's no longer in the plan starts it again.
    expect(nextInRotation(["A", "B"], "C")).toBe("A");
  });

  it("follows the rotation after the last workout done", () => {
    expect(nextWorkoutKey([strength(MON, "A"), strength(WED, "B")], split)).toBe("C");
    expect(nextWorkoutKey([strength(MON, "C")], split)).toBe("A");
  });

  it("starts a newly switched-in plan from its first workout", () => {
    const history = [strength(MON, "A", `${MON}T07:00:00.000Z`), strength(WED, "B", `${WED}T07:00:00.000Z`)];
    expect(nextWorkoutKey(history, split, `${WED}T09:00:00.000Z`)).toBe("A");
    // Workouts done since the switch count again.
    expect(nextWorkoutKey([...history, strength(FRI, "A", `${FRI}T07:00:00.000Z`)], split, `${WED}T09:00:00.000Z`)).toBe("B");
  });

  it("labels the week with the rotation, e.g. six days of Upper / Legs / Core", () => {
    const sixDays = { ...days, trainingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as DayName[], backCareDays: [] };
    const today = buildToday(sixDays, [], MON, split);
    expect(today.strip.map((day) => day.workout ?? "-").join("")).toBe("ABCABC-");
    expect(today.workout).toBe("A");
  });
});
