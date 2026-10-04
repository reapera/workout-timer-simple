"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { RunScreen } from "@/components/RunScreen";
import { announcer } from "@/lib/audio";
import { flushPendingLogs, type ApiFailure } from "@/lib/client";
import {
  clearActiveWorkout,
  fetchTraining,
  finishWorkout,
  flushPendingWorkouts,
  loadActiveWorkout,
  pendingWorkoutCount,
  saveActiveWorkout,
  type TrainingLoad,
} from "@/lib/training/client";
import { ladderFor, loadingFor, snapDown, trimNumber } from "@/lib/training/equipment";
import { getExercise, type ExerciseDef } from "@/lib/training/exercises";
import { formatPlates, formatTarget } from "@/lib/training/format";
import { BACK_CARE, BACK_CARE_ROUTINE } from "@/lib/training/routines";
import { buildToday, localDate } from "@/lib/training/schedule";
import { estimateMinutes, setsForWeek, slotsFor, WORKOUT_NAMES } from "@/lib/training/template";
import type { Equipment, Slot, TrainingData, WorkoutKey } from "@/lib/training/types";
import { createWorkout, type WorkoutState } from "@/lib/training/workout";

import { ExerciseThumb } from "./ExerciseImages";
import { GuideSheet } from "./GuideSheet";
import { WeekStrip } from "./WeekStrip";

