export type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const DAYS: readonly DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type WorkoutKey = "A" | "B";

export type PlateStock = {
  /** kg per plate. */
  size: number;
  /** How many of that plate you own in total, across all handles. */
  count: number;
};

export type Equipment = {
  /** Adjustable dumbbell handles owned (1 or 2). */
  handles: 1 | 2;
  /** One empty handle with its collars, in kg. */
  handleWeight: number;
  plates: PlateStock[];
  /** How many plates fit on each end of one handle. */
  platesPerSide: number;
  bench: boolean;
};

export type Level = "beginner" | "intermediate";

/** One row of the Training Programme database. */
export type Programme = {
  id: string;
  name: string;
  /** YYYY-MM-DD; week 1 starts here. */
  startDate: string;
  trainingDays: DayName[];
  backCareDays: DayName[];
  equipment: Equipment;
  level: Level;
  /** Lower-back care: asks about the back after every exercise. */
  backPain: boolean;
};

/** One row of the Programme Exercises database: an exercise and where it stands. */
export type Slot = {
  id: string;
  exerciseId: string;
  workout: WorkoutKey;
  order: number;
  /** Full working sets; beginners do fewer in the first two weeks. */
  sets: number;
  repMin: number | null;
  repMax: number | null;
  /** Timed holds: current target and ceiling, in seconds. */
  seconds: number | null;
  maxSeconds: number | null;
  /** Rest between sets, in seconds. */
  rest: number;
  /** kg per dumbbell. `null` = still finding your weight; 0 = bodyweight. */
  weight: number | null;
  /** Extra reps above `repMax` to earn before a big jump to the next dumbbell. */
  stretch: number;
  /** Sessions in a row that fell short of the rep range. */
  stalls: number;
  /** Session id that last changed this row, so a retried upload is a no-op. */
  lastSession: string | null;
  lastDone: string | null;
};

export type Effort = "easy" | "good" | "hard" | "too_hard";
export type BackFeel = "none" | "mild" | "pain";

export type SetResult = {
  /** kg per dumbbell; 0 for bodyweight. */
  weight: number;
  /** Reps, or seconds held for timed exercises. Per side for one-sided moves. */
  value: number;
};

export type ExerciseLog = {
  slotId: string;
  exerciseId: string;
  plannedSets: number;
  /** Completed sets only, in order. */
  sets: SetResult[];
  effort: Effort | null;
  back: BackFeel | null;
  note?: string;
};

export type SessionLog = {
  /** Client-generated; makes the upload safe to retry. */
  id: string;
  workout: WorkoutKey;
  /** Local calendar date the workout happened on, YYYY-MM-DD. */
  date: string;
  startedAt: string;
  elapsedSeconds: number;
  exercises: ExerciseLog[];
};

/** A finished session as seen by the schedule: what was done on which day. */
export type SessionMark = {
  date: string;
  kind: "strength" | "backcare";
  workout?: WorkoutKey;
  /** ISO timestamp, to order two sessions on the same day. */
  at?: string;
};

/** The most recent sets logged for an exercise, for "last time" hints. */
export type LastResult = {
  date: string;
  weight: number;
  values: number[];
};

/** Everything the Today screen and workout need, as served by /api/training. */
export type TrainingData = {
  programme: Programme;
  slots: Slot[];
  history: SessionMark[];
  last: Record<string, LastResult>;
};
