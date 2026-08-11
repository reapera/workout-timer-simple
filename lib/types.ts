export type Exercise = {
  /** Notion page id, or a `tmp-` prefixed id for rows not yet saved. */
  id: string;
  name: string;
  /** Work duration in seconds. */
  duration: number;
};

export type Routine = {
  id: string;
  name: string;
  isDefault: boolean;
  lastUsed: string | null;
  exercises: Exercise[];
};

/** Fixed by spec: 5s to get ready, 5s to recover before the next exercise. */
export const PREP_SECONDS = 5;
export const REST_SECONDS = 5;

export type SegmentKind = "prep" | "work" | "rest";

export type Segment = {
  kind: SegmentKind;
  seconds: number;
  /** Index into `Routine.exercises` that this segment belongs to. */
  exerciseIndex: number;
  /** Name of the exercise this segment leads into (prep/work) or just finished (rest). */
  exerciseName: string;
};

/**
 * Flattens a routine into the segment timeline the engine walks through:
 * prep → work → rest → prep → work → rest … with no trailing rest, since
 * there is nothing left to get ready for.
 */
export function buildTimeline(exercises: Exercise[]): Segment[] {
  const segments: Segment[] = [];

  exercises.forEach((exercise, exerciseIndex) => {
    const base = { exerciseIndex, exerciseName: exercise.name };
    segments.push({ ...base, kind: "prep", seconds: PREP_SECONDS });
    segments.push({ ...base, kind: "work", seconds: exercise.duration });
    if (exerciseIndex < exercises.length - 1) {
      segments.push({ ...base, kind: "rest", seconds: REST_SECONDS });
    }
  });

  return segments;
}

export function totalWorkSeconds(exercises: Exercise[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.duration, 0);
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "2m 15s" / "45s" — for prose rather than a running clock. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}
