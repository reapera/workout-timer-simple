import { trimNumber } from "./equipment";
import type { ExerciseDef } from "./exercises";
import type { NextStep } from "./progression";

/** "8.5 kg", or "bodyweight" for 0. */
export function formatKg(kg: number): string {
  return kg > 0 ? `${trimNumber(kg)} kg` : "bodyweight";
}

/** "2.5 + 1.25" — the plates for one end of the handle. */
export function formatPlates(perSide: number[]): string {
  return perSide.length ? perSide.map(trimNumber).join(" + ") : "empty handle";
}

/** "10–15 reps" / "8–12 reps per leg" / "20 s per side". */
export function formatTarget(
  exercise: Pick<ExerciseDef, "kind" | "perSide" | "id">,
  target: { repMin: number | null; repMax: number | null; seconds: number | null; stretch?: number },
): string {
  const side = exercise.perSide ? ` ${perSideWord(exercise)}` : "";
  if (exercise.kind === "timed") return `${target.seconds ?? 0} s${side}`;
  const top = (target.repMax ?? 0) + (target.stretch ?? 0);
  return `${target.repMin ?? 0}–${top} reps${side}`;
}

export function perSideWord(exercise: Pick<ExerciseDef, "id">): string {
  return /squat|lunge|leg/.test(exercise.id) ? "per leg" : "per side";
}

/**
 * The next step up. Short, for a list row: "15 reps every set → 7 kg".
 * Long, for the workout screen: "Get 15 reps on every set and next time
 * goes up to 7 kg each."
 */
export function formatNextStep(
  step: NextStep,
  exercise: Pick<ExerciseDef, "kind" | "load">,
  options: { long?: boolean } = {},
): string {
  const timed = exercise.kind === "timed";
  const each = exercise.load === "pair" ? " each" : "";
  if (!options.long) {
    const goal = timed ? `${step.target} s every set` : `${step.target} reps every set`;
    if (step.kind === "weight") return `${goal} → ${trimNumber(step.weight)} kg`;
    if (step.kind === "seconds") return `${goal} → ${step.seconds} s`;
    return `${goal} → aim for ${step.reps}`;
  }
  const goal = timed
    ? `${exercise.load === "none" ? "Hold" : "Carry"} for ${step.target} s on every set`
    : `Get ${step.target} reps on every set`;
  if (step.kind === "weight") {
    const restart = step.seconds !== null ? ` (for ${step.seconds} s)` : "";
    return `${goal} and next time goes up to ${trimNumber(step.weight)} kg${each}${restart}.`;
  }
  if (step.kind === "seconds") return `${goal} and next time is ${step.seconds} s.`;
  return `${goal} and next time aims for ${step.reps} — the next dumbbell up is a big jump.`;
}

/** "12, 11, 10" or "30 s, 25 s". */
export function formatValues(kind: ExerciseDef["kind"], values: number[]): string {
  return values.map((value) => (kind === "timed" ? `${value} s` : String(value))).join(", ");
}

/** "Oct 4" for a local yyyy-mm-dd date, in the phone's language. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
