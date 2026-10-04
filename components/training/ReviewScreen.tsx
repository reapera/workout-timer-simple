"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveReview } from "@/lib/training/client";
import { trimNumber } from "@/lib/training/equipment";
import { getExercise } from "@/lib/training/exercises";
import { shortDate } from "@/lib/training/format";
import { BLOCK_WEEKS, buildReview, nextReviewDate, reviewDue, type LiftReview, type Review } from "@/lib/training/review";
import { daysBetween } from "@/lib/training/schedule";
import type { History, TrainingData } from "@/lib/training/types";

import { ExerciseThumb } from "./ExerciseImages";
import { Card, ProblemCard, Spinner, StatTile, SubPage } from "./PageStates";
import { useTrainingHistory } from "./useTrainingHistory";

const LIGHTER_WEEK_ID = "deload";

export function ReviewScreen() {
  const { today, data, history, stale, problem, reload } = useTrainingHistory();

  return (
    <SubPage title="4-week review">
      {problem ? (
        <ProblemCard problem={problem} onRetry={() => void reload()} />
      ) : !history || !data || !today ? (
        <Spinner />
      ) : (
        <Content data={data} history={history} today={today} stale={stale} />
      )}
    </SubPage>
  );
}

function Content({ data, history, today, stale }: { data: TrainingData; history: History; today: string; stale: boolean }) {
  const block = reviewDue(data.programme, today);

  if (block === null) {
    const next = nextReviewDate(data.programme, today);
    return (
      <div className="mt-10 rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="text-xl font-semibold text-white">No review due</h2>
        <p className="mt-2 text-sm text-white/60">
          Every {BLOCK_WEEKS} weeks the plan looks back at your workouts and suggests changes. The next one
          is ready on {shortDate(next)}, in {daysBetween(today, next)} days.
        </p>
        <Link href="/progress" className="mt-4 inline-block text-sm font-semibold text-[var(--color-work)]">
          See your progress →
        </Link>
      </div>
    );
  }

  return <ReviewForm review={buildReview(data, history, block, today)} data={data} today={today} stale={stale} />;
}

function ReviewForm({ review, data, today, stale }: { review: Review; data: TrainingData; today: string; stale: boolean }) {
  const router = useRouter();
  const { programme } = data;
  const suggested = review.suggestions.some((suggestion) => suggestion.kind === "deload");
  const recentDeload = programme.deloadUntil !== null && daysBetween(programme.deloadUntil, today) < BLOCK_WEEKS * 7;
  // Every suggestion starts ticked: following the plan should take one tap.
  const [chosen, setChosen] = useState(() => new Set(review.suggestions.map((suggestion) => suggestion.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    const schedule = review.suggestions.find((suggestion) => suggestion.kind === "schedule");
    try {
      await saveReview({
        block: review.block,
        today,
        deload: chosen.has(LIGHTER_WEEK_ID),
        swaps: review.suggestions.flatMap((suggestion) =>
          suggestion.kind === "swap" && chosen.has(suggestion.id) ? [{ slotId: suggestion.slotId, to: suggestion.to }] : [],
        ),
        schedule:
          schedule?.kind === "schedule" && chosen.has(schedule.id)
            ? { trainingDays: schedule.trainingDays, backCareDays: schedule.backCareDays }
            : undefined,
      });
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the review.");
      setSaving(false);
    }
  };

  const changes = chosen.size;
  const firstWeek = (review.block - 1) * BLOCK_WEEKS + 1;

  return (
    <div className="mt-4 space-y-5 pb-4">
      {stale && (
        <p className="rounded-xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 px-4 py-2 text-xs text-[var(--color-prep)]">
          Offline — this uses your last synced history. Saving needs a connection.
        </p>
      )}

      <section>
        <p className="text-sm text-white/45">
          Weeks {firstWeek}–{firstWeek + BLOCK_WEEKS - 1} · {shortDate(review.from)} – {shortDate(review.to)}
        </p>
        <h2 className="mt-1 text-xl leading-snug font-semibold text-white">{review.headline}</h2>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Workouts done">
        <StatTile label="Strength workouts" value={`${review.strength.done} of ${review.strength.planned}`} />
        <StatTile label="Back care" value={`${review.backCare.done} of ${review.backCare.planned}`} />
      </section>

      <Card title="Your lifts">
        <ul className="-mx-1 divide-y divide-[var(--color-grid)]">
          {review.lifts.map((lift) => (
            <LiftLine key={lift.slotId} lift={lift} />
          ))}
        </ul>
      </Card>

      <Card title="Suggested changes">
        {review.suggestions.length === 0 && (
          <p className="mb-3 text-sm text-white/60">Nothing needs changing. Keep doing what you&apos;re doing.</p>
        )}
        <ul className="space-y-2">
          {review.suggestions.map((suggestion) => (
            <Choice
              key={suggestion.id}
              title={suggestion.title}
              detail={suggestion.detail}
              checked={chosen.has(suggestion.id)}
              onToggle={() => toggle(suggestion.id)}
            />
          ))}
          {!suggested && !recentDeload && (
            <Choice
              title="Take a lighter week anyway"
              detail="Not needed on the numbers, but worth it if you feel run down or your back is grumbling: 7 days of one set fewer and a little lighter."
              checked={chosen.has(LIGHTER_WEEK_ID)}
              onToggle={() => toggle(LIGHTER_WEEK_ID)}
            />
          )}
        </ul>
      </Card>

      {error && <p className="text-sm text-[var(--color-prep)]">{error}</p>}

      <button
        onClick={() => void save()}
        disabled={saving}
        className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
      >
        {saving ? "Saving…" : changes ? `Apply ${changes} change${changes === 1 ? "" : "s"}` : "Done — keep my plan as is"}
      </button>
      <p className="text-center text-xs text-white/35">Nothing changes until you tap the button.</p>
    </div>
  );
}

function LiftLine({ lift }: { lift: LiftReview }) {
  const exercise = getExercise(lift.exerciseId);
  const kg = (weight: number) => (weight > 0 ? `${trimNumber(weight)} kg` : "Bodyweight");
  const weights =
    lift.startWeight !== null && lift.endWeight !== null
      ? lift.startWeight === lift.endWeight
        ? kg(lift.endWeight)
        : lift.startWeight > 0
          ? `${trimNumber(lift.startWeight)} → ${kg(lift.endWeight)}`
          : `${kg(lift.startWeight)} → ${kg(lift.endWeight)}`
      : null;
  const moves = [
    lift.ups ? `${lift.ups}× up` : null,
    lift.downs ? `${lift.downs}× down` : null,
    lift.pains ? `back pain ${lift.pains}×` : null,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <ExerciseThumb images={exercise.images} />
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-medium text-white">{exercise.name}</span>
        <span className="block truncate text-xs text-white/50">
          {lift.sessions ? `${lift.sessions} session${lift.sessions === 1 ? "" : "s"}` : "Not done this block"}
          {moves.length > 0 && ` · ${moves.join(", ")}`}
        </span>
      </span>
      {weights && <span className="tnum shrink-0 text-sm font-semibold text-white">{weights}</span>}
    </li>
  );
}

function Choice({
  title,
  detail,
  checked,
  onToggle,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label
        className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition ${
          checked ? "border-[var(--color-work)]/50 bg-[var(--color-work)]/5" : "border-[var(--color-line)]"
        }`}
      >
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-work)]" />
        <span>
          <span className="block font-medium text-white">{title}</span>
          <span className="mt-0.5 block text-sm text-white/55">{detail}</span>
        </span>
      </label>
    </li>
  );
}
