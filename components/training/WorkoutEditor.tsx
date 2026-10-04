"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { addSlot, fetchArchivedSlots, fetchTraining, renameWorkouts, updateSlots } from "@/lib/training/client";
import { dumbbellOnlyChanges, exerciseGroups, slotUsesDumbbell } from "@/lib/training/customize";
import { ladderFor, snapNearest, trimNumber } from "@/lib/training/equipment";
import { getExercise, type ExerciseDef } from "@/lib/training/exercises";
import { formatTarget } from "@/lib/training/format";
import { rotationFor } from "@/lib/training/schedule";
import { slotsFor, workoutName, workoutTitle } from "@/lib/training/template";
import { isWorkoutKey, WORKOUT_KEYS, type Equipment, type Slot, type TrainingData, type WorkoutKey } from "@/lib/training/types";
import type { SlotUpdate } from "@/lib/training/validate";

import { ExerciseThumb } from "./ExerciseImages";
import { ProblemCard, Spinner, SubPage } from "./PageStates";
import type { LoadProblem } from "./useTrainingHistory";

type Picker = { mode: "add"; workout: WorkoutKey } | { mode: "swap"; slot: Slot };

/** Change what's in each workout: swap, add, remove, reorder, set the targets, and name or add workouts. */
export function WorkoutEditor() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [stale, setStale] = useState(false);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [archived, setArchived] = useState<Slot[]>([]);
  const [workout, setWorkout] = useState<WorkoutKey>("A");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [naming, setNaming] = useState<{ key: WorkoutKey; isNew: boolean } | null>(null);
  const [confirmRemoveWorkout, setConfirmRemoveWorkout] = useState(false);

  const reload = useCallback(async () => {
    const [training, removed] = await Promise.all([fetchTraining(), fetchArchivedSlots().catch(() => null)]);
    if (training.kind === "setup") return setProblem({ kind: "setup" });
    if (training.kind === "error") return setProblem({ kind: "error", failure: training.failure });
    setProblem(null);
    setData(training.data);
    setStale(training.stale);
    if (removed) setArchived(removed);
  }, []);

  useEffect(() => {
    // `?w=B` opens on Workout B (read here rather than with useSearchParams so the page stays static).
    const requested = new URLSearchParams(window.location.search).get("w");
    if (isWorkoutKey(requested)) setWorkout(requested);
    void reload();
  }, [reload]);

  /** Saves, then reloads so every screen (and the offline copy) shows the new plan. */
  const run = async (label: string, action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save that change.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (problem) {
    return (
      <SubPage title="Your workouts">
        <ProblemCard problem={problem} onRetry={() => void reload()} />
      </SubPage>
    );
  }
  if (!data) {
    return (
      <SubPage title="Your workouts">
        <Spinner />
      </SubPage>
    );
  }

  const { equipment } = data.programme;
  const rotation = rotationFor(data.slots);
  // A workout being created has no exercises yet, so it isn't in the rotation until one is added.
  const tabs = rotation.includes(workout) ? rotation : [...rotation, workout].sort();
  const title = (key: WorkoutKey) => workoutTitle(data.programme, key);
  const freeKey = WORKOUT_KEYS.find((key) => !tabs.includes(key)) ?? null;
  const slots = slotsFor(data.slots, workout);
  const removed = archived.filter((slot) => slot.workout === workout);
  const locked = stale || busy !== null;

  const move = (slot: Slot, direction: -1 | 1) => {
    const index = slots.findIndex((candidate) => candidate.id === slot.id);
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    const reordered = [...slots];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const updates = reordered.flatMap((item, position) => (item.order === position + 1 ? [] : [{ id: item.id, order: position + 1 }]));
    void run("Moving…", () => updateSlots(updates));
  };

  const nextOrder = () => Math.floor(Math.max(0, ...slots.map((slot) => slot.order))) + 1;

  return (
    <SubPage title="Your workouts">
      <div className="mt-4 space-y-5 pb-6">
        {stale && (
          <p className="rounded-xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 px-4 py-2 text-xs text-[var(--color-prep)]">
            Offline — you can look, but changes need a connection.
          </p>
        )}

        <Link
          href="/plans"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3"
        >
          <span>
            <span className="block text-sm font-medium text-white">Ready-made plans</span>
            <span className="block text-xs text-white/45">
              Now: {data.programme.name}. Switch to another plan, or save this one.
            </span>
          </span>
          <span className="shrink-0 text-sm text-white/50">→</span>
        </Link>

        <DumbbellOnly
          data={data}
          rotation={rotation}
          disabled={locked}
          onApply={(changes) => void run("Switching to dumbbells…", () => updateSlots(changes))}
        />

        <div className="grid gap-1 rounded-2xl border border-[var(--color-line)] p-1" style={{ gridTemplateColumns: `repeat(${tabs.length + (freeKey ? 1 : 0)}, minmax(0, 1fr))` }} role="tablist" aria-label="Workout">
          {tabs.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={workout === key}
              onClick={() => {
                setWorkout(key);
                setConfirmRemoveWorkout(false);
              }}
              className={`min-w-0 rounded-xl px-2.5 py-2 text-left transition ${workout === key ? "bg-[var(--color-surface-2)]" : ""}`}
            >
              <span className={`block truncate text-sm font-semibold ${workout === key ? "text-white" : "text-white/50"}`}>
                {title(key)}
              </span>
              <span className="block truncate text-xs text-white/40">{workoutName(slotsFor(data.slots, key))}</span>
            </button>
          ))}
          {freeKey && (
            <button
              onClick={() => setNaming({ key: freeKey, isNew: true })}
              disabled={locked}
              aria-label="New workout"
              className="rounded-xl px-2 py-2 text-sm font-semibold text-[var(--color-work)] hover:bg-white/5 disabled:opacity-50"
            >
              + New
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <section aria-label={`${title(workout)} exercises`}>
          <ul className="divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
            {slots.map((slot, index) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                equipment={equipment}
                first={index === 0}
                last={index === slots.length - 1}
                disabled={locked}
                onEdit={() => setEditing(slot)}
                onMove={(direction) => move(slot, direction)}
              />
            ))}
          </ul>
          <button
            onClick={() => setPicker({ mode: "add", workout })}
            disabled={locked}
            className="mt-3 w-full rounded-2xl border border-dashed border-[var(--color-work)]/50 py-3 text-sm font-semibold text-[var(--color-work)] transition hover:bg-[var(--color-work)]/5 disabled:opacity-50"
          >
            + Add an exercise to {title(workout)}
          </button>
          {busy && <p className="mt-2 text-center text-xs text-white/45">{busy}</p>}
          <div className="mt-3 flex justify-center gap-5 text-sm">
            <button onClick={() => setNaming({ key: workout, isNew: false })} disabled={locked} className="text-white/50 hover:text-white disabled:opacity-50">
              Rename
            </button>
            {rotation.length > 1 && slots.length > 0 && (
              <button
                onClick={() =>
                  confirmRemoveWorkout
                    ? void run(`Removing ${title(workout)}…`, () => updateSlots(slots.map((slot) => ({ id: slot.id, archived: true })))).then(
                        (done) => {
                          setConfirmRemoveWorkout(false);
                          if (done) setWorkout(rotation.find((key) => key !== workout) ?? "A");
                        },
                      )
                    : setConfirmRemoveWorkout(true)
                }
                disabled={locked}
                className="text-red-300/70 hover:text-red-300 disabled:opacity-50"
              >
                {confirmRemoveWorkout ? `Tap again to remove ${title(workout)}` : "Remove this workout"}
              </button>
            )}
          </div>
        </section>

        {removed.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs tracking-[0.15em] text-white/40 uppercase">Removed from {title(workout)}</h2>
            <ul className="divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)]">
              {removed.map((slot) => (
                <li key={slot.id} className="flex items-center gap-3 px-3 py-2.5">
                  <ExerciseThumb images={getExercise(slot.exerciseId).images} />
                  <span className="min-w-0 flex-1 text-sm text-white/60">{getExercise(slot.exerciseId).name}</span>
                  <button
                    onClick={() => void run("Putting it back…", () => updateSlots([{ id: slot.id, archived: false, order: nextOrder() }]))}
                    disabled={locked}
                    className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-white/75 hover:bg-white/5 disabled:opacity-50"
                  >
                    Put back
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <BackCareNote data={data} />
      </div>

      {naming && (
        <NameSheet
          isNew={naming.isNew}
          current={naming.isNew ? "" : (data.programme.workoutNames?.[naming.key] ?? "")}
          fallback={`Workout ${naming.key}`}
          disabled={locked}
          onClose={() => setNaming(null)}
          onSave={async (name) => {
            const key = naming.key;
            if (await run("Saving the name…", () => renameWorkouts({ [key]: name }))) {
              setNaming(null);
              setWorkout(key);
              if (naming.isNew) setPicker({ mode: "add", workout: key });
            }
          }}
        />
      )}

      {editing && (
        <SlotSheet
          slot={editing}
          workoutTitle={title(editing.workout)}
          equipment={equipment}
          onlyOne={slots.length <= 1}
          disabled={locked}
          onClose={() => setEditing(null)}
          onSwap={() => {
            setPicker({ mode: "swap", slot: editing });
            setEditing(null);
          }}
          onSave={async (update) => {
            if (await run("Saving…", () => updateSlots([update]))) setEditing(null);
          }}
        />
      )}

      {picker && (
        <PickerSheet
          picker={picker}
          equipment={equipment}
          workoutTitle={title(picker.mode === "add" ? picker.workout : picker.slot.workout)}
          inWorkout={slotsFor(data.slots, picker.mode === "add" ? picker.workout : picker.slot.workout).map((slot) => slot.exerciseId)}
          disabled={locked}
          onClose={() => setPicker(null)}
          onPick={async (exercise) => {
            const done = await run(
              picker.mode === "add" ? `Adding ${exercise.name}…` : `Swapping in ${exercise.name}…`,
              () =>
                picker.mode === "add"
                  ? addSlot({ workout: picker.workout, exerciseId: exercise.id })
                  : updateSlots([{ id: picker.slot.id, exerciseId: exercise.id }]),
            );
            if (done) setPicker(null);
          }}
        />
      )}
    </SubPage>
  );
}

/* ------------------------------------------------------------------ *
 * Dumbbell only
 * ------------------------------------------------------------------ */

function DumbbellOnly({
  data,
  rotation,
  disabled,
  onApply,
}: {
  data: TrainingData;
  rotation: WorkoutKey[];
  disabled: boolean;
  onApply: (changes: SlotUpdate[]) => void;
}) {
  const changes = dumbbellOnlyChanges(data.slots, data.programme.equipment);
  const byId = new Map(data.slots.map((slot) => [slot.id, slot]));

  if (!changes.length) {
    return (
      <p className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-white/60">
        <span className="text-[var(--color-work)]">✓</span> Every exercise uses a dumbbell.
      </p>
    );
  }

  return (
    <section className="rounded-3xl border border-[var(--color-work)]/30 bg-[var(--color-surface)] p-4">
      <h2 className="font-semibold text-white">Only dumbbell exercises?</h2>
      <p className="mt-1 text-sm text-white/55">One tap swaps the bodyweight moves for dumbbell versions:</p>
      {rotation.map((key) => {
        const forWorkout = changes.filter((change) => byId.get(change.id)?.workout === key);
        if (!forWorkout.length) return null;
        return (
          <div key={key} className="mt-2">
            <p className="text-xs tracking-[0.15em] text-white/35 uppercase">{workoutTitle(data.programme, key)}</p>
            <ul className="mt-1 space-y-1 text-sm text-white/75">
              {forWorkout.map((change) => {
                const from = getExercise(byId.get(change.id)!.exerciseId).name;
                return (
                  <li key={change.id}>
                    {change.exerciseId ? (
                      <>
                        {from} → <span className="font-medium text-white">{getExercise(change.exerciseId).name}</span>
                      </>
                    ) : (
                      <>
                        {from} <span className="text-white/50">starts with a dumbbell</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {data.programme.backPain && (
        <p className="mt-2 text-xs text-white/40">
          The core moves stay in, now with a dumbbell, because they&apos;re the ones that protect your back.
        </p>
      )}
      <button
        onClick={() => onApply(changes)}
        disabled={disabled}
        className="mt-3 w-full rounded-2xl bg-[var(--color-work)] py-3 font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
      >
        Switch to dumbbell only
      </button>
    </section>
  );
}

function BackCareNote({ data }: { data: TrainingData }) {
  const days = data.programme.backCareDays;
  return (
    <p className="px-1 text-xs leading-relaxed text-white/40">
      {days.length
        ? `Back care days (${days.join(" · ")}) are short bodyweight stretches, separate from these workouts.`
        : "No back care days are planned."}{" "}
      <Link href="/setup" className="text-white/60 underline hover:text-white">
        Change them in Plan settings
      </Link>
      .
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * One exercise in the list
 * ------------------------------------------------------------------ */

export function weightLabel(slot: Pick<Slot, "weight">, exercise: ExerciseDef): string {
  if (exercise.load === "none") return "";
  if (slot.weight === null) return "Find it";
  if (slot.weight === 0) return "Bodyweight";
  return `${trimNumber(slot.weight)} kg${exercise.load === "pair" ? " each" : ""}`;
}

function SlotRow({
  slot,
  equipment,
  first,
  last,
  disabled,
  onEdit,
  onMove,
}: {
  slot: Slot;
  equipment: Equipment;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const exercise = getExercise(slot.exerciseId);
  const weight = weightLabel(slot, exercise);
  const usable = exercise.load !== "pair" || equipment.handles > 1;

  return (
    <li className="flex items-center gap-2 pr-2">
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left" aria-label={`Edit ${exercise.name}`}>
        <ExerciseThumb images={exercise.images} />
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-medium text-white">{exercise.name}</span>
          <span className="block text-xs text-white/45">
            {slot.sets} × {formatTarget(exercise, slot)} · rest {slot.rest} s
          </span>
          {!usable && <span className="block text-xs text-[var(--color-prep)]">Needs two dumbbells — swap it</span>}
        </span>
        {weight && (
          <span className={`shrink-0 text-right text-xs font-semibold ${slot.weight === null ? "text-[var(--color-prep)]" : "text-white/80"}`}>
            {weight}
          </span>
        )}
      </button>
      <span className="flex shrink-0 flex-col">
        <button
          onClick={() => onMove(-1)}
          disabled={disabled || first}
          aria-label={`Move ${exercise.name} up`}
          className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/5 disabled:opacity-20"
        >
          ↑
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={disabled || last}
          aria-label={`Move ${exercise.name} down`}
          className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/5 disabled:opacity-20"
        >
          ↓
        </button>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
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
        aria-label={label}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-ink)] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{label}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/5"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Draft = Pick<Slot, "sets" | "repMin" | "repMax" | "seconds" | "maxSeconds" | "rest" | "weight">;

function SlotSheet({
  slot,
  workoutTitle: owner,
  equipment,
  onlyOne,
  disabled,
  onClose,
  onSwap,
  onSave,
}: {
  slot: Slot;
  workoutTitle: string;
  equipment: Equipment;
  onlyOne: boolean;
  disabled: boolean;
  onClose: () => void;
  onSwap: () => void;
  onSave: (update: SlotUpdate) => void;
}) {
  const exercise = getExercise(slot.exerciseId);
  const timed = exercise.kind === "timed";
  const ladder = ladderFor(exercise, equipment);
  const [draft, setDraft] = useState<Draft>({
    sets: slot.sets,
    repMin: slot.repMin ?? 8,
    repMax: slot.repMax ?? 12,
    seconds: slot.seconds ?? 20,
    maxSeconds: slot.maxSeconds ?? 45,
    rest: slot.rest,
    weight: slot.weight === null || exercise.load === "none" ? slot.weight : snapNearest(ladder, slot.weight),
  });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  // Weight choices: "find it", then every weight the dumbbells can make (0 = bodyweight).
  const choices: Array<number | null> = [null, ...ladder];
  const choice = choices.findIndex((value) => value === draft.weight);
  const weightText = draft.weight === null ? "Find it" : draft.weight === 0 ? "Bodyweight" : `${trimNumber(draft.weight)} kg`;

  const changes = (): SlotUpdate => {
    const update: SlotUpdate = { id: slot.id };
    if (draft.sets !== slot.sets) update.sets = draft.sets;
    if (draft.rest !== slot.rest) update.rest = draft.rest;
    if (timed) {
      if (draft.seconds !== slot.seconds) update.seconds = draft.seconds ?? undefined;
      if (draft.maxSeconds !== slot.maxSeconds) update.maxSeconds = draft.maxSeconds ?? undefined;
    } else {
      if (draft.repMin !== slot.repMin) update.repMin = draft.repMin ?? undefined;
      if (draft.repMax !== slot.repMax) update.repMax = draft.repMax ?? undefined;
    }
    if (exercise.load !== "none" && draft.weight !== slot.weight) update.weight = draft.weight;
    return update;
  };
  const dirty = Object.keys(changes()).length > 1;

  return (
    <Sheet label={exercise.name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <ExerciseThumb images={exercise.images} />
        <p className="min-w-0 flex-1 text-sm text-white/50">{exercise.muscles.join(" · ")}</p>
        <Link href={`/exercises/${exercise.id}`} className="shrink-0 text-sm text-[var(--color-rest)] underline">
          How to
        </Link>
      </div>

      <button
        onClick={onSwap}
        disabled={disabled}
        className="mt-4 w-full rounded-2xl border border-[var(--color-line)] py-3 text-sm font-medium text-white/85 transition hover:bg-white/5 disabled:opacity-50"
      >
        Swap for another exercise
      </button>

      <div className="mt-4 space-y-3">
        <Stepper
          label="Sets"
          display={String(draft.sets)}
          onLess={draft.sets > 1 ? () => set({ sets: draft.sets - 1 }) : undefined}
          onMore={draft.sets < 6 ? () => set({ sets: draft.sets + 1 }) : undefined}
        />
        {timed ? (
          <>
            <Stepper
              label="Hold for"
              hint={exercise.perSide ? "Each side" : undefined}
              display={`${draft.seconds} s`}
              onLess={(draft.seconds ?? 0) > 5 ? () => set({ seconds: (draft.seconds ?? 20) - 5 }) : undefined}
              onMore={() => {
                const seconds = (draft.seconds ?? 20) + 5;
                set({ seconds, maxSeconds: Math.max(draft.maxSeconds ?? seconds, seconds) });
              }}
            />
            <Stepper
              label="Build up to"
              hint="Then the weight goes up"
              display={`${draft.maxSeconds} s`}
              onLess={(draft.maxSeconds ?? 0) > (draft.seconds ?? 0) ? () => set({ maxSeconds: (draft.maxSeconds ?? 45) - 5 }) : undefined}
              onMore={() => set({ maxSeconds: (draft.maxSeconds ?? 45) + 5 })}
            />
          </>
        ) : (
          <>
            <Stepper
              label="Reps, at least"
              hint={exercise.perSide ? "Each side" : undefined}
              display={String(draft.repMin)}
              onLess={(draft.repMin ?? 0) > 1 ? () => set({ repMin: (draft.repMin ?? 8) - 1 }) : undefined}
              onMore={() => {
                const repMin = (draft.repMin ?? 8) + 1;
                set({ repMin, repMax: Math.max(draft.repMax ?? repMin, repMin) });
              }}
            />
            <Stepper
              label="Reps, up to"
              hint="Reach it on every set and the weight goes up"
              display={String(draft.repMax)}
              onLess={(draft.repMax ?? 0) > (draft.repMin ?? 0) ? () => set({ repMax: (draft.repMax ?? 12) - 1 }) : undefined}
              onMore={() => set({ repMax: (draft.repMax ?? 12) + 1 })}
            />
          </>
        )}
        <Stepper
          label="Rest between sets"
          display={`${draft.rest} s`}
          onLess={draft.rest >= 15 ? () => set({ rest: draft.rest - 15 }) : undefined}
          onMore={draft.rest < 300 ? () => set({ rest: draft.rest + 15 }) : undefined}
        />
        {exercise.load !== "none" && (
          <Stepper
            label="Weight"
            hint={draft.weight === null ? "Your next session works it out" : exercise.load === "pair" ? "Each dumbbell" : undefined}
            display={weightText}
            onLess={choice > 0 ? () => set({ weight: choices[choice - 1] }) : undefined}
            onMore={choice < choices.length - 1 ? () => set({ weight: choices[Math.max(0, choice) + 1] }) : undefined}
          />
        )}
      </div>

      <button
        onClick={() => onSave(changes())}
        disabled={disabled || !dirty}
        className="mt-5 w-full rounded-2xl bg-[var(--color-work)] py-3.5 font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-40"
      >
        Save
      </button>

      {onlyOne ? (
        <p className="mt-3 text-center text-xs text-white/40">The last exercise in a workout stays. Remove the whole workout instead.</p>
      ) : (
        <button
          onClick={() => (confirmRemove ? onSave({ id: slot.id, archived: true }) : setConfirmRemove(true))}
          disabled={disabled}
          className="mt-3 w-full rounded-2xl border border-red-500/30 py-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {confirmRemove ? `Tap again to remove from ${owner}` : `Remove from ${owner}`}
        </button>
      )}
      <p className="mt-2 text-center text-xs text-white/35">Removing keeps its history; you can put it back.</p>
    </Sheet>
  );
}

function Stepper({
  label,
  hint,
  display,
  onLess,
  onMore,
}: {
  label: string;
  hint?: string;
  display: string;
  onLess?: () => void;
  onMore?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {hint && <p className="text-xs text-white/40">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center rounded-xl border border-[var(--color-line)]">
        <button onClick={onLess} disabled={!onLess} aria-label={`Less: ${label}`} className="px-3 py-2 text-white/70 disabled:opacity-25">
          −
        </button>
        <span className="tnum min-w-20 text-center text-sm font-medium text-white">{display}</span>
        <button onClick={onMore} disabled={!onMore} aria-label={`More: ${label}`} className="px-3 py-2 text-white/70 disabled:opacity-25">
          +
        </button>
      </div>
    </div>
  );
}

function PickerSheet({
  picker,
  equipment,
  workoutTitle: owner,
  inWorkout,
  disabled,
  onClose,
  onPick,
}: {
  picker: Picker;
  equipment: Equipment;
  workoutTitle: string;
  inWorkout: string[];
  disabled: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseDef) => void;
}) {
  const [dumbbellOnly, setDumbbellOnly] = useState(true);
  const current = picker.mode === "swap" ? getExercise(picker.slot.exerciseId) : null;
  const groups = exerciseGroups(equipment, {
    dumbbellOnly,
    exclude: current ? [current.id] : [],
    prefer: current?.pattern,
  });
  const label = picker.mode === "add" ? `Add to ${owner}` : `Swap ${current?.name.toLowerCase()} for…`;

  return (
    <Sheet label={label} onClose={onClose}>
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-line)] px-3 py-2.5 text-sm text-white/80">
        <input
          type="checkbox"
          checked={dumbbellOnly}
          onChange={(event) => setDumbbellOnly(event.target.checked)}
          className="h-5 w-5 accent-[var(--color-work)]"
        />
        Dumbbell exercises only
      </label>
      {current && (
        <p className="mt-3 text-xs text-white/45">
          Similar moves come first. The new exercise finds its weight in its first session.
        </p>
      )}
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <section key={group.pattern}>
            <h3 className="mb-1.5 text-xs tracking-[0.15em] text-white/40 uppercase">
              {current && group.pattern === current.pattern ? `Similar · ${group.label}` : group.label}
            </h3>
            <ul className="divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
              {group.exercises.map((exercise) => {
                const already = inWorkout.includes(exercise.id);
                return (
                  <li key={exercise.id}>
                    <button
                      onClick={() => onPick(exercise)}
                      disabled={disabled || already}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-45"
                    >
                      <ExerciseThumb images={exercise.images} />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug font-medium text-white">{exercise.name}</span>
                        <span className="block text-xs text-white/45">
                          {already ? "Already in this workout" : exercise.muscles.join(" · ")}
                        </span>
                      </span>
                      {exercise.load === "none" && <span className="shrink-0 text-xs text-white/35">No weight</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

function NameSheet({
  isNew,
  current,
  fallback,
  disabled,
  onClose,
  onSave,
}: {
  isNew: boolean;
  current: string;
  fallback: string;
  disabled: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(current);
  return (
    <Sheet label={isNew ? "New workout" : "Rename workout"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name.trim());
        }}
      >
        <label className="block text-sm text-white/60">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder={isNew ? "e.g. Arms, Full body C" : fallback}
            autoFocus
            className="mt-1 block w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-white outline-none focus:border-[var(--color-work)]"
          />
        </label>
        <p className="mt-2 text-xs text-white/40">
          {isNew
            ? "It joins the rotation once it has an exercise. Workouts take turns on your training days."
            : `Leave it empty to go back to "${fallback}".`}
        </p>
        <button
          disabled={disabled || (isNew && !name.trim())}
          className="mt-4 w-full rounded-2xl bg-[var(--color-work)] py-3.5 font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-40"
        >
          {isNew ? "Next: add exercises" : "Save"}
        </button>
      </form>
    </Sheet>
  );
}
