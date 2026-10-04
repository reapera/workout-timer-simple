import { describe, expect, it } from "vitest";

import { buildCalendar, escapeText, foldLine } from "./calendar";
import type { Programme } from "./types";

type CalendarProgramme = Parameters<typeof buildCalendar>[0];

const PROGRAMME: CalendarProgramme = {
  id: "1a2b3c4d-0000-4000-8000-000000000001",
  startDate: "2026-09-30", // a Wednesday
  trainingDays: ["Mon", "Wed", "Fri"],
  backCareDays: ["Tue", "Thu", "Sat"],
  reminderTime: "07:30",
  deloadUntil: null,
  lastReview: 0,
};

const build = (overrides: Partial<Pick<Programme, keyof CalendarProgramme>> = {}, today = "2026-10-04") =>
  buildCalendar(
    { ...PROGRAMME, ...overrides },
    { appUrl: "https://workout.example", today, now: new Date("2026-10-04T01:02:03.456Z") },
  );

/** Unfolds and splits into events, for easy assertions. */
function events(ics: string): string[][] {
  const lines = ics.replace(/\r\n /g, "").split("\r\n");
  const result: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      result.push(current);
      current = null;
    } else if (current) current.push(line);
  }
  return result;
}

describe("buildCalendar", () => {
  it("is a valid feed with CRLF line endings", () => {
    const ics = build();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("repeats strength and back care weekly at the reminder time, with an alert", () => {
    const [strength, backCare] = events(build());
    expect(strength).toEqual(
      expect.arrayContaining([
        "UID:strength-1a2b3c4d000040008000000000000001@workout-timer",
        "DTSTAMP:20261004T010203Z",
        "DTSTART:20260930T073000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
        "SUMMARY:Strength workout",
        "TRIGGER:PT0S",
      ]),
    );
    // The first back care day on or after the start: Thursday 1 October.
    expect(backCare).toEqual(
      expect.arrayContaining(["DTSTART:20261001T073000", "DURATION:PT15M", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH,SA"]),
    );
  });

  it("falls back to 18:00 when no time is set", () => {
    expect(events(build({ reminderTime: null }))[0]).toContain("DTSTART:20260930T180000");
  });

  it("marks a lighter week and the next review as all-day events", () => {
    const all = events(build({ deloadUntil: "2026-10-10" }));
    const deload = all.find((event) => event.includes("SUMMARY:Lighter week"));
    expect(deload).toEqual(expect.arrayContaining(["DTSTART;VALUE=DATE:20261004", "DTEND;VALUE=DATE:20261011"]));
    expect(deload?.some((line) => line.startsWith("BEGIN:VALARM"))).toBe(false);

    const review = all.find((event) => event.includes("SUMMARY:4-week review ready"));
    expect(review).toEqual(expect.arrayContaining(["DTSTART;VALUE=DATE:20261028", "URL:https://workout.example/review"]));
  });

  it("drops a lighter week once it's over", () => {
    expect(build({ deloadUntil: "2026-10-03" })).not.toContain("Lighter week");
  });

  it("leaves out an empty day list", () => {
    const all = events(build({ backCareDays: [] }));
    expect(all.some((event) => event.includes("SUMMARY:Back care (10 min)"))).toBe(false);
  });
});

describe("text helpers", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines without splitting characters", () => {
    const line = `DESCRIPTION:${"é".repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
