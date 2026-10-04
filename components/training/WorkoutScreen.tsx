"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { RunScreen } from "@/components/RunScreen";
import { announcer } from "@/lib/audio";
import {
  clearActiveWorkout,
  finishWorkout,
  loadActiveWorkout,
  pendingWorkoutCount,
  saveActiveWorkout,
  type UploadResult,
} from "@/lib/training/client";
import { ladderFor, loadingFor, trimNumber } from "@/lib/training/equipment";
import { getExercise, type ExerciseDef } from "@/lib/training/exercises";
import { formatKg, formatPlates, formatValues, perSideWord, shortDate } from "@/lib/training/format";
import type { Outcome } from "@/lib/training/progression";
import { WARM_UP, WARM_UP_ROUTINE } from "@/lib/training/routines";
import type { BackFeel, Effort, LastResult } from "@/lib/training/types";
import {
  aimFor,
  outcomes,
  reduce,
  totals,
  type Action,
  type ActiveExercise,
  type WorkoutState,
} from "@/lib/training/workout";
import { useWakeLock } from "@/lib/useWakeLock";

import { ExerciseImages } from "./ExerciseImages";
import { GuideSheet } from "./GuideSheet";

const spokenKg = (kg: number) => (kg > 0 ? `${trimNumber(kg)} kilos` : "bodyweight");

