"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RunScreen } from "@/components/RunScreen";
import {
  fetchRoutines,
  flushPendingLogs,
  pickInitialRoutine,
  setLastPickedId,
  type ApiFailure,
} from "@/lib/client";
import { formatDuration, totalWorkSeconds, PREP_SECONDS, REST_SECONDS } from "@/lib/types";
import type { Routine } from "@/lib/types";

/** The original one-button interval timer, now one tap away from Today. */
export default function TimerPage() {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [stale, setStale] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Any session that finished while offline goes up before we read.
      await flushPendingLogs();
      const result = await fetchRoutines();
      if (cancelled) return;

      setRoutines(result.routines);
      setStale(result.stale);
      setFailure(result.failure);
      setSelectedId(pickInitialRoutine(result.routines)?.id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = routines?.find((routine) => routine.id === selectedId) ?? null;

  if (running && selected) {
    return <RunScreen routine={selected} onExit={() => setRunning(false)} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-white/50 transition hover:text-white">
          ← Today
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-white">Timer</h1>
        <Link
          href="/routines"
          className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm text-white/70 transition hover:bg-white/5"
        >
          Routines
        </Link>
      </header>

      {routines === null ? (
        <Centered>
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
        </Centered>
      ) : failure?.kind === "config" ? (
        <SetupNeeded message={failure.message} />
      ) : !routines.length ? (
        <EmptyState failure={failure} />
      ) : (
        <>
          <Centered>
            {stale && (
              <p className="mb-6 rounded-xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 px-4 py-2 text-center text-xs text-[var(--color-prep)]">
                Offline — showing your last synced routines.
              </p>
            )}

            <button
              onClick={() => {
                if (!selected?.exercises.length) return;
                setLastPickedId(selected.id);
                setRunning(true);
              }}
              disabled={!selected?.exercises.length}
              className="flex aspect-square w-full max-w-[19rem] flex-col items-center justify-center rounded-full bg-[var(--color-work)] text-[var(--color-ink)] shadow-[0_0_80px_-20px_var(--color-work)] transition active:scale-95 disabled:bg-[var(--color-surface-2)] disabled:text-white/30 disabled:shadow-none"
            >
              <span className="text-5xl font-bold tracking-tight">START</span>
              {selected && (
                <span className="mt-3 max-w-[80%] truncate px-2 text-sm font-medium opacity-70">
                  {selected.name}
                </span>
              )}
            </button>

            {selected && (
              <p className="mt-6 text-center text-sm text-white/45">
                {selected.exercises.length
                  ? `${selected.exercises.length} exercises · ${formatDuration(
                      sessionSeconds(selected),
                    )} · ${formatDuration(totalWorkSeconds(selected.exercises))} of work`
                  : "This routine has no exercises yet."}
              </p>
            )}
          </Centered>

          {routines.length > 1 && (
            <section className="pt-6">
              <p className="mb-3 text-xs tracking-[0.15em] text-white/35 uppercase">Switch</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {routines.map((routine) => (
                  <button
                    key={routine.id}
                    onClick={() => {
                      setSelectedId(routine.id);
                      setLastPickedId(routine.id);
                    }}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${
                      routine.id === selectedId
                        ? "border-[var(--color-work)] bg-[var(--color-work)]/10 text-[var(--color-work)]"
                        : "border-[var(--color-line)] text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {routine.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

/** Wall-clock length of a full run: prep before each exercise, rest between. */
function sessionSeconds(routine: Routine): number {
  const count = routine.exercises.length;
  if (!count) return 0;
  return (
    totalWorkSeconds(routine.exercises) + count * PREP_SECONDS + (count - 1) * REST_SECONDS
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center py-10">{children}</div>;
}

function EmptyState({ failure }: { failure: ApiFailure | null }) {
  return (
    <Centered>
      <p className="text-center text-white/60">
        {failure ? failure.message : "No routines yet."}
      </p>
      <Link
        href="/routines/new"
        className="mt-6 rounded-2xl bg-[var(--color-work)] px-8 py-4 font-semibold text-[var(--color-ink)] transition active:scale-95"
      >
        Create a routine
      </Link>
    </Centered>
  );
}

function SetupNeeded({ message }: { message: string }) {
  return (
    <Centered>
      <div className="w-full rounded-2xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/5 p-5">
        <h2 className="font-semibold text-[var(--color-prep)]">Notion isn&apos;t connected yet</h2>
        <p className="mt-2 text-sm text-white/60">{message}</p>
        <p className="mt-3 text-sm text-white/45">
          See <code className="text-white/70">README.md</code> for the three-minute setup: create an
          internal integration, share the Health Tracker page with it, then set the environment
          variables.
        </p>
      </div>
    </Centered>
  );
}
