"use client";

import { useEffect } from "react";

import { getExercise } from "@/lib/training/exercises";

import { ExerciseGuide } from "./ExerciseGuide";

/** The exercise guide as a sheet over the current screen, so a workout never loses its place. */
export function GuideSheet({ exerciseId, onClose }: { exerciseId: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!exerciseId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exerciseId, onClose]);

  if (!exerciseId) return null;
  const exercise = getExercise(exerciseId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How to do ${exercise.name}`}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-ink)] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{exercise.name}</h2>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/5"
          >
            Close
          </button>
        </div>
        <ExerciseGuide exercise={exercise} />
      </div>
    </div>
  );
}
