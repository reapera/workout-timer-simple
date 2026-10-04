import { videoUrl, type ExerciseDef } from "@/lib/training/exercises";

import { ExerciseImages } from "./ExerciseImages";

/** Everything needed to learn a move: pictures, steps, pitfalls, back advice. */
export function ExerciseGuide({ exercise }: { exercise: ExerciseDef }) {
  return (
    <div>
      <ExerciseImages images={exercise.images} name={exercise.name} />
      {exercise.imageNote && <p className="mt-2 text-xs text-white/45">{exercise.imageNote}</p>}

      {exercise.muscles.length > 0 && (
        <p className="mt-4 text-xs tracking-[0.15em] text-white/40 uppercase">{exercise.muscles.join(" · ")}</p>
      )}

      {exercise.back && (
        <div className="mt-4 rounded-xl border border-[var(--color-rest)]/30 bg-[var(--color-rest)]/10 p-3">
          <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-rest)] uppercase">Back care</p>
          <p className="mt-1 text-sm text-white/80">{exercise.back}</p>
        </div>
      )}

      {exercise.cues.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white">How to do it</h3>
          <ol className="mt-2 space-y-2">
            {exercise.cues.map((cue, index) => (
              <li key={cue} className="flex gap-3 text-sm text-white/75">
                <span className="tnum mt-px h-5 w-5 shrink-0 rounded-full bg-[var(--color-surface-2)] text-center text-xs leading-5 text-white/60">
                  {index + 1}
                </span>
                <span>{cue}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {exercise.mistakes.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white">Watch out for</h3>
          <ul className="mt-2 space-y-1.5">
            {exercise.mistakes.map((mistake) => (
              <li key={mistake} className="flex gap-2 text-sm text-white/65">
                <span className="text-[var(--color-prep)]" aria-hidden="true">
                  !
                </span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <a
        href={videoUrl(exercise)}
        target="_blank"
        rel="noreferrer"
        className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-3 text-sm text-white/75 transition hover:bg-white/5"
      >
        <span aria-hidden="true">▶</span> Watch a demo video
      </a>
    </div>
  );
}
