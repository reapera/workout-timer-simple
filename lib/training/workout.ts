import { ladderFor, snapDown, snapNearest } from "./equipment";
import { getExercise } from "./exercises";
import { decide, workingSets, type Decision } from "./progression";
import { setsForWeek, slotsFor } from "./template";
import type {
  BackFeel,
  Effort,
  Equipment,
  LastResult,
  SessionLog,
  SetResult,
  Slot,
  TrainingData,
  WorkoutKey,
} from "./types";

/**
 * A strength workout in progress, as a plain serialisable state machine.
 * The phone saves it after every action, so a reload, a locked screen or a
 * dead battery mid-workout loses nothing. Rest is a deadline, not a counter,
 * for the same reason.
 */

export type Phase = "warmup" | "set" | "rest" | "rate" | "done";

export type ActiveExercise = {
  slotId: string;
  /** The programme row as it stood before this workout, for working out what's next. */
  slot: Slot;
  exerciseId: string;
  plannedSets: number;
  repMin: number | null;
  /** Top of the range, including any extra reps earned before a big jump. */
  repMax: number | null;
  seconds: number | null;
  rest: number;
  /** kg per dumbbell for the next set (0 = bodyweight). */
  weight: number;
  /** First time with this lift: the sets work out a starting weight. */
  finding: boolean;
  last: LastResult | null;
  sets: SetResult[];
  effort: Effort | null;
  back: BackFeel | null;
  note: string;
  skipped: boolean;
};

export type WorkoutState = {
  version: 1;
  id: string;
  workout: WorkoutKey;
  date: string;
  week: number;
  startedAt: number;
  finishedAt: number | null;
  backCheck: boolean;
  equipment: Equipment;
  phase: Phase;
  index: number;
  /** When the current rest ends (epoch ms). */
  restUntil: number | null;
  exercises: ActiveExercise[];
  /** Set once the finished workout has been handed to the uploader. */
  submittedAt: number | null;
};

export type Action =
  | { type: "warmup-done" }
  | { type: "set-weight"; weight: number }
  | { type: "log-set"; value: number; now: number }
  | { type: "undo-set" }
  | { type: "rest-done" }
  | { type: "rest-extend"; seconds: number }
  | { type: "rate"; effort: Effort; back: BackFeel | null; note?: string; now: number }
  | { type: "skip-exercise"; now: number }
  | { type: "finish"; now: number }
  | { type: "submitted"; now: number };

export function createWorkout(options: {
  data: TrainingData;
  workout: WorkoutKey;
  date: string;
  week: number;
  id: string;
  now: number;
}): WorkoutState {
  const { data, workout } = options;
  const exercises = slotsFor(data.slots, workout).map((slot): ActiveExercise => {
    const exercise = getExercise(slot.exerciseId);
    const ladder = ladderFor(exercise, data.programme.equipment);
    const finding = slot.weight === null && exercise.load !== "none";
    let weight = 0;
    if (exercise.load !== "none") {
      weight = finding
        ? snapDown(ladder, exercise.startGuess ?? ladder[0] ?? 0)
        : snapNearest(ladder, slot.weight ?? 0);
    }

    return {
      slotId: slot.id,
      slot,
      exerciseId: slot.exerciseId,
      plannedSets: setsForWeek(slot.sets, options.week, data.programme.level),
      repMin: slot.repMin,
      repMax: slot.repMax === null ? null : slot.repMax + slot.stretch,
      seconds: slot.seconds,
      rest: slot.rest,
      weight,
      finding,
      last: data.last[slot.exerciseId] ?? null,
      sets: [],
      effort: null,
      back: null,
      note: "",
      skipped: false,
    };
  });

  return {
    version: 1,
    id: options.id,
    workout,
    date: options.date,
    week: options.week,
    startedAt: options.now,
    finishedAt: null,
    backCheck: data.programme.backPain,
    equipment: data.programme.equipment,
    phase: exercises.length ? "warmup" : "done",
    index: 0,
    restUntil: null,
    exercises,
    submittedAt: null,
  };
}

function update(state: WorkoutState, change: Partial<ActiveExercise>): WorkoutState {
  return {
    ...state,
    exercises: state.exercises.map((exercise, index) =>
      index === state.index ? { ...exercise, ...change } : exercise,
    ),
  };
}

function advance(state: WorkoutState, now: number): WorkoutState {
  const next = state.index + 1;
  if (next < state.exercises.length) {
    return { ...state, index: next, phase: "set", restUntil: null };
  }
  return { ...state, phase: "done", restUntil: null, finishedAt: now };
}

