"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveRoutine } from "@/lib/client";
import { formatDuration, totalWorkSeconds, type Exercise, type Routine } from "@/lib/types";

let tempCounter = 0;
const newRow = (): Exercise => ({ id: `tmp-${++tempCounter}`, name: "", duration: 45 });

export function RoutineEditor({ routine }: { routine?: Routine }) {
  const router = useRouter();
  const [name, setName] = useState(routine?.name ?? "");
  const [exercises, setExercises] = useState<Exercise[]>(
    routine?.exercises.length ? routine.exercises : [newRow()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (index: number, changes: Partial<Exercise>) =>
    setExercises((current) =>
      current.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );

  const move = (index: number, direction: -1 | 1) =>
    setExercises((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (index: number) =>
    setExercises((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );

  const save = async () => {
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) return setError("Give the routine a name.");

    const cleaned = exercises
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name);
    if (!cleaned.length) return setError("Add at least one exercise with a name.");

    const bad = cleaned.find((item) => !Number.isFinite(item.duration) || item.duration < 1);
    if (bad) return setError(`"${bad.name}" needs a duration of at least 1 second.`);

    setSaving(true);
    try {
      await saveRoutine(routine?.id ?? null, trimmed, cleaned);
      router.push("/routines");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/routines" className="text-sm text-white/50 transition hover:text-white">
          ← Routines
        </Link>
        <span className="text-sm text-white/35">
          {exercises.filter((item) => item.name.trim()).length} exercises ·{" "}
          {formatDuration(totalWorkSeconds(exercises.filter((item) => item.name.trim())))}
        </span>
      </header>

      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Routine name"
        maxLength={100}
        className="mt-6 w-full border-b border-[var(--color-line)] bg-transparent pb-3 text-2xl font-semibold text-white outline-none placeholder:text-white/25 focus:border-[var(--color-work)]"
      />

      <ul className="mt-6 space-y-3">
        {exercises.map((exercise, index) => (
          <li
            key={exercise.id}
            className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="tnum w-6 shrink-0 text-center text-sm text-white/30">
                {index + 1}
              </span>
              <input
                value={exercise.name}
                onChange={(event) => patch(index, { name: event.target.value })}
                placeholder="Exercise name"
                maxLength={100}
                className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25"
              />
              <div className="flex shrink-0 items-center rounded-xl border border-[var(--color-line)]">
                <Stepper label="−" onClick={() => patch(index, { duration: Math.max(1, exercise.duration - 5) })} />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={3600}
                  value={exercise.duration}
                  onChange={(event) =>
                    patch(index, { duration: Math.round(Number(event.target.value)) })
                  }
                  className="tnum w-12 bg-transparent py-2 text-center text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Stepper label="+" onClick={() => patch(index, { duration: Math.min(3600, exercise.duration + 5) })} />
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-1 text-xs">
              <RowAction onClick={() => move(index, -1)} disabled={index === 0} label="Up" />
              <RowAction
                onClick={() => move(index, 1)}
                disabled={index === exercises.length - 1}
                label="Down"
              />
              <RowAction
                onClick={() => remove(index)}
                disabled={exercises.length === 1}
                label="Remove"
                danger
              />
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={() => setExercises((current) => [...current, newRow()])}
        className="mt-3 rounded-2xl border border-dashed border-[var(--color-line)] py-4 text-sm text-white/50 transition hover:border-white/30 hover:text-white/80"
      >
        + Add exercise
      </button>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
        >
          {saving ? "Saving to Notion…" : "Save"}
        </button>
      </div>
    </main>
  );
}

function Stepper({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-white/50 transition hover:text-white active:scale-90"
      aria-label={label === "+" ? "Increase by 5 seconds" : "Decrease by 5 seconds"}
    >
      {label}
    </button>
  );
}

function RowAction({
  onClick,
  disabled,
  label,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2.5 py-1 transition disabled:opacity-25 ${
        danger ? "text-red-400/80 hover:bg-red-500/10" : "text-white/45 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}
