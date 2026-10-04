"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cachedTraining, createPlan, fetchTraining, savePlan } from "@/lib/training/client";
import { DEFAULT_EQUIPMENT, loadings, trimNumber } from "@/lib/training/equipment";
import { DEFAULT_BACK_CARE_DAYS, DEFAULT_REMINDER_TIME, DEFAULT_TRAINING_DAYS, localDate } from "@/lib/training/schedule";
import { DAYS, type DayName, type Equipment } from "@/lib/training/types";
import type { ProgrammeInput } from "@/lib/training/validate";

const DEFAULTS = (): ProgrammeInput => ({
  startDate: localDate(),
  trainingDays: DEFAULT_TRAINING_DAYS,
  backCareDays: DEFAULT_BACK_CARE_DAYS,
  equipment: DEFAULT_EQUIPMENT,
  level: "beginner",
  backPain: true,
  reminderTime: DEFAULT_REMINDER_TIME,
});

/** First-time setup and, once a plan exists, its settings. */
export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState<ProgrammeInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fromPlan = (plan: NonNullable<ReturnType<typeof cachedTraining>>["programme"]): ProgrammeInput => ({
      startDate: plan.startDate,
      trainingDays: plan.trainingDays,
      backCareDays: plan.backCareDays,
      equipment: plan.equipment,
      level: plan.level,
      backPain: plan.backPain,
      reminderTime: plan.reminderTime ?? DEFAULT_REMINDER_TIME,
    });

    const cached = cachedTraining();
    if (cached) {
      setForm(fromPlan(cached.programme));
      setEditing(true);
    }
    (async () => {
      const result = await fetchTraining();
      if (cancelled) return;
      if (result.kind === "ready" && !result.stale) {
        setForm(fromPlan(result.data.programme));
        setEditing(true);
      } else if (result.kind === "setup") {
        setForm(DEFAULTS());
        setEditing(false);
      } else if (!cached) {
        setForm(DEFAULTS());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!form) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-work)]" />
      </div>
    );
  }

  const set = (change: Partial<ProgrammeInput>) => setForm((current) => (current ? { ...current, ...change } : current));
  const setEquipment = (change: Partial<Equipment>) => set({ equipment: { ...form.equipment, ...change } });

  const toggleDay = (list: "trainingDays" | "backCareDays", day: DayName) => {
    const other = list === "trainingDays" ? "backCareDays" : "trainingDays";
    const selected = form[list].includes(day);
    set({
      [list]: selected ? form[list].filter((d) => d !== day) : DAYS.filter((d) => d === day || form[list].includes(d)),
      [other]: form[other].filter((d) => d !== day),
    } as Partial<ProgrammeInput>);
  };

  const submit = async () => {
    setError(null);
    if (!form.trainingDays.length) return setError("Pick at least one training day.");
    if (!form.equipment.plates.length) return setError("Add the plates you own.");
    setSaving(true);
    try {
      await (editing ? savePlan(form) : createPlan(form));
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-white/50 transition hover:text-white">
          ← Today
        </Link>
        <h1 className="font-semibold text-white">{editing ? "Plan settings" : "Set up your plan"}</h1>
      </header>

      {!editing && (
        <p className="mt-5 text-sm text-white/60">
          A home dumbbell plan for a beginner with a careful lower back: two full-body workouts
          (A and B) alternating on your training days, short back care sessions in between, and
          weights that go up as you get stronger.
        </p>
      )}

      <Section title="Your week">
        <DayPicker
          label="Strength days"
          hint="Workouts A and B alternate — 3 days with a rest day between is ideal."
          color="var(--color-work)"
          selected={form.trainingDays}
          onToggle={(day) => toggleDay("trainingDays", day)}
        />
        <DayPicker
          label="Back care days"
          hint="8 gentle minutes of core and mobility work."
          color="var(--color-rest)"
          selected={form.backCareDays}
          onToggle={(day) => toggleDay("backCareDays", day)}
        />
        {!editing && (
          <label className="mt-4 block text-sm text-white/60">
            Start date
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => event.target.value && set({ startDate: event.target.value })}
              className="mt-1 block w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-white [color-scheme:dark]"
            />
          </label>
        )}
      </Section>

      <Section title="Your dumbbells">
        <Row label="Handles" hint="Adjustable dumbbell handles you own">
          <Segmented
            value={String(form.equipment.handles)}
            options={[
              { value: "1", label: "1" },
              { value: "2", label: "2" },
            ]}
            onChange={(value) => setEquipment({ handles: value === "1" ? 1 : 2 })}
          />
        </Row>
        <Row label="Empty handle" hint="With collars — weigh one on a bathroom scale">
          <NumberStepper
            value={form.equipment.handleWeight}
            step={0.1}
            min={0}
            max={30}
            suffix="kg"
            onChange={(handleWeight) => setEquipment({ handleWeight })}
          />
        </Row>
        <Row label="Plates per end" hint="How many fit on each end of one handle">
          <NumberStepper
            value={form.equipment.platesPerSide}
            step={1}
            min={1}
            max={8}
            onChange={(platesPerSide) => setEquipment({ platesPerSide })}
          />
        </Row>

        <p className="mt-5 text-sm font-medium text-white/80">Plates you own</p>
        <p className="text-xs text-white/40">Count every plate of each size, across all handles.</p>
        <PlateEditor plates={form.equipment.plates} onChange={(plates) => setEquipment({ plates })} />
        <WeightPreview equipment={form.equipment} />
      </Section>

      <Section title="Bench">
        <Segmented
          value={form.equipment.bench ? "yes" : "no"}
          options={[
            { value: "no", label: "No bench — floor & mat" },
            { value: "yes", label: "Flat bench" },
          ]}
          onChange={(value) => setEquipment({ bench: value === "yes" })}
        />
        <p className="mt-2 text-xs text-white/40">
          Without a bench you press on the floor, which is also the most back-friendly option.
        </p>
      </Section>

      <Section title="About you">
        <Row label="Experience">
          <Segmented
            value={form.level}
            options={[
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Some" },
            ]}
            onChange={(value) => set({ level: value === "intermediate" ? "intermediate" : "beginner" })}
          />
        </Row>
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[var(--color-rest)]/30 bg-[var(--color-rest)]/5 p-3">
          <input
            type="checkbox"
            checked={form.backPain}
            onChange={(event) => set({ backPain: event.target.checked })}
            className="mt-1 h-5 w-5 accent-[var(--color-rest)]"
          />
          <span>
            <span className="block text-sm font-medium text-white">Lower back care</span>
            <span className="block text-xs text-white/50">
              Asks about your back after each exercise. Discomfort holds the weight, pain lowers it.
            </span>
          </span>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-white/35">
          If your back pain spreads down a leg, comes with numbness or weakness, or follows an injury,
          get it checked by a doctor or physiotherapist before starting.
        </p>
      </Section>

      <Section title="Reminders">
        <Row label="Remind me at" hint="On training and back care days">
          <input
            type="time"
            value={form.reminderTime ?? DEFAULT_REMINDER_TIME}
            onChange={(event) => event.target.value && set({ reminderTime: event.target.value })}
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-white [color-scheme:dark]"
          />
        </Row>
        {editing ? (
          <CalendarLinks />
        ) : (
          <p className="mt-3 text-xs text-white/40">
            Once your plan is created, you can add it to your phone&apos;s calendar from Plan settings.
          </p>
        )}
      </Section>

      {error && (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-auto pt-8">
        <button
          onClick={submit}
          disabled={saving}
          className="w-full rounded-2xl bg-[var(--color-work)] py-4 text-lg font-bold text-[var(--color-ink)] transition active:scale-95 disabled:opacity-50"
        >
          {saving ? (editing ? "Saving to Notion…" : "Creating your plan in Notion…") : editing ? "Save changes" : "Create my plan"}
        </button>
        {saving && !editing && (
          <p className="mt-2 text-center text-xs text-white/40">This takes a few seconds the first time.</p>
        )}
      </div>
    </main>
  );
}

/** Subscribe links for the calendar feed. The link itself is fetched, as only the server knows the token. */
function CalendarLinks() {
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ path: string }>) : Promise.reject()))
      .then((body) => !cancelled && setPath(body.path))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="mt-3 text-xs text-white/40">The calendar link needs a connection — try again online.</p>;
  if (!path) return null;

  const url = `${window.location.origin}${path}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <p className="text-sm font-medium text-white">Add your plan to your calendar</p>
      <p className="mt-1 text-xs text-white/50">
        Your training days appear in your phone&apos;s calendar with an alert at the time above. Change your
        days or time here and the calendar follows within a few hours.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={url.replace(/^https?:/, "webcal:")}
          className="rounded-xl bg-[var(--color-rest)] px-3 py-2.5 text-center text-sm font-semibold text-[var(--color-ink)]"
        >
          Subscribe
        </a>
        <button
          onClick={() => void copy()}
          className="rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm text-white/80 hover:bg-white/5"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-white/45">
        <li>
          <span className="text-white/70">iPhone:</span> tap Subscribe, then Subscribe again. Keep &ldquo;Remove
          alerts&rdquo; off.
        </li>
        <li>
          <span className="text-white/70">Google Calendar:</span> copy the link, then on calendar.google.com choose
          Other calendars → + → From URL. Google uses its own alerts for subscribed calendars: set one in that
          calendar&apos;s settings.
        </li>
        <li>
          <span className="text-white/70">No updates needed?</span>{" "}
          <a href={url} download="dumbbell-plan.ics" className="text-[var(--color-rest)] underline">
            Download the calendar file
          </a>{" "}
          and open it to import the repeating events once.
        </li>
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-xs tracking-[0.15em] text-white/40 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {hint && <p className="text-xs text-white/40">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function DayPicker({
  label,
  hint,
  color,
  selected,
  onToggle,
}: {
  label: string;
  hint: string;
  color: string;
  selected: DayName[];
  onToggle: (day: DayName) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm text-white/85">{label}</p>
      <p className="text-xs text-white/40">{hint}</p>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {DAYS.map((day) => {
          const on = selected.includes(day);
          return (
            <button
              key={day}
              onClick={() => onToggle(day)}
              aria-pressed={on}
              className="rounded-xl border py-2.5 text-xs font-medium transition active:scale-95"
              style={
                on
                  ? { borderColor: color, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }
                  : { borderColor: "var(--color-line)", color: "rgb(255 255 255 / 0.5)" }
              }
            >
              {day.slice(0, 2)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-xl border border-[var(--color-line)] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`flex-1 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
            value === option.value ? "bg-[var(--color-surface-2)] text-white" : "text-white/50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberStepper({
  value,
  step,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  return (
    <div className="flex items-center rounded-xl border border-[var(--color-line)]">
      <button onClick={() => onChange(clamp(value - step))} className="px-3 py-2 text-white/60" aria-label="Less">
        −
      </button>
      <span className="tnum min-w-14 text-center text-sm text-white">
        {trimNumber(value)}
        {suffix ? ` ${suffix}` : ""}
      </span>
      <button onClick={() => onChange(clamp(value + step))} className="px-3 py-2 text-white/60" aria-label="More">
        +
      </button>
    </div>
  );
}

