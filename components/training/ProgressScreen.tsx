"use client";

import Link from "next/link";
import { useState } from "react";

import { logBodyWeight } from "@/lib/training/client";
import { getExercise } from "@/lib/training/exercises";
import { formatValues, shortDate } from "@/lib/training/format";
import {
  consistencyGrid,
  exerciseSeries,
  metricFor,
  metricValue,
  personalBest,
  summarize,
  weeklyVolume,
  type CalendarCell,
  type MetricKind,
} from "@/lib/training/progress";
import { reviewDue } from "@/lib/training/review";
import { addDays, daysBetween, weekStart } from "@/lib/training/schedule";
import type { History, Slot, TrainingData } from "@/lib/training/types";

import { ColumnChart, LineChart, Sparkline } from "./Charts";
import { ExerciseThumb } from "./ExerciseImages";
import { Card, ProblemCard, Spinner, StatTile, SubPage } from "./PageStates";
import { useTrainingHistory } from "./useTrainingHistory";

const UNIT: Record<MetricKind, string> = { weight: "kg", reps: "reps", seconds: "s" };
const trim = (value: number) => String(Math.round(value * 100) / 100);

export function ProgressScreen() {
  const { today, data, history, stale, problem, reload } = useTrainingHistory();

  return (
    <SubPage title="Progress">
      {problem ? (
        <ProblemCard problem={problem} onRetry={() => void reload()} />
      ) : !history || !data || !today ? (
        <Spinner />
      ) : (
        <Content data={data} history={history} today={today} stale={stale} onChange={reload} />
      )}
    </SubPage>
  );
}

