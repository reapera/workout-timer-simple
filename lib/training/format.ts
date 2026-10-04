import { trimNumber } from "./equipment";
import type { ExerciseDef } from "./exercises";

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

/** "12, 11, 10" or "30 s, 25 s". */
export function formatValues(kind: ExerciseDef["kind"], values: number[]): string {
  return values.map((value) => (kind === "timed" ? `${value} s` : String(value))).join(", ");
}

/** "Oct 4" for a local yyyy-mm-dd date, in the phone's language. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
