import { snapDown, stepDown, stepUp } from "./equipment";
import type { ExerciseDef } from "./exercises";
import { formatKg } from "./format";
import type { ExerciseLog, SetResult, Slot } from "./types";

/**
 * Double progression, tuned for adjustable dumbbells and a careful back.
 *
 * Each exercise has a rep range. Reach the top of it on every set and the next
 * session moves to the next dumbbell up; otherwise the weight stays and the
 * goal is more reps. Falling well short twice in a row drops the weight a
 * step, and back pain overrides everything: no increase on discomfort, a step
 * down on pain.
 *
 * Pure and deterministic, so the phone (for instant feedback, even offline)
 * and the server (which writes Notion) always reach the same decision.
 */

/** Aim for roughly this much heavier when moving up (5%). */
export const MIN_STEP = 0.05;
/** A next dumbbell more than this much heavier is "a big jump" (20%). */
export const BIG_JUMP = 0.2;
/** Extra reps to earn before a big jump, added this many at a time… */
export const STRETCH_STEP = 3;
/** …up to this many above the normal top of the range. */
export const MAX_STRETCH = 6;
/** Backing off drops roughly this much (10%). */
export const BACK_OFF = 0.1;
/** A lighter week never drops more than this; if the next weight down is further, it keeps the weight. */
export const MAX_DELOAD_DROP = 0.25;
export const SECONDS_STEP = 5;
export const MIN_SECONDS = 10;

export type Outcome = "set" | "up" | "hold" | "down" | "stretch" | "skipped";

export type SlotState = Pick<Slot, "weight" | "stretch" | "stalls" | "seconds">;

export type Decision = {
  outcome: Outcome;
  next: SlotState;
  /** One line for the finish screen, e.g. "Next time: 9 kg ↑". */
  message: string;
};

export function decide(
  slot: Slot,
  exercise: ExerciseDef,
  log: ExerciseLog,
  ladder: number[],
  options: { deload?: boolean } = {},
): Decision {
  const current: SlotState = {
    weight: slot.weight,
    stretch: slot.stretch,
    stalls: slot.stalls,
    seconds: slot.seconds,
  };

  if (!log.sets.length) {
    return { outcome: "skipped", next: current, message: "Skipped — same plan next time" };
  }

  // A deload week is deliberately light: it says nothing about progress, so
  // nothing changes. Finding a first working weight still happens.
  const finding = exercise.load !== "none" && slot.weight === null;
  if (options.deload && !finding) {
    return { outcome: "hold", next: current, message: "Lighter week — back to your usual targets next week" };
  }

  if (exercise.kind === "timed") {
    return exercise.load === "none" ? decideTimed(slot, log, current) : decideLoadedHold(slot, log, ladder, current);
  }
  if (exercise.load === "none") return decideBodyweight(slot, log, current);
  if (slot.weight === null) return calibrate(slot, log, ladder);
  return decideLoaded(slot, log, ladder, current);
}

/* ------------------------------------------------------------------ *
 * Loaded exercises
 * ------------------------------------------------------------------ */