const BACK_CARE_MINUTES = Math.round(
  (BACK_CARE.moves.reduce((sum, move) => sum + move.seconds, 0) + BACK_CARE.moves.length * 10) / 60,
);

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function TodayScreen() {
  const router = useRouter();
  const [load, setLoad] = useState<TrainingLoad | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [active, setActive] = useState<WorkoutState | null>(null);
  const [pending, setPending] = useState(0);
  const [runningBackCare, setRunningBackCare] = useState(false);
  const [guide, setGuide] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Anything finished offline goes up before we read.
    await Promise.all([flushPendingLogs(), flushPendingWorkouts()]);
    setLoad(await fetchTraining());
    setPending(pendingWorkoutCount());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadActiveWorkout();
      if (saved?.phase === "done") {
        // Finished but never handed over (closed on the summary screen): do it now.
        if (!saved.submittedAt) await finishWorkout(saved);
        clearActiveWorkout();
      } else if (!cancelled) {
        setActive(saved);
      }
      if (cancelled) return;
      setToday(localDate());
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (runningBackCare) {
    return (
      <RunScreen
        routine={BACK_CARE_ROUTINE}
        onExit={() => {
          setRunningBackCare(false);
          void refresh();
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-white">
            {today ? formatLongDate(today) : "Today"}
          </h1>
        </div>
        <nav className="flex shrink-0 gap-2">
          <HeaderLink href="/exercises">Library</HeaderLink>
          <HeaderLink href="/timer">Timer</HeaderLink>
        </nav>
      </header>

      {load === null || today === null ? (
        <Centered>
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
        </Centered>
      ) : load.kind === "error" ? (
        <LoadError failure={load.failure} onRetry={() => void refresh()} />
      ) : load.kind === "setup" ? (
        <SetupCard reason={load.reason} />
      ) : (
        <Plan
          data={load.data}
          stale={load.stale}
          today={today}
          active={active}
          pending={pending}
          onGuide={setGuide}
          onStartBackCare={() => {
            announcer.unlock();
            setRunningBackCare(true);
          }}
          onStartWorkout={(workout, week) => {
            announcer.unlock();
            if (!(active && active.phase !== "done" && active.workout === workout)) {
              saveActiveWorkout(
                createWorkout({ data: load.data, workout, date: today, week, id: newSessionId(), now: Date.now() }),
              );
            }
            router.push("/workout");
          }}
        />
      )}

      <GuideSheet exerciseId={guide} onClose={() => setGuide(null)} />
    </main>
  );
}

/* ------------------------------------------------------------------ *
 * The plan for today
 * ------------------------------------------------------------------ */

function Plan({
  data,
  stale,
  today,
  active,
  pending,
  onGuide,
  onStartWorkout,
  onStartBackCare,
}: {
  data: TrainingData;
  stale: boolean;
  today: string;
  active: WorkoutState | null;
  pending: number;
  onGuide: (exerciseId: string) => void;
  onStartWorkout: (workout: WorkoutKey, week: number) => void;
  onStartBackCare: () => void;
}) {
  const plan = buildToday(data.programme, data.history, today);
  const { programme } = data;
  const dayLabel =
    plan.plan === "strength" ? "Strength day" : plan.plan === "backcare" ? "Back care day" : "Rest day";
  const resumable = active && active.phase !== "done" ? active : null;

  const workoutCard = (workout: WorkoutKey, heading: string, action?: string) => (
    <WorkoutCard
      data={data}
      workout={workout}
      week={plan.week}
      heading={heading}
      onGuide={onGuide}
      action={action ? { label: action, onClick: () => onStartWorkout(workout, plan.week) } : undefined}
    />
  );

  return (
    <div className="mt-1 flex flex-1 flex-col">
      <p className="text-sm text-white/45">
        Week {plan.week} · {dayLabel}
      </p>

      <div className="mt-4 space-y-3">
        {stale && <Notice tone="prep">Offline — showing your last synced plan.</Notice>}
        {pending > 0 && (
          <Notice tone="prep">
            {pending === 1 ? "1 workout is" : `${pending} workouts are`} saved on this phone and will
            upload when you're back online.
          </Notice>
        )}
        {resumable && (
          <button
            onClick={() => onStartWorkout(resumable.workout, resumable.week)}
            className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-work)]/40 bg-[var(--color-work)]/10 px-4 py-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--color-work)]">
                Workout {resumable.workout} in progress
              </span>
              <span className="block text-xs text-white/50">
                Exercise {Math.min(resumable.index + 1, resumable.exercises.length)} of {resumable.exercises.length}
              </span>
            </span>
            <span className="text-sm font-semibold text-[var(--color-work)]">Resume →</span>
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {plan.plan === "strength" &&
          (plan.doneStrength ? (
            <DoneCard title={`Workout ${plan.doneWorkout ?? plan.workout} done`} next={plan.next} />
          ) : (
            workoutCard(plan.workout, "Today", resumable?.workout === plan.workout ? "Resume workout" : "Start workout")
          ))}

        {plan.plan !== "strength" && plan.catchUp && !plan.doneStrength && (
          <section className="rounded-2xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/5 p-4">
            <p className="text-sm font-semibold text-[var(--color-prep)]">
              You missed {fullDay(plan.catchUp.day)}&apos;s workout
            </p>
            <p className="mt-1 text-sm text-white/60">
              Nothing is skipped — Workout {plan.workout} is next whenever you do it. Do it today, or
              {plan.next ? ` on ${fullDay(plan.next.day)}` : " next time"}.
            </p>
            <button
              onClick={() => onStartWorkout(plan.workout, plan.week)}
              className="mt-3 w-full rounded-xl bg-[var(--color-prep)] py-3 font-semibold text-[var(--color-ink)] transition active:scale-95"
            >
              Do Workout {plan.workout} today
            </button>
          </section>
        )}

        {plan.plan === "backcare" &&
          (plan.doneBackCare ? (
            <DoneCard title="Back care done" next={plan.next} />
          ) : (
            <BackCareCard onGuide={onGuide} onStart={onStartBackCare} heading="Today" />
          ))}

        {plan.plan === "rest" && (
          <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="text-xl font-semibold text-white">Rest day</h2>
            <p className="mt-1 text-sm text-white/55">
              Recovery is when you get stronger. A relaxed walk is great for your back.
            </p>
            <button
              onClick={onStartBackCare}
              className="mt-3 w-full rounded-xl border border-[var(--color-rest)]/40 py-3 text-sm font-medium text-[var(--color-rest)] transition hover:bg-[var(--color-rest)]/10"
            >
              Do back care anyway ({BACK_CARE_MINUTES} min)
            </button>
          </section>
        )}

        {plan.plan === "backcare" && (
          <p className="px-1 text-sm text-white/45">
            Bonus: a 20–30 minute walk today helps your back recover.
          </p>
        )}

        {plan.next && (plan.plan !== "strength" || plan.doneStrength) && (
          workoutCard(plan.next.workout, `Next · ${fullDay(plan.next.day)}`)
        )}
      </div>

      <section className="mt-6">
        <p className="mb-3 text-xs tracking-[0.15em] text-white/35 uppercase">This week</p>
        <WeekStrip strip={plan.strip} />
      </section>

      {programme.backPain && (
        <p className="mt-6 text-xs leading-relaxed text-white/35">
          Stop any exercise that causes sharp pain. If back pain spreads down a leg, comes with
          numbness or weakness, or keeps getting worse, see a doctor or physiotherapist.
        </p>
      )}

      <nav className="mt-auto flex justify-center gap-6 pt-8 text-sm text-white/45">
        <Link href="/setup" className="transition hover:text-white">
          Plan settings
        </Link>
        <Link href="/exercises" className="transition hover:text-white">
          Exercise guides
        </Link>
      </nav>
    </div>
  );
}

function WorkoutCard({
  data,
  workout,
  week,
  heading,
  onGuide,
  action,
}: {
  data: TrainingData;
  workout: WorkoutKey;
  week: number;
  heading: string;
  onGuide: (exerciseId: string) => void;
  action?: { label: string; onClick: () => void };
}) {
  const slots = slotsFor(data.slots, workout);
  const minutes = estimateMinutes(slots, week, data.programme.level);
  const highlighted = Boolean(action);

  return (
    <section
      className={`rounded-3xl border p-4 ${
        highlighted
          ? "border-[var(--color-work)]/30 bg-[var(--color-surface)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)]/60"
      }`}
    >
      <p
        className={`text-xs font-semibold tracking-[0.15em] uppercase ${
          highlighted ? "text-[var(--color-work)]" : "text-white/40"
        }`}
      >
        {heading}
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-white">Workout {workout}</h2>
      <p className="text-sm text-white/45">
        {WORKOUT_NAMES[workout]} · about {minutes} min
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {slots.map((slot) => (
          <SlotRow key={slot.id} slot={slot} data={data} week={week} onGuide={onGuide} />
        ))}
      </ul>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold tracking-tight text-[var(--color-ink)] shadow-[0_0_60px_-20px_var(--color-work)] transition active:scale-95"
        >
          {action.label}
        </button>
      )}
    </section>
  );
}

