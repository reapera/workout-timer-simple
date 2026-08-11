"use client";

import { useCallback, useEffect, useState } from "react";

import { logSession, type LogResult } from "@/lib/client";
import { useTimer, type CompletedExercise } from "@/lib/useTimer";
import { useWakeLock } from "@/lib/useWakeLock";
import { formatClock, formatDuration, type Routine } from "@/lib/types";

const PHASE = {
  prep: { label: "Get ready", color: "var(--color-prep)" },
  work: { label: "Work", color: "var(--color-work)" },
  rest: { label: "Rest", color: "var(--color-rest)" },
} as const;

type Props = { routine: Routine; onExit: () => void };

export function RunScreen({ routine, onExit }: Props) {
  const [summary, setSummary] = useState<{
    completed: CompletedExercise[];
    elapsedSeconds: number;
  } | null>(null);
  const [logState, setLogState] = useState<"idle" | "saving" | LogResult>("idle");

  const handleFinish = useCallback(
    async (result: { completed: CompletedExercise[]; elapsedSeconds: number }) => {
      setSummary(result);

      if (!result.completed.length) {
        setLogState("idle");
        return;
      }

      setLogState("saving");
      setLogState(
        await logSession({
          routineId: routine.id,
          routineName: routine.name,
          completed: result.completed,
          plannedCount: routine.exercises.length,
          elapsedSeconds: result.elapsedSeconds,
        }),
      );
    },
    [routine],
  );

  const timer = useTimer({ exercises: routine.exercises, onFinish: handleFinish });
  const { status, segment, start, toggle, skip, back, stop } = timer;

  useWakeLock(status === "running" || status === "paused");

  // Start as soon as the screen mounts — the click that opened it is the
  // gesture that unlocks speech, so it must not be spent on a second tap.
  useEffect(() => {
    start();
  }, [start]);

  // Space bar / Escape for anyone running this on a laptop.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "Escape") {
        stop();
      } else if (event.code === "ArrowRight") {
        skip();
      } else if (event.code === "ArrowLeft") {
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, stop, skip, back]);

  if (status === "finished" && summary) {
    return (
      <FinishScreen
        routine={routine}
        summary={summary}
        logState={logState}
        onExit={onExit}
        onRepeat={() => {
          setSummary(null);
          setLogState("idle");
          timer.start();
        }}
      />
    );
  }

  const phase = segment ? PHASE[segment.kind] : PHASE.prep;
  const paused = status === "paused";
  const upcoming = routine.exercises[(segment?.exerciseIndex ?? 0) + 1];

  return (
    <div className="fixed inset-0 flex flex-col bg-[var(--color-ink)]">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/50">{routine.name}</p>
          <p className="text-xs text-white/35">
            Exercise {Math.min(routine.exercises.length, (segment?.exerciseIndex ?? 0) + 1)} of{" "}
            {routine.exercises.length}
          </p>
        </div>
        <button
          onClick={stop}
          className="shrink-0 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 active:scale-95"
        >
          End
        </button>
      </header>

      {/* The whole middle is one big pause target — no aiming required mid-set. */}
      <button
        onClick={toggle}
        aria-label={paused ? "Resume workout" : "Pause workout"}
        className="flex flex-1 flex-col items-center justify-center px-6 outline-none"
      >
        <Ring progress={timer.segmentProgress} color={phase.color}>
          <span
            className="tnum text-[5.5rem] leading-none font-semibold sm:text-[7rem]"
            style={{ color: phase.color }}
          >
            {timer.remainingSeconds}
          </span>
          <span className="mt-1 text-sm font-medium tracking-[0.2em] text-white/40 uppercase">
            {paused ? "Paused" : phase.label}
          </span>
        </Ring>

        <p className="mt-8 max-w-full truncate px-2 text-center text-3xl font-semibold text-white sm:text-4xl">
          {segment?.exerciseName ?? routine.name}
        </p>

        <p className="mt-2 h-5 text-sm text-white/40">
          {segment?.kind === "rest" && upcoming
            ? `Next: ${upcoming.name}`
            : segment?.kind === "prep"
              ? `${routine.exercises[segment.exerciseIndex]?.duration ?? 0}s of work`
              : ""}
        </p>
      </button>

      <footer className="flex items-center justify-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SecondaryButton onClick={back} label="Back" />
        <button
          onClick={toggle}
          className="min-w-[9.5rem] rounded-2xl px-8 py-5 text-lg font-semibold text-[var(--color-ink)] transition active:scale-95"
          style={{ background: phase.color }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <SecondaryButton onClick={skip} label="Skip" />
      </footer>
    </div>
  );
}

function SecondaryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5 text-sm font-medium text-white/70 transition hover:bg-[var(--color-surface-2)] active:scale-95"
    >
      {label}
    </button>
  );
}

function Ring({
  progress,
  color,
  children,
}: {
  progress: number;
  color: string;
  children: React.ReactNode;
}) {
  const radius = 130;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 300 300" aria-hidden="true">
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth="12"
        />
        <circle
          cx="150"
          cy="150"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
        />
      </svg>
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}

function FinishScreen({
  routine,
  summary,
  logState,
  onExit,
  onRepeat,
}: {
  routine: Routine;
  summary: { completed: CompletedExercise[]; elapsedSeconds: number };
  logState: "idle" | "saving" | LogResult;
  onExit: () => void;
  onRepeat: () => void;
}) {
  const workSeconds = summary.completed.reduce((sum, item) => sum + item.duration, 0);
  const partial = summary.completed.length < routine.exercises.length;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[var(--color-ink)] px-6 py-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <p className="text-sm font-medium tracking-[0.2em] text-[var(--color-work)] uppercase">
          {partial ? "Ended early" : "Complete"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{routine.name}</h1>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Exercises" value={`${summary.completed.length}/${routine.exercises.length}`} />
          <Stat label="Work" value={formatDuration(workSeconds)} />
          <Stat label="Total" value={formatClock(summary.elapsedSeconds)} />
        </div>

        <ul className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
          {summary.completed.map((item, index) => (
            <li key={index} className="flex items-center justify-between px-4 py-3">
              <span className="truncate pr-3 text-white/85">{item.name}</span>
              <span className="tnum shrink-0 text-sm text-white/45">{item.duration}s</span>
            </li>
          ))}
          {!summary.completed.length && (
            <li className="px-4 py-3 text-sm text-white/45">
              No exercise finished — nothing was logged.
            </li>
          )}
        </ul>

        <p className="mt-4 text-sm text-white/45">
          {logState === "saving" && "Saving to Notion…"}
          {logState === "written" && "Saved to your Notion Workout Log."}
          {logState === "queued" &&
            "Couldn't reach Notion. Saved on this device — it will upload next time you open the app."}
        </p>

        <div className="mt-auto flex flex-col gap-3 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={onRepeat}
            className="rounded-2xl bg-[var(--color-work)] px-6 py-4 text-lg font-semibold text-[var(--color-ink)] transition active:scale-95"
          >
            Go again
          </button>
          <button
            onClick={onExit}
            className="rounded-2xl border border-[var(--color-line)] px-6 py-4 font-medium text-white/70 transition hover:bg-white/5 active:scale-95"
          >
            Done
          </button>
        </div>
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
