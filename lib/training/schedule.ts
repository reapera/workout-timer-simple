import { DAYS, type DayName, type Programme, type SessionMark, type WorkoutKey } from "./types";

/**
 * The fixed weekly schedule: strength on training days (alternating Workout A
 * and B), back care on its days, rest otherwise. Missing a strength day never
 * skips a workout — the rotation simply carries on from the last one done.
 *
 * Dates are local calendar dates (YYYY-MM-DD) throughout; the phone decides
 * what "today" is, never the server.
 */

export type DayPlan = "strength" | "backcare" | "rest";

export type DayStatus = "done" | "missed" | "skipped" | "today" | "upcoming" | "rest";

export type StripDay = {
  date: string;
  day: DayName;
  plan: DayPlan;
  status: DayStatus;
  /** Strength days: what was done, or what is planned. */
  workout?: WorkoutKey;
};

export type TodayPlan = {
  date: string;
  day: DayName;
  week: number;
  plan: DayPlan;
  doneStrength: boolean;
  doneBackCare: boolean;
  /** The strength workout to do next (today's, if today is a pending strength day). */
  workout: WorkoutKey;
  /** What was done today, if a strength session is already logged. */
  doneWorkout: WorkoutKey | null;
  /** A recent strength day that was missed and can be made up today. */
  catchUp: { date: string; day: DayName } | null;
  /** Next strength session: today if still to do, otherwise the next training day. */
  next: { date: string; day: DayName; workout: WorkoutKey } | null;
  strip: StripDay[];
};

export const DAYS_IN_WEEK = 7;

/** Calendar reminders go off at this time until another is picked. */
export const DEFAULT_REMINDER_TIME = "18:00";

export const DEFAULT_TRAINING_DAYS: DayName[] = ["Mon", "Wed", "Fri"];
export const DEFAULT_BACK_CARE_DAYS: DayName[] = ["Tue", "Thu", "Sat"];

/* ------------------------------------------------------------------ *
 * Date helpers (local calendar dates)
 * ------------------------------------------------------------------ */

export function localDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcMidnight(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(toUtcMidnight(iso) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

export function dayOf(iso: string): DayName {
  const sundayFirst = new Date(toUtcMidnight(iso)).getUTCDay();
  return DAYS[(sundayFirst + 6) % 7];
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, -DAYS.indexOf(dayOf(iso)));
}

export function weekNumber(startDate: string, date: string): number {
  return Math.max(1, Math.floor(daysBetween(startDate, date) / 7) + 1);
}

/** A deload lasts seven days, ending on `deloadUntil`. */
export const DELOAD_DAYS = 7;

export function inDeload(programme: { deloadUntil: string | null }, date: string): boolean {
  const until = programme.deloadUntil;
  return Boolean(until) && date <= until! && date >= addDays(until!, -(DELOAD_DAYS - 1));
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

type Days = Pick<Programme, "trainingDays" | "backCareDays">;

export function planFor(days: Days, iso: string): DayPlan {
  const day = dayOf(iso);
  if (days.trainingDays.includes(day)) return "strength";
  if (days.backCareDays.includes(day)) return "backcare";
  return "rest";
}

function byTime(a: SessionMark, b: SessionMark): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.at ?? "") < (b.at ?? "") ? -1 : (a.at ?? "") > (b.at ?? "") ? 1 : 0;
}

export function other(workout: WorkoutKey): WorkoutKey {
  return workout === "A" ? "B" : "A";
}

/** A after B after A… starting with A. */
export function nextWorkoutKey(history: SessionMark[]): WorkoutKey {
  const strength = history.filter((mark) => mark.kind === "strength" && mark.workout).sort(byTime);
  const last = strength[strength.length - 1];
  return last?.workout ? other(last.workout) : "A";
}

export function buildToday(
  programme: Pick<Programme, "trainingDays" | "backCareDays" | "startDate">,
  history: SessionMark[],
  today: string,
): TodayPlan {
  const plan = planFor(programme, today);
  const on = (date: string, kind: SessionMark["kind"]) =>
    history.filter((mark) => mark.date === date && mark.kind === kind).sort(byTime);

  const todayStrength = on(today, "strength");
  const doneStrength = todayStrength.length > 0;
  const doneBackCare = on(today, "backcare").length > 0;
  const doneWorkout = todayStrength[todayStrength.length - 1]?.workout ?? null;
  const upNext = nextWorkoutKey(history);

  // A strength day in the last three days, after the start, with nothing done since.
  let catchUp: TodayPlan["catchUp"] = null;
  if (plan !== "strength" && !doneStrength) {
    const lastStrengthDate = history
      .filter((mark) => mark.kind === "strength")
      .map((mark) => mark.date)
      .sort()
      .pop();
    for (let back = 1; back <= 3; back += 1) {
      const date = addDays(today, -back);
      if (date < programme.startDate) break;
      if (planFor(programme, date) !== "strength") continue;
      if (!lastStrengthDate || lastStrengthDate < date) catchUp = { date, day: dayOf(date) };
      break;
    }
  }

  let next: TodayPlan["next"] = null;
  if (plan === "strength" && !doneStrength) {
    next = { date: today, day: dayOf(today), workout: upNext };
  } else {
    for (let ahead = 1; ahead <= 7; ahead += 1) {
      const date = addDays(today, ahead);
      if (planFor(programme, date) === "strength") {
        next = { date, day: dayOf(date), workout: upNext };
        break;
      }
    }
  }

  // This week, Monday to Sunday, with future strength days labelled in rotation order.
  const monday = weekStart(today);
  let projected = upNext;
  const strip: StripDay[] = DAYS.map((day, index) => {
    const date = addDays(monday, index);
    const dayPlan: DayPlan = date < programme.startDate ? "rest" : planFor(programme, date);
    const strength = on(date, "strength");
    const didStrength = strength.length > 0;
    const didBackCare = on(date, "backcare").length > 0;
    const done = dayPlan === "backcare" ? didBackCare || didStrength : didStrength || (dayPlan === "rest" && didBackCare);

    let status: DayStatus;
    if (done) status = "done";
    else if (date < today) status = dayPlan === "strength" ? "missed" : dayPlan === "backcare" ? "skipped" : "rest";
    else if (date === today) status = dayPlan === "rest" ? "rest" : "today";
    else status = dayPlan === "rest" ? "rest" : "upcoming";

    let workout: WorkoutKey | undefined;
    if (didStrength) {
      workout = strength[strength.length - 1].workout;
    } else if (dayPlan === "strength" && date >= today) {
      workout = projected;
      projected = other(projected);
    }

    return { date, day, plan: dayPlan, status, workout };
  });

  return {
    date: today,
    day: dayOf(today),
    week: weekNumber(programme.startDate, today),
    plan,
    doneStrength,
    doneBackCare,
    workout: doneStrength && doneWorkout ? doneWorkout : upNext,
    doneWorkout,
    catchUp,
    next,
    strip,
  };
}
