import Link from "next/link";
import { notFound } from "next/navigation";

import { RoutineEditor } from "@/components/RoutineEditor";
import { getRoutine } from "@/lib/notion";

export const dynamic = "force-dynamic";

export default async function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let routine;
  try {
    routine = await getRoutine(id);
  } catch (error) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <h1 className="font-semibold text-red-300">Couldn&apos;t load this routine</h1>
          <p className="mt-2 text-sm text-white/60">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <Link href="/routines" className="mt-4 inline-block text-sm text-white/70 underline">
            Back to routines
          </Link>
        </div>
      </main>
    );
  }

  if (!routine) notFound();

  return <RoutineEditor routine={routine} />;
}