function SlotRow({
  slot,
  data,
  week,
  onGuide,
}: {
  slot: Slot;
  data: TrainingData;
  week: number;
  onGuide: (exerciseId: string) => void;
}) {
  const exercise = getExercise(slot.exerciseId);
  const sets = setsForWeek(slot.sets, week, data.programme.level);
  const last = data.last[slot.exerciseId];
  const load = describeLoad(slot, exercise, data.programme.equipment);

  return (
    <li>
      <button onClick={() => onGuide(slot.exerciseId)} className="flex w-full items-center gap-3 py-2.5 text-left">
        <ExerciseThumb images={exercise.images} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-white">{exercise.name}</span>
          <span className="block truncate text-xs text-white/45">
            {sets} × {formatTarget(exercise, slot)}
            {last && last.values.length > 0 && ` · last ${last.values.join(", ")}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-sm font-semibold ${load.highlight ? "text-[var(--color-prep)]" : "text-white"}`}>
            {load.weight}
          </span>
          {load.detail && <span className="block text-[11px] text-white/40">{load.detail}</span>}
        </span>
      </button>
    </li>
  );
}

function describeLoad(
  slot: Slot,
  exercise: ExerciseDef,
  equipment: Equipment,
): { weight: string; detail?: string; highlight?: boolean } {
  if (exercise.load === "none" || exercise.kind === "timed") return { weight: "" };
  if (slot.weight === null) {
    const guess = snapDown(ladderFor(exercise, equipment), exercise.startGuess ?? 0);
    return { weight: "Find it", detail: `try ${trimNumber(guess)} kg`, highlight: true };
  }
  if (slot.weight === 0) return { weight: "Bodyweight" };
  const loading = loadingFor(equipment, exercise.load, slot.weight);
  return {
    weight: `${trimNumber(slot.weight)} kg${exercise.load === "pair" ? " each" : ""}`,
    detail: loading ? `${formatPlates(loading.perSide)} per end` : undefined,
  };
}