export function reduce(state: WorkoutState, action: Action): WorkoutState {
  const current = state.exercises[state.index];

  switch (action.type) {
    case "warmup-done":
      return state.phase === "warmup" ? { ...state, phase: "set" } : state;

    case "set-weight":
      return current ? update(state, { weight: Math.max(0, action.weight) }) : state;

    case "log-set": {
      if (!current || state.phase !== "set") return state;
      const sets = [...current.sets, { weight: current.weight, value: Math.max(0, Math.round(action.value)) }];
      const logged = update(state, { sets });
      if (sets.length < current.plannedSets) {
        return { ...logged, phase: "rest", restUntil: action.now + current.rest * 1000 };
      }
      return { ...logged, phase: "rate", restUntil: null };
    }

    case "undo-set":
      if (!current?.sets.length) return state;
      return { ...update(state, { sets: current.sets.slice(0, -1) }), phase: "set", restUntil: null };

    case "rest-done":
      return state.phase === "rest" ? { ...state, phase: "set", restUntil: null } : state;

    case "rest-extend":
      return state.phase === "rest" && state.restUntil
        ? { ...state, restUntil: state.restUntil + action.seconds * 1000 }
        : state;

    case "rate":
      if (!current || state.phase !== "rate") return state;
      return advance(
        update(state, { effort: action.effort, back: action.back, note: action.note?.trim() ?? "" }),
        action.now,
      );

    case "skip-exercise":
      if (!current || state.phase === "done") return state;
      // Sets already done still count; an untouched exercise is simply skipped.
      return advance(update(state, { skipped: current.sets.length === 0 }), action.now);

    case "finish":
      return { ...state, phase: "done", restUntil: null, finishedAt: state.finishedAt ?? action.now };

    case "submitted":
      return state.phase === "done" ? { ...state, submittedAt: state.submittedAt ?? action.now } : state;
  }
}

/* ------------------------------------------------------------------ *
 * Read-outs
 * ------------------------------------------------------------------ */

/** The number to pre-fill for a set: beat last time by one, within the range. */
export function aimFor(exercise: ActiveExercise, setIndex: number): number {
  const kind = getExercise(exercise.exerciseId).kind;
  if (kind === "timed") return exercise.seconds ?? 20;

  const low = exercise.repMin ?? 8;
  const top = exercise.repMax ?? low;
  const previous = exercise.sets[setIndex - 1];
  const last = exercise.last;
  if (last && last.weight === exercise.weight && last.values.length) {
    const before = last.values[Math.min(setIndex, last.values.length - 1)];
    return Math.min(top, Math.max(low, before + 1));
  }
  // Within a session the next set rarely beats the one before it.
  if (previous && previous.weight === exercise.weight) return Math.max(low, Math.min(previous.value, top));
  return low;
}

export function toSessionLog(state: WorkoutState): SessionLog {
  const finishedAt = state.finishedAt ?? Date.now();
  return {
    id: state.id,
    workout: state.workout,
    date: state.date,
    startedAt: new Date(state.startedAt).toISOString(),
    elapsedSeconds: Math.max(0, Math.round((finishedAt - state.startedAt) / 1000)),
    exercises: state.exercises.map((exercise) => ({
      slotId: exercise.slotId,
      exerciseId: exercise.exerciseId,
      plannedSets: exercise.plannedSets,
      sets: exercise.sets,
      effort: exercise.effort,
      back: exercise.back,
      note: exercise.note || undefined,
    })),
  };
}

export type ExerciseOutcome = {
  exercise: ActiveExercise;
  decision: Decision | null;
};

/** What the workout means for next time, computed exactly as the server will. */
export function outcomes(state: WorkoutState): ExerciseOutcome[] {
  const log = toSessionLog(state);
  return state.exercises.map((exercise, index) => {
    const definition = getExercise(exercise.exerciseId);
    if (!exercise.sets.length) return { exercise, decision: null };
    const decision = decide(exercise.slot, definition, log.exercises[index], ladderFor(definition, state.equipment));
    return { exercise, decision };
  });
}

export function totals(state: WorkoutState) {
  let sets = 0;
  let reps = 0;
  let volume = 0;
  for (const exercise of state.exercises) {
    const definition = getExercise(exercise.exerciseId);
    sets += exercise.sets.length;
    if (definition.kind !== "reps") continue;
    const factor = definition.load === "pair" ? 2 : 1;
    for (const set of exercise.sets) {
      reps += set.value;
      volume += set.weight * set.value * factor;
    }
  }
  const end = state.finishedAt ?? Date.now();
  return { sets, reps, volume: Math.round(volume), minutes: Math.max(1, Math.round((end - state.startedAt) / 60000)) };
}

/**
 * The plan as it will look once a session reaches Notion, so the phone shows
 * the new targets straight away — after finishing, and again on top of fresh
 * Notion data while the upload is still queued. A session Notion already has
 * (its id is on a programme row) is left alone, so this never applies twice.
 */
export function applySession(data: TrainingData, session: SessionLog): TrainingData {
  if (data.slots.some((slot) => slot.lastSession === session.id)) return data;
  const done = session.exercises.filter((log) => log.sets.length);
  if (!done.length) return data;

  const slots = data.slots.map((slot) => {
    const log = done.find((candidate) => candidate.slotId === slot.id);
    if (!log) return slot;
    const exercise = getExercise(log.exerciseId);
    const decision = decide(slot, exercise, log, ladderFor(exercise, data.programme.equipment));
    return { ...slot, ...decision.next, lastSession: session.id, lastDone: session.date };
  });

  const last = { ...data.last };
  for (const log of done) {
    last[log.exerciseId] = {
      date: session.date,
      weight: workingSets(log.sets).weight,
      values: log.sets.map((set) => set.value),
    };
  }

  const history = [
    ...data.history,
    { date: session.date, kind: "strength" as const, workout: session.workout, at: session.startedAt },
  ];
  return { ...data, slots, last, history };
}

export function applyWorkout(data: TrainingData, state: WorkoutState): TrainingData {
  return applySession(data, toSessionLog(state));
}