function decideLoaded(
  slot: Slot,
  log: ExerciseLog,
  ladder: number[],
  current: SlotState,
): Decision {
  const { weight, values } = workingSets(log.sets);
  const low = slot.repMin ?? 0;
  const top = (slot.repMax ?? low) + slot.stretch;
  const effort = log.effort ?? "good";
  const topHit = values.length >= log.plannedSets && values.every((value) => value >= top);
  const average = mean(values);
  const fellShort = average < low - 1 || (effort === "too_hard" && average < low);

  if (log.back === "pain") {
    const next = stepDown(ladder, weight, BACK_OFF);
    return {
      outcome: "down",
      next: { ...current, weight: next, stretch: 0, stalls: 0 },
      message: `Your back felt it — ${formatKg(next)} next time`,
    };
  }

  if (log.back === "mild") {
    return {
      outcome: "hold",
      next: { ...current, weight },
      message: `Same weight while your back settles — ${formatKg(weight)}`,
    };
  }

  if (topHit && effort !== "too_hard") {
    const up = stepUp(ladder, weight, MIN_STEP);

    if (up === null) {
      if (slot.stretch < MAX_STRETCH) {
        const stretch = Math.min(MAX_STRETCH, slot.stretch + STRETCH_STEP);
        return {
          outcome: "stretch",
          next: { ...current, weight, stretch, stalls: 0 },
          message: `That's your heaviest setup — aim for ${(slot.repMax ?? 0) + stretch} reps next time`,
        };
      }
      return {
        outcome: "hold",
        next: { ...current, weight, stalls: 0 },
        message: "Maxed out — slow each rep down to keep it challenging",
      };
    }

    const jump = weight > 0 ? (up - weight) / weight : 0;
    if (weight > 0 && jump > BIG_JUMP && slot.stretch < MAX_STRETCH) {
      const stretch = Math.min(MAX_STRETCH, slot.stretch + STRETCH_STEP);
      return {
        outcome: "stretch",
        next: { ...current, weight, stretch, stalls: 0 },
        message: `${formatKg(up)} is a big jump — first aim for ${(slot.repMax ?? 0) + stretch} reps`,
      };
    }

    return {
      outcome: "up",
      next: { ...current, weight: up, stretch: 0, stalls: 0 },
      message: `Next time: ${formatKg(up)} ↑`,
    };
  }

  if (fellShort) {
    const stalls = slot.stalls + 1;
    if (stalls >= 2) {
      const next = stepDown(ladder, weight, BACK_OFF);
      return {
        outcome: "down",
        next: { ...current, weight: next, stretch: 0, stalls: 0 },
        message: `Two tough sessions — ${formatKg(next)} next time to rebuild`,
      };
    }
    return {
      outcome: "hold",
      next: { ...current, weight, stalls },
      message: `Same weight — aim for ${low}+ reps`,
    };
  }

  return {
    outcome: "hold",
    next: { ...current, weight, stalls: 0 },
    message: `Same weight — beat today's reps`,
  };
}

/**
 * First time with a dumbbell: work out a weight from what was managed. In the
 * range → keep it. Outside it → estimate a one-rep max (Epley) and pick the
 * weight that should land mid-range, rounded down to what the plates allow.
 */
function calibrate(slot: Slot, log: ExerciseLog, ladder: number[]): Decision {
  const { weight, values } = workingSets(log.sets);
  const low = slot.repMin ?? 1;
  const high = slot.repMax ?? low;
  const average = mean(values);
  const positive = ladder.filter((value) => value > 0);

  let next: number;
  if (weight <= 0) {
    next = positive[0] ?? 0;
  } else if (average >= low && average <= high) {
    next = snapDown(ladder, weight);
  } else {
    const oneRepMax = weight * (1 + values[0] / 30);
    const target = oneRepMax / (1 + (low + high) / 2 / 30);
    next = snapDown(ladder, target);
    if (average > high) {
      // Never lighter than what was just handled, never more than +30% in one go.
      next = Math.min(Math.max(next, snapDown(ladder, weight)), snapDown(ladder, weight * 1.3));
    } else if (next >= weight) {
      next = stepDown(ladder, weight, 0);
    }
  }

  if (log.back === "pain") next = stepDown(ladder, next, BACK_OFF);

  return {
    outcome: "set",
    next: { weight: next, stretch: 0, stalls: 0, seconds: slot.seconds },
    message: `Your working weight: ${formatKg(next)}`,
  };
}

/* ------------------------------------------------------------------ *
 * Bodyweight and timed exercises
 * ------------------------------------------------------------------ */

function decideBodyweight(slot: Slot, log: ExerciseLog, current: SlotState): Decision {
  const values = log.sets.map((set) => set.value);
  const top = slot.repMax ?? 0;
  const topHit = values.length >= log.plannedSets && values.every((value) => value >= top);

  if (log.back === "pain" || log.back === "mild") {
    return { outcome: "hold", next: current, message: "Go gentler next time — make the movement smaller" };
  }
  if (topHit) {
    return { outcome: "hold", next: current, message: "Top of the range — slow every rep down" };
  }
  return { outcome: "hold", next: current, message: "Aim for one more rep next time" };
}

/** Every planned set held for the target, with a second of slack for stopping on the final beep. */
function heldEverySet(slot: Slot, log: ExerciseLog): boolean {
  const target = slot.seconds ?? MIN_SECONDS;
  const values = log.sets.map((set) => set.value);
  return values.length >= log.plannedSets && values.every((value) => value >= target - 1);
}