function BackCareCard({
  heading,
  onGuide,
  onStart,
}: {
  heading: string;
  onGuide: (exerciseId: string) => void;
  onStart: () => void;
}) {
  const moves = BACK_CARE.moves.filter(
    (move, index, all) => all.findIndex((other) => other.exerciseId === move.exerciseId) === index,
  );

  return (
    <section className="rounded-3xl border border-[var(--color-rest)]/30 bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-rest)] uppercase">{heading}</p>
      <h2 className="mt-1 text-2xl font-semibold text-white">Back care</h2>
      <p className="text-sm text-white/45">
        {BACK_CARE.moves.length} gentle moves · about {BACK_CARE_MINUTES} min, guided by voice
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {moves.map((move) => (
          <li key={move.exerciseId}>
            <button
              onClick={() => onGuide(move.exerciseId)}
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/5"
            >
              {getExercise(move.exerciseId).name}
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={onStart}
        className="mt-4 w-full rounded-2xl bg-[var(--color-rest)] py-4 text-lg font-bold tracking-tight text-[var(--color-ink)] transition active:scale-95"
      >
        Start back care
      </button>
    </section>
  );
}

function DoneCard({
  title,
  next,
}: {
  title: string;
  next: { day: string; workout: WorkoutKey } | null;
}) {
  return (
    <section className="rounded-3xl border border-[var(--color-work)]/30 bg-[var(--color-work)]/10 p-5 text-center">
      <p className="text-3xl" aria-hidden="true">
        ✓
      </p>
      <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/55">
        Nice work.{next ? ` Next strength session: ${fullDay(next.day)}, Workout ${next.workout}.` : ""}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Other states
 * ------------------------------------------------------------------ */

function SetupCard({ reason }: { reason: "databases" | "programme" }) {
  return (
    <Centered>
      <div className="w-full rounded-3xl border border-[var(--color-work)]/30 bg-[var(--color-surface)] p-5">
        <h2 className="text-xl font-semibold text-white">Let&apos;s set up your training plan</h2>
        <p className="mt-2 text-sm text-white/60">
          Pick your training days and tell the app about your dumbbells. It builds a beginner,
          back-friendly home plan that moves your weights up as you get stronger.
        </p>
        {reason === "databases" && (
          <p className="mt-3 text-xs text-white/40">
            Three databases will be added to your Notion Health Tracker page: Training Programme,
            Programme Exercises and Lift Log. Nothing that&apos;s already there is changed.
          </p>
        )}
        <Link
          href="/setup"
          className="mt-5 block rounded-2xl bg-[var(--color-work)] py-4 text-center text-lg font-semibold text-[var(--color-ink)] transition active:scale-95"
        >
          Set up my plan
        </Link>
        <Link href="/timer" className="mt-3 block text-center text-sm text-white/45 hover:text-white">
          Just use the timer
        </Link>
      </div>
    </Centered>
  );
}

function LoadError({ failure, onRetry }: { failure: ApiFailure; onRetry: () => void }) {
  const config = failure.kind === "config";
  return (
    <Centered>
      <div className="w-full rounded-2xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/5 p-5">
        <h2 className="font-semibold text-[var(--color-prep)]">
          {config ? "Notion isn't connected yet" : "Couldn't load your plan"}
        </h2>
        <p className="mt-2 text-sm text-white/60">{failure.message}</p>
        {config ? (
          <p className="mt-3 text-sm text-white/45">
            See <code className="text-white/70">README.md</code> for the Notion setup.
          </p>
        ) : (
          <button
            onClick={onRetry}
            className="mt-4 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm text-white/75 hover:bg-white/5"
          >
            Try again
          </button>
        )}
      </div>
    </Centered>
  );
}

function Notice({ tone, children }: { tone: "prep"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-xl border px-4 py-2 text-xs ${
        tone === "prep" ? "border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 text-[var(--color-prep)]" : ""
      }`}
    >
      {children}
    </p>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-[var(--color-line)] px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5"
    >
      {children}
    </Link>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center py-10">{children}</div>;
}

const FULL_DAYS: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function fullDay(day: string): string {
  return FULL_DAYS[day] ?? day;
}

function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  // Short month so it fits beside the header buttons on a narrow phone.
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}
