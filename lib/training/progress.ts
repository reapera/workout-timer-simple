import { getExercise } from "./exercises";
import { addDays, DAYS_IN_WEEK, planFor, weekStart, type DayPlan } from "./schedule";
import type { LiftEntry, Programme } from "./types";

/**
 * Read-outs for the Progress page, all derived from the Lift Log history.
 * Pure functions, so they're tested directly and run the same offline.
 */

export type SeriesPoint = {
  date: string;
  weight: number;
  /** Best single set: most reps, or longest hold. */
  best: number;
  total: number;
  values: number[];
};

export type MetricKind = "weight" | "reps" | "seconds";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** One point per session for an exercise. */
export function exerciseSeries(lifts: LiftEntry[], exerciseId: string): SeriesPoint[] {
  return lifts
    .filter((lift) => lift.exerciseId === exerciseId && lift.values.length)
    .map((lift) => ({
      date: lift.date,
      weight: lift.weight,
      best: Math.max(...lift.values),
      total: sum(lift.values),
      values: lift.values,
    }));
}

/** Weight once a dumbbell is involved; otherwise the best set's reps or seconds. */
export function metricFor(exerciseId: string, series: SeriesPoint[]): MetricKind {
  const exercise = getExercise(exerciseId);
  if (exercise.kind === "timed") return "seconds";
  if (exercise.load !== "none" && series.some((point) => point.weight > 0)) return "weight";
  return "reps";
}

export function metricValue(kind: MetricKind, point: SeriesPoint): number {
  return kind === "weight" ? point.weight : point.best;
}

export type Best = { date: string; weight: number; value: number };

/** Heaviest weight (then most reps at it); for bodyweight or holds, the best set. */
export function personalBest(exerciseId: string, series: SeriesPoint[]): Best | null {
  if (!series.length) return null;
  const kind = metricFor(exerciseId, series);
  let best = series[0];
  for (const point of series) {
    const better =
      kind === "weight"
        ? point.weight > best.weight || (point.weight === best.weight && point.best > best.best)
        : point.best > best.best;
    if (better) best = point;
  }
  return { date: best.date, weight: best.weight, value: best.best };
}

/** kg moved in a session: weight × reps for every set, both dumbbells counted. */
export function liftVolume(lift: LiftEntry): number {
  const exercise = getExercise(lift.exerciseId);
  if (exercise.kind !== "reps") return 0;
  return lift.weight * sum(lift.values) * (exercise.load === "pair" ? 2 : 1);
}

export type WeekVolume = { week: string; kg: number; sessions: number };

/** The last `weeks` weeks (Monday-first), oldest first, ending with this week. */
export function weeklyVolume(lifts: LiftEntry[], today: string, weeks = 8): WeekVolume[] {
  const thisWeek = weekStart(today);
  return Array.from({ length: weeks }, (_, index) => {
    const week = addDays(thisWeek, -(weeks - 1 - index) * DAYS_IN_WEEK);
    const end = addDays(week, DAYS_IN_WEEK - 1);
    const inWeek = lifts.filter((lift) => lift.date >= week && lift.date <= end);
    return {
      week,
      kg: Math.round(sum(inWeek.map(liftVolume))),
      sessions: new Set(inWeek.map((lift) => lift.session)).size,
    };
  });
}

export type CalendarCell = {
  date: string;
  plan: DayPlan;
  did: "strength" | "backcare" | null;
  future: boolean;
};

/** Week rows (Monday-first, oldest first) of what was planned and what was done. */
export function consistencyGrid(
  programme: Pick<Programme, "trainingDays" | "backCareDays" | "startDate">,
  lifts: LiftEntry[],
  backCare: string[],
  today: string,
  weeks = 8,
): CalendarCell[][] {
  const strengthDays = new Set(lifts.map((lift) => lift.date));
  const backCareDays = new Set(backCare);
  const thisWeek = weekStart(today);

  return Array.from({ length: weeks }, (_, row) => {
    const monday = addDays(thisWeek, -(weeks - 1 - row) * DAYS_IN_WEEK);
    return Array.from({ length: DAYS_IN_WEEK }, (_, column) => {
      const date = addDays(monday, column);
      return {
        date,
        plan: date < programme.startDate ? "rest" : planFor(programme, date),
        did: strengthDays.has(date) ? "strength" : backCareDays.has(date) ? "backcare" : null,
        future: date > today,
      };
    });
  });
}

export type Summary = {
  workouts: number;
  last28: { done: number; planned: number };
  totalKg: number;
  weeksInARow: number;
};

function plannedStrength(
  programme: Pick<Programme, "trainingDays" | "backCareDays" | "startDate">,
  from: string,
  to: string,
): number {
  let count = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (date >= programme.startDate && planFor(programme, date) === "strength") count += 1;
  }
  return count;
}

export function summarize(
  programme: Pick<Programme, "trainingDays" | "backCareDays" | "startDate">,
  lifts: LiftEntry[],
  today: string,
): Summary {
  const sessionsBetween = (from: string, to: string) =>
    new Set(lifts.filter((lift) => lift.date >= from && lift.date <= to).map((lift) => lift.session)).size;

  const from28 = addDays(today, -27);

  // Weeks in a row that met the plan: this week counts once it's met, otherwise start from last week.
  let weeksInARow = 0;
  let monday = weekStart(today);
  const weekMet = (start: string) => {
    const end = addDays(start, DAYS_IN_WEEK - 1);
    const planned = plannedStrength(programme, start, end);
    return planned > 0 && sessionsBetween(start, end) >= planned;
  };
  if (!weekMet(monday)) monday = addDays(monday, -DAYS_IN_WEEK);
  while (addDays(monday, DAYS_IN_WEEK - 1) >= programme.startDate && weekMet(monday)) {
    weeksInARow += 1;
    monday = addDays(monday, -DAYS_IN_WEEK);
  }

  return {
    workouts: new Set(lifts.map((lift) => lift.session)).size,
    last28: { done: sessionsBetween(from28, today), planned: plannedStrength(programme, from28, today) },
    totalKg: Math.round(sum(lifts.map(liftVolume))),
    weeksInARow,
  };
}