function decideTimed(slot: Slot, log: ExerciseLog, current: SlotState): Decision {
  const target = slot.seconds ?? MIN_SECONDS;
  const ceiling = slot.maxSeconds ?? target;
  const completed = heldEverySet(slot, log);

  if (log.back === "pain") {
    const seconds = Math.max(MIN_SECONDS, target - SECONDS_STEP);
    return {
      outcome: "down",
      next: { ...current, seconds, stalls: 0 },
      message: `Your back felt it — ${seconds} s next time`,
    };
  }
  if (log.back === "mild" || (completed && log.effort === "too_hard")) {
    return { outcome: "hold", next: current, message: `Same ${target} s next time` };
  }
  if (completed) {
    if (target >= ceiling) {
      return { outcome: "hold", next: { ...current, stalls: 0 }, message: `Top target reached — ${target} s` };
    }
    const seconds = Math.min(ceiling, target + SECONDS_STEP);
    return {
      outcome: "up",
      next: { ...current, seconds, stalls: 0 },
      message: `Next time: ${seconds} s ↑`,
    };
  }

  const stalls = current.stalls + 1;
  if (stalls >= 2) {
    const seconds = Math.max(MIN_SECONDS, target - SECONDS_STEP);
    return {
      outcome: "down",
      next: { ...current, seconds, stalls: 0 },
      message: `${seconds} s next time to rebuild`,
    };
  }
  return { outcome: "hold", next: { ...current, stalls }, message: `Same ${target} s next time` };
}

/**
 * Holds with a dumbbell (carries): the first session sets the weight; after
 * that the time goes up 5 s at a time, and once the top time is held on every
 * set, the next dumbbell up starts again from about half the time.
 */
function decideLoadedHold(slot: Slot, log: ExerciseLog, ladder: number[], current: SlotState): Decision {
  const { weight } = workingSets(log.sets);
  const target = slot.seconds ?? MIN_SECONDS;
  const ceiling = slot.maxSeconds ?? target;

  if (slot.weight === null) {
    const next = log.back === "pain" ? stepDown(ladder, weight, BACK_OFF) : snapDown(ladder, weight);
    return {
      outcome: "set",
      next: { ...current, weight: next, stretch: 0, stalls: 0 },
      message: `Your working weight: ${formatKg(next)}`,
    };
  }

  if (log.back === "pain") {
    const next = stepDown(ladder, weight, BACK_OFF);
    return {
      outcome: "down",
      next: { ...current, weight: next, stalls: 0 },
      message: `Your back felt it — ${formatKg(next)} next time`,
    };
  }

  if (target >= ceiling && heldEverySet(slot, log) && log.back !== "mild" && log.effort !== "too_hard") {
    const up = stepUp(ladder, weight, MIN_STEP);
    if (up === null) {
      return {
        outcome: "hold",
        next: { ...current, weight, stalls: 0 },
        message: `Top target reached — ${target} s with your heaviest setup`,
      };
    }
    const restart = Math.max(MIN_SECONDS, Math.floor(ceiling / 2 / SECONDS_STEP) * SECONDS_STEP);
    return {
      outcome: "up",
      next: { ...current, weight: up, seconds: restart, stalls: 0 },
      message: `Next time: ${formatKg(up)} ↑ for ${restart} s`,
    };
  }

  // Below the top time it works like any hold, at the weight actually carried.
  return decideTimed(slot, log, { ...current, weight });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * The weight most sets were done with (the lighter one on a tie) and the reps
 * done at it. Swapping weights mid-exercise is allowed; progression follows
 * the weight that was actually worked.
 */
export function workingSets(sets: SetResult[]): { weight: number; values: number[] } {
  const counts = new Map<number, number>();
  for (const set of sets) counts.set(set.weight, (counts.get(set.weight) ?? 0) + 1);

  let weight = sets[0]?.weight ?? 0;
  let most = 0;
  for (const [candidate, count] of counts) {
    if (count > most || (count === most && candidate < weight)) {
      weight = candidate;
      most = count;
    }
  }
  return { weight, values: sets.filter((set) => set.weight === weight).map((set) => set.value) };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
