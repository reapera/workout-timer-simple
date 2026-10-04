import type { StripDay } from "@/lib/training/schedule";

const PLAN_COLOR = {
  strength: "var(--color-work)",
  backcare: "var(--color-rest)",
  rest: "var(--color-line)",
} as const;

/** Monday to Sunday at a glance: what each day is for and whether it happened. */
export function WeekStrip({ strip }: { strip: StripDay[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {strip.map((day) => {
        const color = PLAN_COLOR[day.plan];
        const label =
          day.plan === "strength" ? (day.workout ?? "A") : day.plan === "backcare" ? "BC" : "–";
        const description = `${day.day}: ${
          day.plan === "strength" ? `Workout ${label}` : day.plan === "backcare" ? "back care" : "rest"
        }, ${day.status}`;

        return (
          <li key={day.date} className="flex flex-col items-center gap-1.5" aria-label={description}>
            <span className={`text-[11px] ${day.status === "today" ? "text-white" : "text-white/40"}`}>
              {day.day.slice(0, 2)}
            </span>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold"
              style={
                day.status === "done"
                  ? { background: color, borderColor: color, color: "var(--color-ink)" }
                  : day.status === "today"
                    ? { borderColor: color, color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }
                    : day.status === "missed"
                      ? { borderColor: "rgb(248 113 113 / 0.6)", color: "rgb(248 113 113 / 0.85)", borderStyle: "dashed" }
                      : day.status === "rest"
                        ? { borderColor: "transparent", color: "rgb(255 255 255 / 0.25)" }
                        : { borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color: "rgb(255 255 255 / 0.55)" }
              }
            >
              {day.status === "done" ? "✓" : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
