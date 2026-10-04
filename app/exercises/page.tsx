import Link from "next/link";

import { ExerciseThumb } from "@/components/training/ExerciseImages";
import { DEFAULT_EQUIPMENT } from "@/lib/training/equipment";
import { getExercise } from "@/lib/training/exercises";
import { BACK_CARE, WARM_UP } from "@/lib/training/routines";
import { buildSlots, WORKOUT_NAMES } from "@/lib/training/template";

const unique = (ids: string[]) => [...new Set(ids)];
const programme = buildSlots(DEFAULT_EQUIPMENT);

const GROUPS = [
  { title: `Starting plan · Workout A · ${WORKOUT_NAMES.A}`, ids: programme.filter((s) => s.workout === "A").map((s) => s.exerciseId) },
  { title: `Starting plan · Workout B · ${WORKOUT_NAMES.B}`, ids: programme.filter((s) => s.workout === "B").map((s) => s.exerciseId) },
  {
    title: "More dumbbell exercises",
    ids: [
      "sumo-squat",
      "reverse-lunge",
      "step-up",
      "floor-fly",
      "lateral-raise",
      "reverse-fly",
      "dumbbell-curl",
      "hammer-curl",
      "floor-triceps-extension",
      "calf-raise",
      "farmer-carry",
      "suitcase-carry",
      "dumbbell-dead-bug",
    ],
  },
  {
    title: "Harder variations",
    ids: ["bulgarian-split-squat", "single-leg-rdl", "single-leg-glute-bridge"],
  },
  {
    title: "Swaps for your equipment",
    ids: ["bench-press", "floor-press-one-arm", "romanian-deadlift-single", "split-squat-goblet"],
  },
  {
    title: "Warm-up & back care",
    ids: unique([...WARM_UP.moves, ...BACK_CARE.moves].map((move) => move.exerciseId)).filter(
      (id) => !programme.some((slot) => slot.exerciseId === id),
    ),
  },
];

export default function ExercisesPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-white/50 transition hover:text-white">
          ← Today
        </Link>
        <h1 className="font-semibold text-white">Exercise guides</h1>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} className="mt-7">
          <h2 className="mb-2 text-xs tracking-[0.15em] text-white/40 uppercase">{group.title}</h2>
          <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
            {group.ids.map((id) => {
              const exercise = getExercise(id);
              return (
                <li key={id}>
                  <Link href={`/exercises/${id}`} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/5">
                    <ExerciseThumb images={exercise.images} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">{exercise.name}</span>
                      <span className="block truncate text-xs text-white/40">{exercise.muscles.join(" · ")}</span>
                    </span>
                    <span className="text-white/30" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-xs leading-relaxed text-white/30">
        Photos: free-exercise-db, released into the public domain (Unlicense). Goblet squat and bird
        dog drawings made for this app.
      </p>
    </main>
  );
}
