"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  deleteRoutine,
  duplicateRoutine,
  fetchRoutines,
  makeDefault,
  type ApiFailure,
} from "@/lib/client";
import { formatDuration, totalWorkSeconds, type Routine } from "@/lib/types";

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = async () => {
    const result = await fetchRoutines();
    setRoutines(result.routines);
    setFailure(result.failure);
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (caught) {
      setFailure({
        message: caught instanceof Error ? caught.message : "Something went wrong.",
        kind: "unknown",
      });
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/timer" className="text-sm text-white/50 transition hover:text-white">
          ← Timer
        </Link>
        <h1 className="font-semibold text-white">Routines</h1>
      </header>

      {failure && (
        <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {failure.message}
        </p>
      )}

      {routines === null ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {routines.map((routine) => (
            <li
              key={routine.id}
              className={`rounded-2xl border bg-[var(--color-surface)] p-4 transition ${
                busyId === routine.id
                  ? "border-[var(--color-line)] opacity-50"
                  : "border-[var(--color-line)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {routine.name}
                    {routine.isDefault && (
                      <span className="ml-2 rounded-full bg-[var(--color-work)]/15 px-2 py-0.5 text-[10px] tracking-wide text-[var(--color-work)] uppercase">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-white/40">
                    {routine.exercises.length} exercises ·{" "}
                    {formatDuration(totalWorkSeconds(routine.exercises))} of work
                  </p>
                </div>
                <Link
                  href={`/routines/${routine.id}`}
                  className="shrink-0 rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-white/70 transition hover:bg-white/5"
                >
                  Edit
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Action
                  label="Duplicate"
                  onClick={() => run(routine.id, () => duplicateRoutine(routine.id))}
                />
                {!routine.isDefault && (
                  <Action
                    label="Make default"
                    onClick={() => run(routine.id, () => makeDefault(routine.id))}
                  />
                )}
                {confirmingId === routine.id ? (
                  <>
                    <Action
                      label="Confirm delete"
                      danger
                      onClick={() => run(routine.id, () => deleteRoutine(routine.id))}
                    />
                    <Action label="Cancel" onClick={() => setConfirmingId(null)} />
                  </>
                ) : (
                  <Action label="Delete" danger onClick={() => setConfirmingId(routine.id)} />
                )}
              </div>
            </li>
          ))}

          {!routines.length && !failure && (
            <li className="py-10 text-center text-white/45">No routines yet.</li>
          )}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <Link
          href="/routines/new"
          className="block rounded-2xl bg-[var(--color-work)] py-4 text-center text-lg font-semibold text-[var(--color-ink)] transition active:scale-95"
        >
          New routine
        </Link>
      </div>
    </main>
  );
}

function Action({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 transition ${
        danger
          ? "border-red-500/25 text-red-400/85 hover:bg-red-500/10"
          : "border-[var(--color-line)] text-white/55 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}