export function WorkoutScreen() {
  const router = useRouter();
  const [state, setState] = useState<WorkoutState | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    const saved = loadActiveWorkout();
    if (!saved) router.replace("/");
    else setState(saved);
  }, [router]);

  // Saved after every change: a reload or a dead battery loses nothing.
  useEffect(() => {
    if (state) saveActiveWorkout(state);
  }, [state]);

  const dispatch = useCallback((action: Action) => {
    setState((current) => (current ? reduce(current, action) : current));
  }, []);

  useWakeLock(Boolean(state) && state?.phase !== "done");

  // Announce each new exercise as it comes up (but not when resuming mid-way).
  const announcedIndex = useRef<number | null>(null);
  useEffect(() => {
    if (!state || state.phase !== "set") return;
    if (announcedIndex.current === null) {
      announcedIndex.current = state.index;
      return;
    }
    if (announcedIndex.current === state.index) return;
    announcedIndex.current = state.index;
    const exercise = state.exercises[state.index];
    if (exercise && !exercise.sets.length) {
      const definition = getExercise(exercise.exerciseId);
      const load = definition.load === "none" ? "" : ` ${spokenKg(exercise.weight)}.`;
      announcer.say(`Next: ${definition.name}.${load}`);
    }
  }, [state]);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
      </div>
    );
  }

  if (warming) {
    return (
      <RunScreen
        routine={WARM_UP_ROUTINE}
        onExit={() => setWarming(false)}
        onComplete={() => {
          setWarming(false);
          announcedIndex.current = 0;
          dispatch({ type: "warmup-done" });
          const first = state.exercises[0];
          if (first) announcer.say(`Warm-up done. First up: ${getExercise(first.exerciseId).name}.`);
        }}
      />
    );
  }

  if (state.phase === "done") {
    return (
      <FinishView
        state={state}
        onSubmitted={() => dispatch({ type: "submitted", now: Date.now() })}
        onDone={() => {
          clearActiveWorkout();
          router.replace("/");
        }}
      />
    );
  }

  const exercise = state.exercises[state.index];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <WorkoutHeader state={state} onEnd={() => dispatch({ type: "finish", now: Date.now() })} />

      {state.phase === "warmup" ? (
        <WarmupView
          onStart={() => {
            announcer.unlock();
            setWarming(true);
          }}
          onSkip={() => {
            announcer.unlock();
            announcedIndex.current = 0;
            dispatch({ type: "warmup-done" });
          }}
          onGuide={setGuide}
        />
      ) : state.phase === "rest" && state.restUntil ? (
        <RestView state={state} dispatch={dispatch} />
      ) : state.phase === "rate" ? (
        <RateView
          key={state.index}
          exercise={exercise}
          backCheck={state.backCheck}
          isLast={state.index === state.exercises.length - 1}
          onRate={(effort, back, note) => dispatch({ type: "rate", effort, back, note, now: Date.now() })}
          onUndo={() => dispatch({ type: "undo-set" })}
        />
      ) : (
        <SetView
          key={`${state.index}-${exercise.sets.length}`}
          state={state}
          exercise={exercise}
          dispatch={dispatch}
          onGuide={setGuide}
        />
      )}

      <GuideSheet exerciseId={guide} onClose={() => setGuide(null)} />
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function WorkoutHeader({ state, onEnd }: { state: WorkoutState; onEnd: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const done = state.exercises.filter((exercise, index) => index < state.index || exercise.sets.length).length;

  return (
    <header className="pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/60">
            Workout {state.workout}
            {state.deload && <span className="text-[var(--color-rest)]"> · Lighter week</span>}
          </p>
          <p className="text-xs text-white/35">
            {state.phase === "warmup"
              ? "Warm-up"
              : `Exercise ${state.index + 1} of ${state.exercises.length}`}
          </p>
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-full border border-[var(--color-line)] px-3 py-2 text-sm text-white/70"
            >
              Keep going
            </button>
            <button
              onClick={onEnd}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300"
            >
              End now
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
          >
            End
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {state.exercises.map((exercise, index) => (
          <span
            key={exercise.slotId}
            className={`h-1 flex-1 rounded-full ${
              index < done || (index === state.index && state.phase === "rate")
                ? "bg-[var(--color-work)]"
                : index === state.index && state.phase !== "warmup"
                  ? "bg-[var(--color-work)]/40"
                  : "bg-[var(--color-surface-2)]"
            }`}
          />
        ))}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Warm-up
 * ------------------------------------------------------------------ */

function WarmupView({
  onStart,
  onSkip,
  onGuide,
}: {
  onStart: () => void;
  onSkip: () => void;
  onGuide: (exerciseId: string) => void;
}) {
  const seconds = WARM_UP.moves.reduce((sum, move) => sum + move.seconds, 0) + WARM_UP.moves.length * 10;

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mt-4 text-3xl font-semibold text-white">Warm up first</h1>
      <p className="mt-2 text-sm text-white/55">
        {WARM_UP.summary} About {Math.round(seconds / 60)} minutes, called out by voice.
      </p>
      <ul className="mt-5 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {WARM_UP.moves.map((move) => (
          <li key={move.name}>
            <button
              onClick={() => onGuide(move.exerciseId)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-white/85">{move.name}</span>
              <span className="tnum text-sm text-white/40">{move.seconds}s</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <button
          onClick={onStart}
          className="rounded-2xl bg-[var(--color-prep)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95"
        >
          Start warm-up
        </button>
        <button
          onClick={onSkip}
          className="rounded-2xl border border-[var(--color-line)] py-3 text-sm text-white/60 transition hover:bg-white/5"
        >
          Skip — I&apos;m already warm
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A set
 * ------------------------------------------------------------------ */

function SetView({
  state,
  exercise,
  dispatch,
  onGuide,
}: {
  state: WorkoutState;
  exercise: ActiveExercise;
  dispatch: (action: Action) => void;
  onGuide: (exerciseId: string) => void;
}) {
  const definition = getExercise(exercise.exerciseId);
  const setNumber = exercise.sets.length + 1;
  const timed = definition.kind === "timed";
  const [value, setValue] = useState(() => aimFor(exercise, exercise.sets.length));
  const [showBackTip, setShowBackTip] = useState(false);
  const sideWord = perSideWord(definition);

  const target = timed
    ? `${definition.load === "none" ? "Hold" : "Carry"} ${exercise.seconds ?? 0} s${definition.perSide ? " each side" : ""}`
    : exercise.finding
      ? `As many good reps as you can (${exercise.repMin}–${exercise.repMax} is the goal)`
      : `Aim for ${aimFor(exercise, exercise.sets.length)} reps · range ${exercise.repMin}–${exercise.repMax}`;

  return (
    <div className="flex flex-1 flex-col">
      <ExerciseImages images={definition.images} name={definition.name} />

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold text-white">{definition.name}</h1>
          <p className="mt-1 text-sm text-white/50">
            Set {setNumber} of {exercise.plannedSets} · {target}
          </p>
        </div>
        <button
          onClick={() => onGuide(definition.id)}
          className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/5"
        >
          How to
        </button>
      </div>

      {exercise.last && exercise.sets.length === 0 && <LastTime last={exercise.last} definition={definition} />}

      {state.backCheck && definition.back && (
        <button
          onClick={() => setShowBackTip((open) => !open)}
          className="mt-3 rounded-xl border border-[var(--color-rest)]/25 bg-[var(--color-rest)]/5 px-3 py-2 text-left text-xs text-[var(--color-rest)]"
        >
          {showBackTip ? definition.back : "Back tip — tap to read"}
        </button>
      )}

      {definition.load !== "none" && (
        <WeightPicker state={state} exercise={exercise} onChange={(weight) => dispatch({ type: "set-weight", weight })} />
      )}

      {timed ? (
        <HoldTimer
          name={definition.name}
          seconds={exercise.seconds ?? 20}
          perSide={Boolean(definition.perSide)}
          carry={definition.load !== "none"}
          onDone={(held) => dispatch({ type: "log-set", value: held, now: Date.now() })}
        />
      ) : (
        <div className="mt-5">
          <p className="text-center text-xs tracking-[0.15em] text-white/40 uppercase">
            Reps done{definition.perSide ? ` ${sideWord} (count your weaker side)` : ""}
          </p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <StepButton label="One rep fewer" onClick={() => setValue((current) => Math.max(0, current - 1))}>
              −
            </StepButton>
            <span className="tnum w-24 text-center text-6xl font-semibold text-white">{value}</span>
            <StepButton label="One rep more" onClick={() => setValue((current) => Math.min(99, current + 1))}>
              +
            </StepButton>
          </div>
        </div>
      )}

      <div className="mt-auto pt-6">
        {exercise.sets.length > 0 && (
          <p className="mb-3 text-center text-sm text-white/45">
            Done: {formatValues(definition.kind, exercise.sets.map((set) => set.value))}
          </p>
        )}
        {!timed && (
          <button
            onClick={() => {
              announcer.unlock();
              announcer.beep("done");
              dispatch({ type: "log-set", value, now: Date.now() });
            }}
            className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95"
          >
            Log set {setNumber}
          </button>
        )}
        <div className="mt-3 flex justify-center gap-6 text-sm">
          {exercise.sets.length > 0 && (
            <button onClick={() => dispatch({ type: "undo-set" })} className="text-white/45 hover:text-white">
              Undo last set
            </button>
          )}
          <button
            onClick={() => dispatch({ type: "skip-exercise", now: Date.now() })}
            className="text-white/45 hover:text-white"
          >
            {exercise.sets.length ? "Finish exercise here" : "Skip exercise"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LastTime({ last, definition }: { last: LastResult; definition: ExerciseDef }) {
  const weight = definition.load !== "none" && last.weight > 0 ? `${formatKg(last.weight)} × ` : "";
  return (
    <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white/50">
      <p>
        Last time, {shortDate(last.date)}:{" "}
        <span className="font-medium text-white/80">
          {weight}
          {formatValues(definition.kind, last.values)}
        </span>
      </p>
      {last.note && <p className="mt-1 text-white/70">Your note: &ldquo;{last.note}&rdquo;</p>}
    </div>
  );
}

function WeightPicker({
  state,
  exercise,
  onChange,
}: {
  state: WorkoutState;
  exercise: ActiveExercise;
  onChange: (weight: number) => void;
}) {
  const definition = getExercise(exercise.exerciseId);
  const ladder = ladderFor(definition, state.equipment);
  const index = ladder.findIndex((weight) => weight === exercise.weight);
  const lower = index > 0 ? ladder[index - 1] : index === -1 ? ladder.filter((w) => w < exercise.weight).pop() : undefined;
  const higher = index >= 0 ? ladder[index + 1] : ladder.find((w) => w > exercise.weight);
  const loading = loadingFor(state.equipment, definition.load, exercise.weight);
  const pair = definition.load === "pair" && state.equipment.handles > 1;

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      {exercise.finding && (
        <p className="mb-3 rounded-lg bg-[var(--color-prep)]/10 px-3 py-2 text-xs text-[var(--color-prep)]">
          {definition.kind === "timed"
            ? "First time: pick a weight you can carry for about 30 seconds while standing tall. The app sets your working weight from what you use."
            : "First time: pick a weight you could lift about 15 times with good form. Stop 2 reps before it gets really hard — the app sets your working weight from what you log."}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <StepButton label="Lighter" disabled={lower === undefined} onClick={() => lower !== undefined && onChange(lower)}>
          −
        </StepButton>
        <div className="min-w-0 text-center">
          <p className="tnum text-3xl font-semibold text-white">
            {exercise.weight > 0 ? `${trimNumber(exercise.weight)} kg` : "No weight"}
            {pair && exercise.weight > 0 && <span className="text-base font-normal text-white/45"> each</span>}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {exercise.weight === 0
              ? "Bodyweight only"
              : loading
                ? `${pair ? "Both dumbbells — " : ""}each end: ${formatPlates(loading.perSide)}`
                : "Not possible with your plates"}
          </p>
        </div>
        <StepButton label="Heavier" disabled={higher === undefined} onClick={() => higher !== undefined && onChange(higher)}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-3xl text-white/80 transition active:scale-90 disabled:opacity-25"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Timed holds
 * ------------------------------------------------------------------ */

type Hold =
  | { kind: "ready" }
  | { kind: "prep"; side: 0 | 1; until: number }
  | { kind: "hold"; side: 0 | 1; until: number; started: number };

const PREP_MS = 5000;

function HoldTimer({
  name,
  seconds,
  perSide,
  carry,
  onDone,
}: {
  name: string;
  seconds: number;
  perSide: boolean;
  /** A carry with a dumbbell, rather than a hold in place. */
  carry: boolean;
  onDone: (held: number) => void;
}) {
  const [hold, setHold] = useState<Hold>({ kind: "ready" });
  const [now, setNow] = useState(() => Date.now());
  const held = useRef<number[]>([]);
  const beeped = useRef(-1);
  // A tick can land between logging and this timer unmounting; log once only.
  const finished = useRef(false);

  const sideName = (side: 0 | 1) => (perSide ? (side === 0 ? ", left side" : ", right side") : "");

  const finish = useCallback(
    (values: number[]) => {
      if (finished.current) return;
      finished.current = true;
      announcer.say("Done.");
      announcer.beep("done");
      onDone(Math.min(...values));
    },
    [onDone],
  );

  useEffect(() => {
    if (hold.kind === "ready") return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [hold.kind]);

  useEffect(() => {
    if (hold.kind === "ready") return;
    const left = Math.ceil((hold.until - now) / 1000);
    if (left <= 3 && left >= 1 && left !== beeped.current) {
      beeped.current = left;
      announcer.beep("tick");
    }
    if (now < hold.until) return;
    beeped.current = -1;

    if (hold.kind === "prep") {
      announcer.say("Go.", { interrupt: false });
      announcer.beep("go");
      const started = Date.now();
      setHold({ kind: "hold", side: hold.side, until: started + seconds * 1000, started });
      return;
    }
    held.current = [...held.current, seconds];
    if (perSide && hold.side === 0) {
      announcer.say(`Switch. ${name}${sideName(1)}.`);
      setHold({ kind: "prep", side: 1, until: Date.now() + PREP_MS });
      return;
    }
    finish(held.current);
  }, [now, hold, seconds, perSide, name, finish]);

  if (hold.kind === "ready") {
    return (
      <div className="mt-6 text-center">
        <p className="text-sm text-white/50">
          5 seconds to get into position, then {carry ? "carry" : "hold"} for {seconds} s{perSide ? " on each side" : ""}.
        </p>
        <button
          onClick={() => {
            announcer.unlock();
            held.current = [];
            announcer.say(`Get ready. ${name}${sideName(0)}.`);
            setNow(Date.now());
            setHold({ kind: "prep", side: 0, until: Date.now() + PREP_MS });
          }}
          className="mt-5 w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95"
        >
          {carry ? "Start carry" : "Start hold"}
        </button>
      </div>
    );
  }

  const total = hold.kind === "prep" ? PREP_MS : seconds * 1000;
  const left = Math.max(0, hold.until - now);
  const color = hold.kind === "prep" ? "var(--color-prep)" : "var(--color-work)";

  return (
    <div className="mt-5 flex flex-col items-center">
      <Ring progress={1 - left / total} color={color}>
        <span className="tnum text-6xl font-semibold" style={{ color }}>
          {Math.ceil(left / 1000)}
        </span>
        <span className="mt-1 text-xs tracking-[0.2em] text-white/45 uppercase">
          {hold.kind === "prep" ? "Get ready" : carry ? "Carry" : "Hold"}
          {perSide ? (hold.side === 0 ? " · left" : " · right") : ""}
        </span>
      </Ring>
      <button
        onClick={() => {
          if (hold.kind === "prep") {
            announcer.silence();
            if (held.current.length) finish(held.current);
            else setHold({ kind: "ready" });
            return;
          }
          const elapsed = Math.floor((Date.now() - hold.started) / 1000);
          finish([...held.current, elapsed]);
        }}
        className="mt-5 rounded-2xl border border-[var(--color-line)] px-6 py-3 text-sm text-white/70 transition hover:bg-white/5"
      >
        {hold.kind === "prep" ? "Cancel" : carry ? "Stop — log how long I carried" : "Stop — log what I held"}
      </button>
    </div>
  );
}

function Ring({ progress, color, children }: { progress: number; color: string; children: React.ReactNode }) {
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r={radius} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * Math.min(1, Math.max(0, progress))}
        />
      </svg>
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Rest between sets
 * ------------------------------------------------------------------ */

function RestView({ state, dispatch }: { state: WorkoutState; dispatch: (action: Action) => void }) {
  const exercise = state.exercises[state.index];
  const definition = getExercise(exercise.exerciseId);
  const until = state.restUntil ?? Date.now();
  const [now, setNow] = useState(() => Date.now());
  const cues = useRef(new Set<string>());
  const restKey = `${state.index}-${exercise.sets.length}`;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const left = Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    const once = (cue: string, run: () => void) => {
      const key = `${restKey}:${cue}`;
      if (cues.current.has(key)) return;
      cues.current.add(key);
      run();
    };

    // Only announce the start if this is a fresh rest, not a reload mid-way.
    if (left >= exercise.rest - 2) once("start", () => announcer.say(`Rest. ${left} seconds.`));
    if (left === 10) once("ten", () => announcer.say("10 seconds."));
    if (left <= 3 && left >= 1) once(`beep${left}`, () => announcer.beep("tick"));
    if (left === 0) {
      once("go", () => {
        const load = definition.load === "none" ? "" : ` ${spokenKg(exercise.weight)}.`;
        announcer.say(`Set ${exercise.sets.length + 1}. ${definition.name}.${load} Go.`);
        announcer.beep("go");
        dispatch({ type: "rest-done" });
      });
    }
  }, [left, restKey, exercise, definition, dispatch]);

  const total = exercise.rest;
  const last = exercise.sets[exercise.sets.length - 1];

  return (
    <div className="flex flex-1 flex-col items-center">
      <p className="mt-6 text-sm text-white/50">
        Set {exercise.sets.length} done
        {last ? ` — ${formatValues(definition.kind, [last.value])}${definition.kind === "reps" ? " reps" : ""}` : ""}
      </p>
      <div className="mt-6">
        <Ring progress={1 - left / Math.max(1, total)} color="var(--color-rest)">
          <span className="tnum text-7xl font-semibold text-[var(--color-rest)]">{left}</span>
          <span className="mt-1 text-xs tracking-[0.2em] text-white/45 uppercase">Rest</span>
        </Ring>
      </div>
      <p className="mt-6 text-center text-lg font-semibold text-white">
        Next: set {exercise.sets.length + 1} of {exercise.plannedSets}
      </p>
      <p className="text-center text-sm text-white/45">
        {definition.name}
        {definition.load !== "none" ? ` · ${formatKg(exercise.weight)}` : ""}
      </p>
      <div className="mt-auto flex w-full gap-3 pt-8">
        <button
          onClick={() => dispatch({ type: "rest-extend", seconds: 30 })}
          className="flex-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-4 text-sm font-medium text-white/75 transition active:scale-95"
        >
          +30 s
        </button>
        <button
          onClick={() => {
            announcer.silence();
            dispatch({ type: "rest-done" });
          }}
          className="flex-1 rounded-2xl bg-[var(--color-rest)] py-4 text-sm font-bold text-[var(--color-ink)] transition active:scale-95"
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * How did it feel?
 * ------------------------------------------------------------------ */

const EFFORTS: Array<{ value: Effort; label: string; hint: string }> = [
  { value: "easy", label: "Easy", hint: "4+ reps left" },
  { value: "good", label: "Good", hint: "2–3 left" },
  { value: "hard", label: "Hard", hint: "1 left at most" },
  { value: "too_hard", label: "Too hard", hint: "form broke down" },
];

const BACK: Array<{ value: BackFeel; label: string }> = [
  { value: "none", label: "No pain" },
  { value: "mild", label: "Mild discomfort" },
  { value: "pain", label: "Pain" },
];

function RateView({
  exercise,
  backCheck,
  isLast,
  onRate,
  onUndo,
}: {
  exercise: ActiveExercise;
  backCheck: boolean;
  isLast: boolean;
  onRate: (effort: Effort, back: BackFeel | null, note: string) => void;
  onUndo: () => void;
}) {
  const definition = getExercise(exercise.exerciseId);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [back, setBack] = useState<BackFeel | null>(null);
  const [note, setNote] = useState("");
  const ready = effort !== null && (!backCheck || back !== null);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mt-4 text-2xl font-semibold text-white">How did that feel?</h1>
      <p className="mt-1 text-sm text-white/50">
        {definition.name}: {formatValues(definition.kind, exercise.sets.map((set) => set.value))}
        {definition.load !== "none" ? ` at ${formatKg(exercise.weight)}` : ""}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {EFFORTS.map((option) => (
          <Choice key={option.value} selected={effort === option.value} onClick={() => setEffort(option.value)}>
            <span className="block font-semibold">{option.label}</span>
            <span className="block text-xs opacity-60">{option.hint}</span>
          </Choice>
        ))}
      </div>

      {backCheck && (
        <>
          <h2 className="mt-6 text-lg font-semibold text-white">Your lower back?</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {BACK.map((option) => (
              <Choice
                key={option.value}
                selected={back === option.value}
                tone={option.value === "pain" ? "danger" : option.value === "mild" ? "warn" : "ok"}
                onClick={() => setBack(option.value)}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
              </Choice>
            ))}
          </div>
          {back === "pain" && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Next time will be lighter. If the pain is sharp, spreads down your leg or doesn&apos;t settle,
              skip the rest of today and check with a doctor or physio.
            </p>
          )}
        </>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note for next time (optional)"
        maxLength={300}
        className="mt-6 w-full rounded-xl border border-[var(--color-line)] bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--color-work)]"
      />

      <div className="mt-auto pt-6">
        <button
          disabled={!ready}
          onClick={() => effort && onRate(effort, backCheck ? back : null, note)}
          className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95 disabled:bg-[var(--color-surface-2)] disabled:text-white/30"
        >
          {isLast ? "Finish workout" : "Next exercise →"}
        </button>
        <button onClick={onUndo} className="mt-3 w-full text-center text-sm text-white/45 hover:text-white">
          Undo last set
        </button>
      </div>
    </div>
  );
}

function Choice({
  children,
  selected,
  tone = "ok",
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  tone?: "ok" | "warn" | "danger";
  onClick: () => void;
}) {
  const color = tone === "danger" ? "rgb(248 113 113)" : tone === "warn" ? "var(--color-prep)" : "var(--color-work)";
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-2xl border px-3 py-3 text-left text-white/80 transition active:scale-95"
      style={
        selected
          ? { borderColor: color, background: `color-mix(in srgb, ${color} 15%, transparent)`, color }
          : { borderColor: "var(--color-line)", background: "var(--color-surface)" }
      }
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

const OUTCOME_COLOR: Record<Outcome, string> = {
  up: "var(--color-work)",
  set: "var(--color-prep)",
  stretch: "var(--color-rest)",
  hold: "rgb(255 255 255 / 0.55)",
  down: "rgb(248 113 113)",
  skipped: "rgb(255 255 255 / 0.35)",
};

function FinishView({
  state,
  onSubmitted,
  onDone,
}: {
  state: WorkoutState;
  onSubmitted: () => void;
  onDone: () => void;
}) {
  const [upload, setUpload] = useState<"saving" | UploadResult>(state.submittedAt ? "written" : "saving");
  const started = useRef(false);

  useEffect(() => {
    if (state.submittedAt) {
      setUpload(pendingWorkoutCount() ? "queued" : "written");
      return;
    }
    if (started.current) return;
    started.current = true;
    announcer.say("Workout complete. Great job.");
    void finishWorkout(state).then((result) => {
      setUpload(result);
      onSubmitted();
    });
  }, [state, onSubmitted]);

  const results = outcomes(state);
  const sums = totals(state);
  const completed = state.exercises.filter((exercise) => exercise.sets.length).length;
  const backPain = state.exercises.some((exercise) => exercise.back === "pain");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <p className="text-sm font-medium tracking-[0.2em] text-[var(--color-work)] uppercase">
        {completed === state.exercises.length ? "Complete" : "Ended early"}
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Workout {state.workout}</h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Minutes" value={String(sums.minutes)} />
        <Stat label="Sets" value={String(sums.sets)} />
        <Stat label="Lifted" value={`${sums.volume} kg`} />
      </div>

      <h2 className="mt-6 text-xs tracking-[0.15em] text-white/40 uppercase">Next time</h2>
      <ul className="mt-2 divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {results.map(({ exercise, decision }) => {
          const definition = getExercise(exercise.exerciseId);
          return (
            <li key={exercise.slotId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium text-white/90">{definition.name}</span>
                <span className="tnum shrink-0 text-xs text-white/40">
                  {exercise.sets.length
                    ? formatValues(definition.kind, exercise.sets.map((set) => set.value))
                    : "skipped"}
                </span>
              </div>
              <p className="mt-0.5 text-sm" style={{ color: OUTCOME_COLOR[decision?.outcome ?? "skipped"] }}>
                {decision?.message ?? "Same plan next time"}
              </p>
            </li>
          );
        })}
      </ul>

      {backPain && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          You noted back pain today, so those exercises get lighter next time. Rest it, keep moving
          gently, and see a doctor or physio if it doesn&apos;t settle.
        </p>
      )}

      <p className="mt-4 text-sm text-white/45">
        {upload === "saving" && "Saving to Notion…"}
        {upload === "written" && "Saved to Notion."}
        {upload === "queued" && "Couldn't reach Notion. Saved on this phone — it uploads next time you open the app."}
      </p>

      <div className="mt-auto pt-8">
        <button
          onClick={onDone}
          disabled={upload === "saving"}
          className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-4 text-center">
      <p className="tnum text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs tracking-wide text-white/40 uppercase">{label}</p>
    </div>
  );
}
