import Link from "next/link";
import { notFound } from "next/navigation";

import { ExerciseGuide } from "@/components/training/ExerciseGuide";
import { EXERCISE_LIST, EXERCISES } from "@/lib/training/exercises";

export const dynamicParams = false;

export function generateStaticParams() {
  return EXERCISE_LIST.map((exercise) => ({ id: exercise.id }));
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = EXERCISES[id];
  if (!exercise) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/exercises" className="text-sm text-white/50 transition hover:text-white">
          ← Guides
        </Link>
      </header>
      <h1 className="mt-4 mb-4 text-2xl font-semibold text-white">{exercise.name}</h1>
      <ExerciseGuide exercise={exercise} />
    </main>
  );
}
