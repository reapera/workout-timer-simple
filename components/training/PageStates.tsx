import Link from "next/link";

import type { LoadProblem } from "./useTrainingHistory";

/** Shared frame for the secondary training pages: back link, title, content. */
export function SubPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-white/50 transition hover:text-white">
          ← Today
        </Link>
        <h1 className="font-semibold text-white">{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
    </div>
  );
}

export function ProblemCard({ problem, onRetry }: { problem: LoadProblem; onRetry: () => void }) {
  if (problem.kind === "setup") {
    return (
      <p className="mt-10 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-sm text-white/60">
        This fills in once you have a plan.{" "}
        <Link href="/setup" className="font-semibold text-[var(--color-work)]">
          Set up my plan →
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-10 rounded-2xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/5 p-5">
      <h2 className="font-semibold text-[var(--color-prep)]">Couldn&apos;t load your history</h2>
      <p className="mt-2 text-sm text-white/60">{problem.failure.message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm text-white/75 hover:bg-white/5"
      >
        Try again
      </button>
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-3 text-xs tracking-[0.15em] text-white/45 uppercase">{title}</h2>
      {children}
    </section>
  );
}
