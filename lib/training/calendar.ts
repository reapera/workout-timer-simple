import { nextReviewDate } from "./review";
import { addDays, dayOf, DEFAULT_REMINDER_TIME, DELOAD_DAYS } from "./schedule";
import type { DayName, Programme } from "./types";

/**
 * The plan as an iCalendar feed, for phone calendar reminders. Calendar apps
 * re-fetch a subscribed feed every few hours, so schedule changes made in the
 * app (or by a review) reach the calendar without doing anything.
 *
 * Times are "floating" (no time zone): 18:00 means 18:00 wherever the phone is.
 */

const BYDAY: Record<DayName, string> = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU" };

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to 75 octets per line, never splitting a character (§3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts towards their 75.
    const limit = parts.length ? 74 : 75;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

/** First date on or after `from` that falls on one of `days`. */
function firstOn(from: string, days: DayName[]): string {
  let date = from;
  for (let step = 0; step < 7 && !days.includes(dayOf(date)); step += 1) date = addDays(date, 1);
  return date;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

type Event = {
  uid: string;
  summary: string;
  description: string;
  url: string;
  /** Either a timed, weekly-repeating event or an all-day one. */
  when:
    | { kind: "weekly"; start: string; time: string; minutes: number; days: DayName[] }
    | { kind: "allDay"; start: string; days: number };
  alarm: boolean;
};

function eventLines(event: Event, dtstamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${dtstamp}`];
  if (event.when.kind === "weekly") {
    const { start, time, minutes, days } = event.when;
    lines.push(
      `DTSTART:${compactDate(start)}T${time.replace(":", "")}00`,
      `DURATION:PT${minutes}M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => BYDAY[day]).join(",")}`,
    );
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate(event.when.start)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.when.start, event.when.days))}`,
      "TRANSP:TRANSPARENT",
    );
  }
  lines.push(`SUMMARY:${escapeText(event.summary)}`, `DESCRIPTION:${escapeText(event.description)}`, `URL:${event.url}`);
  if (event.alarm) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.summary)}`, "TRIGGER:PT0S", "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(
  programme: Pick<Programme, "id" | "startDate" | "trainingDays" | "backCareDays" | "reminderTime" | "deloadUntil" | "lastReview">,
  options: { appUrl: string; today: string; now?: Date; strengthMinutes?: number },
): string {
  const time = programme.reminderTime ?? DEFAULT_REMINDER_TIME;
  const id = programme.id.replace(/-/g, "");
  const events: Event[] = [];

  if (programme.trainingDays.length) {
    events.push({
      uid: `strength-${id}@workout-timer`,
      summary: "Strength workout",
      description: `Open the app to see today's workout and your weights: ${options.appUrl}`,
      url: options.appUrl,
      when: {
        kind: "weekly",
        start: firstOn(programme.startDate, programme.trainingDays),
        time,
        minutes: options.strengthMinutes ?? 45,
        days: programme.trainingDays,
      },
      alarm: true,
    });
  }

  if (programme.backCareDays.length) {
    events.push({
      uid: `backcare-${id}@workout-timer`,
      summary: "Back care (10 min)",
      description: `Gentle core and mobility moves, guided by voice: ${options.appUrl}`,
      url: options.appUrl,
      when: { kind: "weekly", start: firstOn(programme.startDate, programme.backCareDays), time, minutes: 15, days: programme.backCareDays },
      alarm: true,
    });
  }

  if (programme.deloadUntil && programme.deloadUntil >= options.today) {
    events.push({
      uid: `deload-${compactDate(programme.deloadUntil)}-${id}@workout-timer`,
      summary: "Lighter week",
      description: "One set fewer and about 10% lighter on every lift. Back to normal targets afterwards.",
      url: options.appUrl,
      when: { kind: "allDay", start: addDays(programme.deloadUntil, -(DELOAD_DAYS - 1)), days: DELOAD_DAYS },
      alarm: false,
    });
  }

  const review = nextReviewDate(programme, options.today);
  events.push({
    uid: `review-${compactDate(review)}-${id}@workout-timer`,
    summary: "4-week review ready",
    description: `See how the last four weeks went and choose what changes: ${options.appUrl}/review`,
    url: `${options.appUrl}/review`,
    when: { kind: "allDay", start: review, days: 1 },
    alarm: false,
  });

  const dtstamp = stamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//workout-timer//Home dumbbell plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Dumbbell plan",
    "X-WR-CALDESC:Training days from your workout app",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...events.flatMap((event) => eventLines(event, dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