function PlateEditor({
  plates,
  onChange,
}: {
  plates: Equipment["plates"];
  onChange: (plates: Equipment["plates"]) => void;
}) {
  const [newSize, setNewSize] = useState("");
  const sorted = [...plates].sort((a, b) => a.size - b.size);

  const setCount = (size: number, count: number) =>
    onChange(sorted.map((plate) => (plate.size === size ? { ...plate, count: Math.max(0, Math.min(40, count)) } : plate)));

  const add = () => {
    const size = Math.round(Number(newSize.replace(",", ".")) * 1000) / 1000;
    if (!(size > 0 && size <= 50) || sorted.some((plate) => plate.size === size)) return;
    onChange([...sorted, { size, count: 2 }].sort((a, b) => a.size - b.size));
    setNewSize("");
  };

  return (
    <div className="mt-3 space-y-2">
      {sorted.map((plate) => (
        <div
          key={plate.size}
          className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
        >
          <span className="tnum text-sm text-white">{trimNumber(plate.size)} kg</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCount(plate.size, plate.count - 1)} className="px-2 text-white/60" aria-label={`One fewer ${plate.size} kg plate`}>
              −
            </button>
            <span className="tnum w-12 text-center text-sm text-white/80">× {plate.count}</span>
            <button onClick={() => setCount(plate.size, plate.count + 1)} className="px-2 text-white/60" aria-label={`One more ${plate.size} kg plate`}>
              +
            </button>
            <button
              onClick={() => onChange(sorted.filter((other) => other.size !== plate.size))}
              className="ml-1 text-xs text-red-400/70 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newSize}
          onChange={(event) => setNewSize(event.target.value)}
          inputMode="decimal"
          placeholder="Another plate size, e.g. 5"
          className="min-w-0 flex-1 rounded-xl border border-dashed border-[var(--color-line)] bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
        />
        <button onClick={add} className="rounded-xl border border-[var(--color-line)] px-4 text-sm text-white/70 hover:bg-white/5">
          Add
        </button>
      </div>
    </div>
  );
}

function WeightPreview({ equipment }: { equipment: Equipment }) {
  const pair = loadings(equipment, "pair").map((loading) => loading.weight);
  const single = loadings(equipment, "single").map((loading) => loading.weight);
  const list = (weights: number[]) =>
    weights.length > 9
      ? `${weights.slice(0, 6).map(trimNumber).join(", ")} … ${trimNumber(weights[weights.length - 1])} kg`
      : `${weights.map(trimNumber).join(", ")} kg`;

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-xs text-white/55">
      {equipment.handles > 1 && (
        <p>
          <span className="text-white/80">A matching pair:</span> {list(pair)}
        </p>
      )}
      <p className={equipment.handles > 1 ? "mt-1" : ""}>
        <span className="text-white/80">One dumbbell:</span> {list(single)}
      </p>
    </div>
  );
}
