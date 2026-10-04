import { ladderFor, stepUp } from "./equipment";
import { getExercise, HARDER } from "./exercises";
import { MAX_STRETCH, MIN_STEP } from "./progression";
import { addDays, daysBetween, planFor, weekNumber } from "./schedule";
import type { DayName, History, TrainingData } from "./types";

/**
 * Every four weeks the plan looks back and suggests changes: a lighter week
 * when things went backwards or the back complained, a harder variation once
 * a lift has topped out on the dumbbells, fewer days if three didn't fit.
 * Nothing changes unless it's accepted.
 */

export const BLOCK_WEEKS = 4;

/** The 4-week block waiting to be reviewed, if any. */
export function reviewDue(
  programme: { startDate: string; lastReview: number },
  today: string,
): number | null {
  const block = Math.floor((weekNumber(programme.startDate, today) - 1) / BLOCK_WEEKS);
  return block >= 1 && block > programme.lastReview ? block : null;
}

/** The day the next review comes due, once the current (or next unreviewed) block ends. */
export function nextReviewDate(programme: { startDate: string; lastReview: number }, today: string): string {
  const current = Math.floor((weekNumber(programme.startDate, today) - 1) / BLOCK_WEEKS);
  return addDays(programme.startDate, (Math.max(programme.lastReview, current) + 1) * BLOCK_WEEKS * 7);
}

export function blockRange(startDate: string, block: number): { from: string; to: string } {
  const days = BLOCK_WEEKS * 7;
  return { from: addDays(startDate, (block - 1) * days), to: addDays(startDate, block * days - 1) };
}

export type LiftReview = {
  slotId: string;
  exerciseId: string;
  sessions: number;
  startWeight: number | null;
  endWeight: number | null;
  ups: number;
  downs: number;
  pains: number;
  /** The harder variation to offer, when this lift has topped out. */
  harder: string | null;
};

export type Suggestion =
  | { id: "deload"; kind: "deload"; title: string; detail: string }
  | { id: string; kind: "swap"; title: string; detail: string; slotId: string; to: string }
  | {
      id: "schedule";
      kind: "schedule";
      title: string;
      detail: string;
      trainingDays: DayName[];
      backCareDays: DayName[];
    };

export type Review = {
  block: number;
  from: string;
  to: string;
  strength: { done: number; planned: number };
  backCare: { done: number; planned: number };
  lifts: LiftReview[];
  suggestions: Suggestion[];
  /** One line on how the block went. */
  headline: string;
};

const TWO_DAYS: { trainingDays: DayName[]; backCareDays: DayName[] } = {
  trainingDays: ["Mon", "Thu"],
  backCareDays: ["Tue", "Sat"],
};

export function buildReview(data: TrainingData, history: History, block: number, today: string): Review {
  const { programme } = data;
  const { from, to } = blockRange(programme.startDate, block);
  const inBlock = history.lifts.filter((lift) => lift.date >= from && lift.date <= to);

  let plannedStrength = 0;
  let plannedBackCare = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const plan = planFor(programme, date);
    if (plan === "strength") plannedStrength += 1;
    if (plan === "backcare") plannedBackCare += 1;
  }
  const strength = { done: new Set(inBlock.map((lift) => lift.session)).size, planned: plannedStrength };
  const backCare = {
    done: history.backCare.filter((date) => date >= from && date <= to).length,
    planned: plannedBackCare,
  };

  const lifts = [...data.slots]
    .sort((a, b) => (a.workout === b.workout ? a.order - b.order : a.workout < b.workout ? -1 : 1))
    .map((slot): LiftReview => {
      const exercise = getExercise(slot.exerciseId);
      const entries = inBlock.filter((lift) => lift.exerciseId === slot.exerciseId);
      const loaded = exercise.kind === "reps" && exercise.load !== "none";
      const toppedOut =
        loaded &&
        slot.weight !== null &&
        slot.stretch >= MAX_STRETCH &&
        stepUp(ladderFor(exercise, programme.equipment), slot.weight, MIN_STEP) === null;

      return {
        slotId: slot.id,
        exerciseId: slot.exerciseId,
        sessions: entries.length,
        startWeight: loaded ? (entries[0]?.weight ?? null) : null,
        endWeight: loaded ? slot.weight : null,
        ups: entries.filter((lift) => lift.result === "Up").length,
        downs: entries.filter((lift) => lift.result === "Down").length,
        pains: entries.filter((lift) => lift.back === "Pain").length,
        harder: toppedOut ? (HARDER[slot.exerciseId] ?? null) : null,
      };
    });

  const suggestions: Suggestion[] = [];
  const downs = lifts.reduce((total, lift) => total + lift.downs, 0);
  const pains = lifts.reduce((total, lift) => total + lift.pains, 0);
  const recentDeload = programme.deloadUntil !== null && daysBetween(programme.deloadUntil, today) < BLOCK_WEEKS * 7;

  if (!recentDeload && strength.done > 0) {
    const reason =
      pains >= 2
        ? `Your back reported pain ${pains} times this block.`
        : downs >= 2
          ? "A couple of lifts went backwards this block — usually a sign you need recovery, not more effort."
          : block % 2 === 0
            ? "Eight weeks of steady work: a planned easy week now keeps your joints and back happy."
            : null;
    if (reason) {
      suggestions.push({
        id: "deload",
        kind: "deload",
        title: "Take a lighter week",
        detail: `${reason} For the next 7 days: one set fewer and a little lighter, with no weight changes. Then straight back to your normal targets.`,
      });
    }
  }

  for (const lift of lifts) {
    if (!lift.harder) continue;
    const from = getExercise(lift.exerciseId).name;
    const toName = getExercise(lift.harder).name;
    suggestions.push({
      id: `swap-${lift.slotId}`,
      kind: "swap",
      title: `Make ${from.toLowerCase()} harder`,
      detail: `You've topped out your dumbbells on ${from.toLowerCase()}. Switch to ${toName.toLowerCase()}: same muscles, much harder per side. Its first session finds your new weight.`,
      slotId: lift.slotId,
      to: lift.harder,
    });
  }

  // Only after some attempts: an empty block is more likely illness or travel than a bad fit.
  if (programme.trainingDays.length >= 3 && strength.done > 0 && strength.done < strength.planned / 2) {
    suggestions.push({
      id: "schedule",
      kind: "schedule",
      title: "Switch to 2 strength days",
      detail: `You managed ${strength.done} of ${strength.planned} workouts. Two days you can keep beats three you can't: strength on Monday and Thursday, back care on Tuesday and Saturday.`,
      ...TWO_DAYS,
    });
  }

  const ups = lifts.reduce((total, lift) => total + lift.ups, 0);
  const headline =
    strength.done === 0
      ? "No workouts logged in this block yet — today is a good day to restart."
      : ups > 0
        ? `${strength.done} of ${strength.planned} workouts done, and your weights went up ${ups} time${ups === 1 ? "" : "s"}.`
        : `${strength.done} of ${strength.planned} workouts done. Steady weeks build the base for the next jump.`;

  return { block, from, to, strength, backCare, lifts, suggestions, headline };
}
