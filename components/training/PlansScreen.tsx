"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  applyPlan,
  fetchSavedPlans,
  fetchTraining,
  removeSavedPlan,
  saveCurrentPlan,
  type SavedPlan,
} from "@/lib/training/client";
import { getExercise } from "@/lib/training/exercises";
import { shortDate } from "@/lib/training/format";
import { PLANS, type DayOption, type PlanWorkout } from "@/lib/training/plans";
import { localDate, rotationFor } from "@/lib/training/schedule";
import { slotsFor, workoutTitle } from "@/lib/training/template";
import type { DayName, TrainingData } from "@/lib/training/types";

import { ProblemCard, Spinner, SubPage } from "./PageStates";
import type { LoadProblem } from "./useTrainingHistory";

type Choice = { kind: "builtin" | "saved"; id: string; name: string; workouts: PlanWorkout[]; days: DayOption[] };

const dayList = (days: DayName[]) => (days.length ? days.join(" · ") : "none");

/** Ready-made plans to copy into your workouts, and plans you've saved. */
export function PlansScreen() {
  const router = useRouter();
  const [data, setData] = useState<TrainingData | null>(null);
  const [saved, setSaved] = useState<SavedPlan[]>([]);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [stale, setStale] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [training, plans] = await Promise.all([fetchTraining(), fetchSavedPlans().catch(() => null)]);
    if (training.kind === "setup") return setProblem({ kind: "setup" });
    if (training.kind === "error") return setProblem({ kind: "error", failure: training.failure });
    setProblem(null);
    setData(training.data);
    setStale(training.stale);
    if (plans) setSaved(plans);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (label: string, action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't do that.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (problem) {
    return (
      <SubPage title="Plans">
        <ProblemCard problem={problem} onRetry={() => void reload()} />
      </SubPage>
    );
  }
  if (!data) {
    return (
      <SubPage title="Plans">
        <Spinner />
      </SubPage>
    );
  }

  const locked = stale || busy !== null;
  const { programme } = data;
  const rotation = rotationFor(data.slots);

  return (
    <SubPage title="Plans">
      <div className="mt-4 space-y-6 pb-6">
        {stale && (
          <p className="rounded-xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 px-4 py-2 text-xs text-[var(--color-prep)]">
            Offline — switching or saving plans needs a connection.
          </p>
        )}

        <section className="rounded-3xl border border-[var(--color-work)]/30 bg-[var(--color-surface)] p-4">
          <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-work)] uppercase">Your plan now</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{programme.name}</h2>
          <p className="text-sm text-white/45">
            {rotation.map((key) => workoutTitle(programme, key)).join(" · ")} · training {dayList(programme.trainingDays)}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {rotation.map((key) => (
              <li key={key}>
                <span className="font-medium text-white/85">{workoutTitle(programme, key)}:</span>{" "}
                <span className="text-white/50">
                  {slotsFor(data.slots, key)
                    .map((slot) => getExercise(slot.exerciseId).name)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
          <SaveCurrent
            defaultName={`${programme.name} (${shortDate(localDate())})`}
            disabled={locked}
            onSave={async (name) => {
              if (await run("Saving…", () => saveCurrentPlan(name))) await reload();
            }}
          />
        </section>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <section>
          <h2 className="mb-3 text-xs tracking-[0.15em] text-white/40 uppercase">Ready-made</h2>
          <div className="space-y-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                name={plan.name}
                summary={plan.summary}
                why={plan.why}
                workouts={plan.workouts}
                days={plan.days[0]?.label}
                current={plan.name === programme.name}
                disabled={locked}
                onUse={() => setChoice({ kind: "builtin", id: plan.id, name: plan.name, workouts: plan.workouts, days: plan.days })}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs tracking-[0.15em] text-white/40 uppercase">Saved by you</h2>
          {saved.length === 0 ? (
            <p className="text-sm text-white/45">
              Nothing saved yet. Save your plan before switching, so you can come back to it with one tap.
            </p>
          ) : (
            <div className="space-y-3">
              {saved.map((plan) => (
                <PlanCard
                  key={plan.id}
                  name={plan.name}
                  summary={plan.savedAt ? `Saved ${shortDate(plan.savedAt.slice(0, 10))}` : "Saved plan"}
                  workouts={plan.workouts}
                  current={false}
                  disabled={locked}
                  onUse={() => setChoice({ kind: "saved", id: plan.id, name: plan.name, workouts: plan.workouts, days: [] })}
                  onRemove={async () => {
                    if (await run("Removing…", () => removeSavedPlan(plan.id))) await reload();
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {busy && <p className="text-center text-xs text-white/45">{busy}</p>}
      </div>

      {choice && (
        <ApplySheet
          choice={choice}
          data={data}
          disabled={locked}
          onClose={() => setChoice(null)}
          onApply={async (options) => {
            const done = await run(`Switching to ${choice.name}…`, () =>
              applyPlan({ plan: { kind: choice.kind, id: choice.id }, ...options }),
            );
            if (done) router.push("/");
          }}
        />
      )}
    </SubPage>
  );
}

function SaveCurrent({
  defaultName,
  disabled,
  onSave,
}: {
  defaultName: string;
  disabled: boolean;
  onSave: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="mt-4 w-full rounded-2xl border border-[var(--color-line)] py-3 text-sm font-medium text-white/80 transition hover:bg-white/5 disabled:opacity-50"
      >
        Save it as a plan
      </button>
    );
  }
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          onSave(name.trim());
          setOpen(false);
        }
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        aria-label="Plan name"
        autoFocus
        className="min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2.5 text-base text-white outline-none focus:border-[var(--color-work)]"
      />
      <button disabled={disabled || !name.trim()} className="shrink-0 rounded-xl bg-[var(--color-work)] px-4 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-40">
        Save
      </button>
    </form>
  );
}

function PlanCard({
  name,
  summary,
  why,
  workouts,
  days,
  current,
  disabled,
  onUse,
  onRemove,
}: {
  name: string;
  summary: string;
  why?: string;
  workouts: PlanWorkout[];
  days?: string;
  current: boolean;
  disabled: boolean;
  onUse: () => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <article className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{name}</h3>
          <p className="text-sm text-white/55">{summary}</p>
        </div>
        {current && <span className="shrink-0 rounded-full bg-[var(--color-work)]/15 px-2.5 py-1 text-xs text-[var(--color-work)]">Current</span>}
      </div>
      <p className="mt-2 text-xs text-white/45">
        {workouts.map((workout) => workout.name ?? `Workout ${workout.key}`).join(" · ")}
        {days ? ` · ${days}` : ""}
      </p>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          {why && <p className="text-white/60">{why}</p>}
          {workouts.map((workout) => (
            <p key={workout.key}>
              <span className="font-medium text-white/85">{workout.name ?? `Workout ${workout.key}`}:</span>{" "}
              <span className="text-white/50">{workout.entries.map((entry) => getExercise(entry.exerciseId).name).join(", ")}</span>
            </p>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onUse}
          disabled={disabled}
          className="rounded-xl bg-[var(--color-work)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-40"
        >
          Use this plan
        </button>
        <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="rounded-xl px-3 py-2 text-sm text-white/55 hover:text-white">
          {open ? "Less" : "Details"}
        </button>
        {onRemove && (
          <button
            onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
            disabled={disabled}
            className="ml-auto rounded-xl px-3 py-2 text-sm text-red-300/70 hover:text-red-300 disabled:opacity-40"
          >
            {confirmRemove ? "Tap again to remove" : "Remove"}
          </button>
        )}
      </div>
    </article>
  );
}

function ApplySheet({
  choice,
  data,
  disabled,
  onClose,
  onApply,
}: {
  choice: Choice;
  data: TrainingData;
  disabled: boolean;
  onClose: () => void;
  onApply: (options: { days?: { trainingDays: DayName[]; backCareDays: DayName[] }; saveCurrentAs?: string }) => void;
}) {
  const { programme } = data;
  const same = (option: DayOption) =>
    option.trainingDays.join() === programme.trainingDays.join() && option.backCareDays.join() === programme.backCareDays.join();
  const options = choice.days.filter((option) => !same(option));
  const [picked, setPicked] = useState<number>(options.length ? 0 : -1);
  const [save, setSave] = useState(true);
  const [name, setName] = useState(`${programme.name} (${shortDate(localDate())})`);
  const first = choice.workouts[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Switch to ${choice.name}`}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-ink)] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Switch to {choice.name}?</h2>
          <button onClick={onClose} className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-white/70 hover:bg-white/5">
            Close
          </button>
        </div>

        <p className="text-sm text-white/60">
          Your current exercises are kept in Notion with their history. Weights you&apos;ve already worked out carry
          over to the same exercises, and the rotation starts with {first?.name ?? "Workout A"}.
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs tracking-[0.15em] text-white/40 uppercase">Training days</legend>
          <div className="mt-2 space-y-2">
            {options.map((option, index) => (
              <label key={option.label} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${picked === index ? "border-[var(--color-work)]/50 bg-[var(--color-work)]/5" : "border-[var(--color-line)]"}`}>
                <input type="radio" name="days" checked={picked === index} onChange={() => setPicked(index)} className="mt-1 h-4 w-4 accent-[var(--color-work)]" />
                <span>
                  <span className="block text-sm font-medium text-white">
                    {option.label}
                    {index === 0 && choice.days.indexOf(option) === 0 ? " (suggested)" : ""}
                  </span>
                  <span className="block text-xs text-white/50">{option.detail}</span>
                </span>
              </label>
            ))}
            <label className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${picked === -1 ? "border-[var(--color-work)]/50 bg-[var(--color-work)]/5" : "border-[var(--color-line)]"}`}>
              <input type="radio" name="days" checked={picked === -1} onChange={() => setPicked(-1)} className="mt-1 h-4 w-4 accent-[var(--color-work)]" />
              <span>
                <span className="block text-sm font-medium text-white">Keep my days</span>
                <span className="block text-xs text-white/50">
                  Training {dayList(programme.trainingDays)} · back care {dayList(programme.backCareDays)}
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[var(--color-line)] p-3">
          <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--color-work)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white">Save my current workouts first</span>
            <span className="block text-xs text-white/50">So you can switch back with one tap.</span>
            {save && (
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                aria-label="Name for your current workouts"
                className="mt-2 block w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-base text-white outline-none focus:border-[var(--color-work)]"
              />
            )}
          </span>
        </label>

        <button
          onClick={() =>
            onApply({
              ...(picked >= 0 ? { days: { trainingDays: options[picked].trainingDays, backCareDays: options[picked].backCareDays } } : {}),
              ...(save && name.trim() ? { saveCurrentAs: name.trim() } : {}),
            })
          }
          disabled={disabled || (save && !name.trim())}
          className="mt-5 w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-40"
        >
          Switch plan
        </button>
      </div>
    </div>
  );
}