function Content({
  data,
  history,
  today,
  stale,
  onChange,
}: {
  data: TrainingData;
  history: History;
  today: string;
  stale: boolean;
  onChange: () => Promise<void>;
}) {
  const { programme } = data;
  const summary = summarize(programme, history.lifts, today);
  const due = reviewDue(programme, today);
  // Weeks before the plan started would only be empty rows and zero columns.
  const shownWeeks = Math.max(1, Math.min(8, Math.floor(daysBetween(weekStart(programme.startDate), weekStart(today)) / 7) + 1));
  const weeks = weeklyVolume(history.lifts, today, shownWeeks);
  const slots = [...data.slots].sort((a, b) =>
    a.workout === b.workout ? a.order - b.order : a.workout < b.workout ? -1 : 1,
  );

  return (
    <div className="mt-4 space-y-6">
      {stale && (
        <p className="rounded-xl border border-[var(--color-prep)]/30 bg-[var(--color-prep)]/10 px-4 py-2 text-xs text-[var(--color-prep)]">
          Offline — showing your last synced history.
        </p>
      )}

      {due && (
        <Link
          href="/review"
          className="flex items-center justify-between rounded-2xl border border-[var(--color-work)]/40 bg-[var(--color-work)]/10 px-4 py-3"
        >
          <span className="text-sm font-semibold text-[var(--color-work)]">Your 4-week review is ready</span>
          <span className="text-sm text-[var(--color-work)]">Open →</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3" aria-label="Summary">
        <StatTile label="Workouts done" value={String(summary.workouts)} />
        <StatTile label="Last 4 weeks" value={`${summary.last28.done} of ${summary.last28.planned}`} />
        <StatTile label="Weeks on track" value={String(summary.weeksInARow)} />
        <StatTile label="Lifted in total" value={`${summary.totalKg.toLocaleString()} kg`} />
      </section>

      <Card title={shownWeeks === 1 ? "This week" : shownWeeks < 8 ? "Since you started" : "Last 8 weeks"}>
        <Calendar grid={consistencyGrid(programme, history.lifts, history.backCare, today, shownWeeks)} today={today} />
      </Card>

      <Card title="Your lifts">
        {history.lifts.length === 0 ? (
          <p className="text-sm text-white/50">Your charts start after your first workout.</p>
        ) : (
          <ul className="-mx-1 divide-y divide-[var(--color-grid)]">
            {slots.map((slot) => (
              <LiftRow key={slot.id} slot={slot} history={history} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Weight lifted per week">
        {weeks.length < 2 ? (
          <p className="text-sm text-white/60">
            This week: <span className="font-semibold text-white">{(weeks[0]?.kg ?? 0).toLocaleString()} kg</span>. The
            week-by-week chart starts next week.
          </p>
        ) : (
          <ColumnChart
            label="Weight lifted"
            unit="kg"
            color="var(--color-chart-1)"
            columns={weeks.map((week) => ({
              key: week.week,
              label: shortDate(week.week),
              value: week.kg,
              detail: `${week.sessions} workout${week.sessions === 1 ? "" : "s"}`,
            }))}
          />
        )}
        <p className="mt-1 text-xs text-white/40">Weight × reps, both dumbbells counted. Holds and bodyweight moves aren&apos;t included.</p>
      </Card>

      {history.weightLog && <BodyWeight history={history} today={today} onLogged={onChange} />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Consistency calendar
 * ------------------------------------------------------------------ */

const CELL = {
  strength: { fill: "var(--color-chart-1)", label: "Strength workout" },
  backcare: { fill: "var(--color-chart-2)", label: "Back care" },
} as const;

function Calendar({ grid, today }: { grid: CalendarCell[][]; today: string }) {
  const describe = (cell: CalendarCell) => {
    const when = shortDate(cell.date);
    if (cell.did) return `${when}: ${CELL[cell.did].label} done`;
    if (cell.future) return `${when}: ${cell.plan === "rest" ? "rest" : `${cell.plan === "strength" ? "strength" : "back care"} planned`}`;
    return `${when}: ${cell.plan === "rest" ? "rest day" : `${cell.plan === "strength" ? "strength" : "back care"} missed`}`;
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-white/40" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5" role="list" aria-label="Your weeks, Monday to Sunday">
        {grid.flat().map((cell) => (
          <span
            key={cell.date}
            role="listitem"
            title={describe(cell)}
            aria-label={describe(cell)}
            className="aspect-square rounded-md"
            style={
              cell.did
                ? { background: CELL[cell.did].fill, outline: cell.date === today ? "2px solid rgb(255 255 255 / 0.8)" : undefined, outlineOffset: 1 }
                : cell.plan !== "rest" && !cell.future
                  ? { border: "1px solid rgb(255 255 255 / 0.22)" }
                  : cell.plan !== "rest"
                    ? { border: "1px dashed rgb(255 255 255 / 0.12)" }
                    : { background: "var(--color-grid)", opacity: 0.6 }
            }
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
        <Legend swatch={{ background: "var(--color-chart-1)" }} label="Strength" />
        <Legend swatch={{ background: "var(--color-chart-2)" }} label="Back care" />
        <Legend swatch={{ border: "1px solid rgb(255 255 255 / 0.22)" }} label="Planned, not done" />
      </ul>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.CSSProperties; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm" style={swatch} aria-hidden="true" />
      {label}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * One lift: glance row that opens into a chart
 * ------------------------------------------------------------------ */

function LiftRow({ slot, history }: { slot: Slot; history: History }) {
  const [open, setOpen] = useState(false);
  const exercise = getExercise(slot.exerciseId);
  const series = exerciseSeries(history.lifts, slot.exerciseId);
  const kind = metricFor(slot.exerciseId, series);
  const best = personalBest(slot.exerciseId, series);
  const values = series.map((point) => metricValue(kind, point));
  const first = values[0];
  const latest = values[values.length - 1];
  const change = values.length > 1 ? latest - first : 0;

  const bestText = !best
    ? "Not done yet"
    : kind === "weight"
      ? `Best ${trim(best.weight)} kg × ${best.value}`
      : `Best ${best.value} ${UNIT[kind]}`;

  return (
    <li className="px-1">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        disabled={!series.length}
        className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-60"
      >
        <ExerciseThumb images={exercise.images} />
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-medium text-white">{exercise.name}</span>
          <span className="block truncate text-xs text-white/50">
            {bestText}
            {change > 0 && ` · +${trim(change)} ${UNIT[kind]}`}
          </span>
        </span>
        <Sparkline values={values} color="var(--color-chart-1)" />
      </button>
      {open && series.length > 0 && (
        <div className="pb-3">
          <LineChart
            label={`${exercise.name} — ${kind === "weight" ? "working weight" : kind === "seconds" ? "longest hold" : "best set"}`}
            unit={UNIT[kind]}
            color="var(--color-chart-1)"
            points={series.map((point) => ({
              date: point.date,
              value: metricValue(kind, point),
              detail:
                kind === "weight"
                  ? `${formatValues(exercise.kind, point.values)} reps`
                  : formatValues(exercise.kind, point.values),
            }))}
          />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Body weight, from (and into) the Weight Log
 * ------------------------------------------------------------------ */

function BodyWeight({ history, today, onLogged }: { history: History; today: string; onLogged: () => Promise<void> }) {
  const [kg, setKg] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const since = addDays(today, -180);
  const entries = history.bodyWeight.filter((entry) => entry.date >= since);
  const shown = entries.length >= 2 ? entries : history.bodyWeight.slice(-12);
  const latest = history.bodyWeight[history.bodyWeight.length - 1];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const value = Number(kg.replace(",", "."));
    if (!(value > 0)) return setMessage("Enter your weight in kg.");
    setSaving(true);
    try {
      await logBodyWeight({ date: today, kg: value, bodyFat: fat ? Number(fat.replace(",", ".")) : null });
      setKg("");
      setFat("");
      setMessage("Saved to your Weight Log.");
      await onLogged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Body weight">
      {latest ? (
        <p className="mb-2 text-sm text-white/60">
          Latest <span className="font-semibold text-white">{trim(latest.kg)} kg</span> on {shortDate(latest.date)}
          {latest.bodyFat !== null ? ` · ${trim(latest.bodyFat)}% body fat` : ""}
        </p>
      ) : (
        <p className="mb-2 text-sm text-white/50">No entries in your Weight Log yet.</p>
      )}
      {shown.length >= 2 && (
        <LineChart
          label="Body weight"
          unit="kg"
          color="var(--color-chart-2)"
          points={shown.map((entry) => ({
            date: entry.date,
            value: entry.kg,
            detail: entry.bodyFat !== null ? `${trim(entry.bodyFat)}% body fat` : undefined,
          }))}
        />
      )}
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs text-white/50">
          Today (kg)
          <input
            value={kg}
            onChange={(event) => setKg(event.target.value)}
            inputMode="decimal"
            placeholder={latest ? trim(latest.kg) : "80.0"}
            className="mt-1 block w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-base text-white outline-none focus:border-[var(--color-chart-2)]"
          />
        </label>
        <label className="w-28 text-xs text-white/50">
          Body fat % <span className="text-white/30">(optional)</span>
          <input
            value={fat}
            onChange={(event) => setFat(event.target.value)}
            inputMode="decimal"
            className="mt-1 block w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-base text-white outline-none focus:border-[var(--color-chart-2)]"
          />
        </label>
        <button
          disabled={saving}
          className="rounded-xl bg-[var(--color-rest)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-white/55">{message}</p>}
    </Card>
  );
}
