import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createFakeNotion, IDS } from "../../test/fake-notion.mjs";
import { DEFAULT_EQUIPMENT } from "./equipment";
import type { SessionLog } from "./types";
import type { ProgrammeInput } from "./validate";

type Fake = ReturnType<typeof createFakeNotion>;
type TrainingModule = typeof import("./notion");

let fake: Fake;
let training: TrainingModule;

const input: ProgrammeInput = {
  startDate: "2026-09-28",
  trainingDays: ["Mon", "Wed", "Fri"],
  backCareDays: ["Tue", "Thu", "Sat"],
  equipment: DEFAULT_EQUIPMENT,
  level: "beginner",
  backPain: true,
};

/** An empty workspace again; the training module must look its databases up afresh. */
async function freshFake() {
  fake.reset();
  training.forgetDatabases();
}

beforeAll(async () => {
  fake = createFakeNotion();
  process.env.NOTION_API_BASE = await fake.listen();
  process.env.NOTION_TOKEN = "fake";
  process.env.NOTION_LOG_DB = IDS.workoutLog;
  // The module reads NOTION_API_BASE when it loads, so import after setting it.
  training = await import("./notion");
});

afterAll(async () => {
  await fake?.close();
});

const props = (page: { properties: Record<string, any> }, name: string) => {
  const property = page.properties[name];
  const value = property[property.type];
  if (property.type === "title" || property.type === "rich_text") {
    return value.map((part: { plain_text: string }) => part.plain_text).join("");
  }
  if (property.type === "select") return value?.name ?? null;
  return value;
};

async function load() {
  const result = await training.loadTraining();
  if (result.status !== "ready") throw new Error(`not ready: ${JSON.stringify(result)}`);
  return result.data;
}

function sessionFor(data: Awaited<ReturnType<typeof load>>, id: string): SessionLog {
  const a = data.slots.filter((slot) => slot.workout === "A");
  const byId = Object.fromEntries(a.map((slot) => [slot.exerciseId, slot]));
  return {
    id,
    workout: "A",
    date: "2026-09-28",
    startedAt: "2026-09-28T07:00:00.000Z",
    elapsedSeconds: 1900,
    exercises: [
      {
        slotId: byId["goblet-squat"].id,
        exerciseId: "goblet-squat",
        plannedSets: 2,
        sets: [{ weight: 6, value: 20 }, { weight: 6, value: 19 }],
        effort: "easy",
        back: "none",
      },
      {
        slotId: byId["floor-press"].id,
        exerciseId: "floor-press",
        plannedSets: 2,
        sets: [{ weight: 5, value: 12 }, { weight: 5, value: 11 }],
        effort: "good",
        back: "none",
      },
      {
        slotId: byId["glute-bridge"].id,
        exerciseId: "glute-bridge",
        plannedSets: 2,
        sets: [{ weight: 0, value: 20 }, { weight: 0, value: 20 }],
        effort: "good",
        back: "mild",
      },
      // Skipped: no sets, so no Lift Log row and no change.
      { slotId: byId["dead-bug"].id, exerciseId: "dead-bug", plannedSets: 2, sets: [], effort: null, back: null },
    ],
  };
}

describe("training storage", () => {
  beforeEach(async () => {
    await freshFake();
  });

  it("asks for setup until the databases exist", async () => {
    const result = await training.loadTraining();
    expect(result).toEqual({
      status: "setup",
      reason: "databases",
      missing: ["Training Programme", "Programme Exercises", "Lift Log"],
    });
  });

  it("creates the databases next to the Workout Log, then the programme", async () => {
    await training.createProgramme(input);

    for (const title of ["Training Programme", "Programme Exercises", "Lift Log"]) {
      const database = fake.databaseNamed(title);
      expect(database, title).toBeTruthy();
      expect(database.parent.page_id).toBe(IDS.healthTracker);
    }

    const data = await load();
    expect(data.programme).toMatchObject({
      startDate: "2026-09-28",
      trainingDays: ["Mon", "Wed", "Fri"],
      backCareDays: ["Tue", "Thu", "Sat"],
      level: "beginner",
      backPain: true,
      equipment: DEFAULT_EQUIPMENT,
    });
    expect(data.slots).toHaveLength(10);
    expect(data.slots.find((slot) => slot.exerciseId === "goblet-squat")).toMatchObject({
      weight: null,
      repMin: 10,
      repMax: 15,
      sets: 3,
    });
    expect(data.history).toEqual([]);
  });

  it("refuses a second programme but repairs a half-finished one", async () => {
    await training.createProgramme(input);
    await expect(training.createProgramme(input)).rejects.toBeInstanceOf(training.ConflictError);

    await freshFake();
    // The 4th exercise row fails to save; a retry fills the gap without duplicates.
    let seen = 0;
    fake.failOnce((method: string, path: string, body: any) => {
      if (method !== "POST" || path !== "/v1/pages" || !body?.properties?.["Exercise ID"]) return false;
      seen += 1;
      return seen === 4;
    });
    await expect(training.createProgramme(input)).rejects.toThrow();
    await training.createProgramme(input);
    expect((await load()).slots).toHaveLength(10);
    expect(fake.pagesIn(fake.databaseNamed("Training Programme").id)).toHaveLength(1);
  });

  it("records a workout once, even when the upload is retried", async () => {
    await training.createProgramme(input);
    const session = sessionFor(await load(), "session-0001-abcdef");

    const first = await training.recordSession(session);
    expect(first).toEqual({ rows: 3, updates: 3 });

    const again = await training.recordSession(session);
    expect(again).toEqual({ rows: 0, updates: 0 });

    const lifts = fake.pagesIn(fake.databaseNamed("Lift Log").id);
    expect(lifts).toHaveLength(3);
    const squat = lifts.find((row: any) => props(row, "Exercise ID") === "goblet-squat");
    expect(props(squat, "Reps")).toBe("20, 19");
    expect(props(squat, "Weight (kg)")).toBe(6);
    expect(props(squat, "Volume (kg)")).toBe(234);
    expect(props(squat, "Result")).toBe("Set");
    expect(props(squat, "Next")).toBe("Your working weight: 7 kg");

    const press = lifts.find((row: any) => props(row, "Exercise ID") === "floor-press");
    // Two dumbbells: volume counts both.
    expect(props(press, "Volume (kg)")).toBe(230);

    const summaries = fake.pagesIn(IDS.workoutLog);
    expect(summaries).toHaveLength(1);
    expect(props(summaries[0], "Name")).toBe("2026-09-28 - Dumbbell Workout A");
    expect(props(summaries[0], "Reps")).toBe(102);
    expect(props(summaries[0], "Notes")).toMatch(/^Goblet squat 6 kg × 20\/19 · Floor press 5 kg × 12\/11 · Glute bridge × 20\/20 — 32 min · ref session-/);

    const data = await load();
    const slot = (id: string) => data.slots.find((candidate) => candidate.exerciseId === id)!;
    expect(slot("goblet-squat")).toMatchObject({ weight: 7, lastSession: session.id, lastDone: "2026-09-28" });
    expect(slot("floor-press").weight).toBe(5);
    // Mild back discomfort holds the bridge at bodyweight despite topping the range.
    expect(slot("glute-bridge").weight).toBe(0);
    expect(slot("dead-bug").lastSession).toBeNull();

    expect(data.history).toEqual([{ date: "2026-09-28", kind: "strength", workout: "A", at: expect.any(String) }]);
    expect(data.last["goblet-squat"]).toEqual({ date: "2026-09-28", weight: 6, values: [20, 19] });
  });

  it("finishes a half-written workout on retry without double-applying progress", async () => {
    await training.createProgramme(input);
    const session = sessionFor(await load(), "session-0002-abcdef");

    // The floor press row is written but its programme update fails.
    fake.failOnce((method: string, path: string, body: any) => method === "PATCH" && path.startsWith("/v1/pages/") && body?.properties?.["Weight (kg)"]?.number === 5);
    await expect(training.recordSession(session)).rejects.toThrow();

    const retry = await training.recordSession(session);
    expect(retry.rows).toBe(0);
    expect(retry.updates).toBe(1);
    expect(fake.pagesIn(fake.databaseNamed("Lift Log").id)).toHaveLength(3);
    expect(fake.pagesIn(IDS.workoutLog)).toHaveLength(1);

    const data = await load();
    expect(data.slots.find((slot) => slot.exerciseId === "goblet-squat")?.weight).toBe(7);
    expect(data.slots.find((slot) => slot.exerciseId === "floor-press")?.lastSession).toBe(session.id);
  });

  it("swaps exercises when the equipment changes, keeping their progress", async () => {
    await training.createProgramme(input);
    const session = sessionFor(await load(), "session-0003-abcdef");
    await training.recordSession(session);

    await training.updateProgramme({ ...input, equipment: { ...DEFAULT_EQUIPMENT, bench: true, handleWeight: 2.5 } });
    const data = await load();
    expect(data.programme.equipment).toMatchObject({ bench: true, handleWeight: 2.5 });
    const press = data.slots.find((slot) => slot.order === 2 && slot.workout === "A");
    expect(press).toMatchObject({ exerciseId: "bench-press", weight: 5 });
  });

  it("counts back care sessions logged by the timer", async () => {
    await training.createProgramme(input);
    const today = new Date().toISOString().slice(0, 10);
    const { logSession } = await import("../notion");
    await logSession({
      routineId: "builtin-back-care",
      routineName: "Back Care",
      completed: [{ name: "Cat cow", duration: 45 }],
      plannedCount: 11,
      elapsedSeconds: 60,
      date: today,
    });
    const data = await load();
    expect(data.history).toEqual([{ date: today, kind: "backcare", at: expect.any(String) }]);
  });

  it("adds missing columns to an existing database but never changes existing ones", async () => {
    fake.addDatabase({
      parentId: IDS.healthTracker,
      title: "Lift Log",
      properties: { Name: { title: {} }, Date: { date: {} }, Extra: { rich_text: {} } },
    });
    await training.createProgramme(input);
    const liftLog = fake.databaseNamed("Lift Log");
    expect(Object.keys(liftLog.properties)).toEqual(expect.arrayContaining(["Extra", "Weight (kg)", "Session"]));

    await freshFake();
    fake.addDatabase({
      parentId: IDS.healthTracker,
      title: "Lift Log",
      properties: { Name: { title: {} }, "Weight (kg)": { rich_text: {} } },
    });
    await expect(training.createProgramme(input)).rejects.toThrow(/Weight \(kg\)" should be number, not rich text/);
  });
});

describe("history, body weight and reviews", () => {
  beforeEach(async () => {
    await freshFake();
  });

  async function addWeight(day: string, kg: number, fat?: string) {
    const response = await fetch(`${process.env.NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: { Authorization: "Bearer fake", "Content-Type": "application/json" },
      body: JSON.stringify({
        parent: { database_id: IDS.weightLog },
        properties: {
          Name: { title: [{ text: { content: day } }] },
          Date: { date: { start: day } },
          "Weight (kg)": { number: kg },
          ...(fat ? { "Body Fat %": { rich_text: [{ text: { content: fat } }] } } : {}),
        },
      }),
    });
    expect(response.ok).toBe(true);
  }

  it("returns every lift, back care day and body weight in date order", async () => {
    await training.createProgramme(input);
    await training.recordSession(sessionFor(await load(), "session-0101-abcdef"));
    const { logSession } = await import("../notion");
    await logSession({
      routineId: "builtin-back-care",
      routineName: "Back Care",
      completed: [{ name: "Cat cow", duration: 45 }],
      plannedCount: 11,
      elapsedSeconds: 60,
      date: "2026-09-29",
    });
    await addWeight("2026-08-12", 82.7, "27.2%");
    await addWeight("2026-07-23", 84);

    const history = await training.loadHistory();
    expect(history.weightLog).toBe(true);
    expect(history.lifts.map((lift) => lift.exerciseId)).toEqual(["goblet-squat", "floor-press", "glute-bridge"]);
    expect(history.lifts[0]).toMatchObject({
      date: "2026-09-28",
      workout: "A",
      weight: 6,
      values: [20, 19],
      result: "Set",
      back: "No pain",
      effort: "Easy",
    });
    expect(history.backCare).toEqual(["2026-09-29"]);
    expect(history.bodyWeight).toEqual([
      { date: "2026-07-23", kg: 84, bodyFat: null },
      { date: "2026-08-12", kg: 82.7, bodyFat: 27.2 },
    ]);
  });

  it("logs body weight in the Weight Log's own style, always as a new row", async () => {
    await training.createProgramme(input);
    await training.logBodyWeight({ date: "2026-10-05", kg: 82.4, bodyFat: 26.9 });
    await training.logBodyWeight({ date: "2026-10-05", kg: 82.2, bodyFat: null });
    const rows = fake.pagesIn(IDS.weightLog);
    expect(rows).toHaveLength(2);
    expect(props(rows[0], "Name")).toBe("2026-10-05");
    expect(props(rows[0], "Weight (kg)")).toBe(82.4);
    expect(props(rows[0], "Body Fat %")).toBe("26.9%");
    expect(props(rows[1], "Body Fat %")).toBe("");
  });

  it("applies review choices: deload week, harder variation, new schedule", async () => {
    await training.createProgramme(input);
    const before = await load();
    const bridge = before.slots.find((slot) => slot.exerciseId === "glute-bridge")!;

    await training.applyReview({
      block: 1,
      today: "2026-10-26",
      deload: true,
      swaps: [{ slotId: bridge.id, to: "single-leg-glute-bridge" }],
      schedule: { trainingDays: ["Mon", "Thu"], backCareDays: ["Tue", "Sat"] },
    });

    const after = await load();
    expect(after.programme).toMatchObject({
      lastReview: 1,
      deloadUntil: "2026-11-01",
      trainingDays: ["Mon", "Thu"],
      backCareDays: ["Tue", "Sat"],
    });
    expect(after.slots.find((slot) => slot.id === bridge.id)).toMatchObject({
      exerciseId: "single-leg-glute-bridge",
      weight: 0,
      stretch: 0,
      stalls: 0,
    });
  });

  it("keeps a harder variation from a review when plan settings are saved", async () => {
    await freshFake();
    await training.createProgramme(input);
    const press = (await load()).slots.find((slot) => slot.exerciseId === "floor-press")!;
    await training.applyReview({ block: 1, today: "2026-10-26", deload: false, swaps: [{ slotId: press.id, to: "floor-press-one-arm" }] });

    // Same dumbbells, new reminder time: the one-arm press must survive.
    await training.updateProgramme({ ...input, reminderTime: "07:00" });
    expect((await load()).slots.find((slot) => slot.id === press.id)?.exerciseId).toBe("floor-press-one-arm");

    // Going down to one handle still swaps what the equipment chose, and leaves the rest.
    await training.updateProgramme({ ...input, equipment: { ...DEFAULT_EQUIPMENT, handles: 1 } });
    const slots = (await load()).slots;
    expect(slots.find((slot) => slot.id === press.id)?.exerciseId).toBe("floor-press-one-arm");
    expect(slots.find((slot) => slot.exerciseId.startsWith("romanian-deadlift"))?.exerciseId).toBe("romanian-deadlift-single");
  });

  it("freezes progression during a deload week", async () => {
    await training.createProgramme(input);
    const data = await load();
    const squat = data.slots.find((slot) => slot.exerciseId === "goblet-squat")!;
    await training.applyReview({ block: 1, today: "2026-09-28", deload: true, swaps: [] });

    // The squat already has a working weight; the bridge is bodyweight. Both hold.
    const session = sessionFor(data, "session-0202-abcdef");
    session.exercises[0] = { ...session.exercises[0], sets: [{ weight: 6, value: 20 }, { weight: 6, value: 20 }] };
    await training.recordSession(session);

    const after = await load();
    // Finding a first weight still happens in a deload week…
    expect(after.slots.find((slot) => slot.id === squat.id)?.weight).toBe(7);
    // …but a bodyweight move that topped its range does not progress.
    const lifts = fake.pagesIn(fake.databaseNamed("Lift Log").id);
    const bridgeRow = lifts.find((row: any) => props(row, "Exercise ID") === "glute-bridge");
    expect(props(bridgeRow, "Result")).toBe("Hold");
    expect(props(bridgeRow, "Next")).toMatch(/^Lighter week/);
  });

  it("adds the newer plan columns to an older Training Programme on first write", async () => {
    const older = fake.addDatabase({
      parentId: IDS.healthTracker,
      title: "Training Programme",
      properties: { Name: { title: {} }, Active: { checkbox: {} }, "Start Date": { date: {} } },
    });
    await training.createProgramme(input);
    expect(Object.keys(older.properties)).toEqual(expect.arrayContaining(["Deload Until", "Last Review", "Reminder Time"]));
    await training.updateProgramme({ ...input, reminderTime: "07:15" });
    expect((await load()).programme.reminderTime).toBe("07:15");
  });

  it("keeps the note from last time", async () => {
    await training.createProgramme(input);
    const session = sessionFor(await load(), "session-0303-abcdef");
    session.exercises[0] = { ...session.exercises[0], note: "Neutral grip felt better" };
    await training.recordSession(session);
    expect((await load()).last["goblet-squat"].note).toBe("Neutral grip felt better");
  });
});

describe("calendar feed", () => {
  type FeedRoute = typeof import("../../app/api/calendar/[token]/route");
  let feed: FeedRoute;
  let link: typeof import("../../app/api/calendar/route");

  beforeAll(async () => {
    process.env.APP_SECRET = "feed-secret";
    feed = await import("../../app/api/calendar/[token]/route");
    link = await import("../../app/api/calendar/route");
  });

  afterAll(() => {
    delete process.env.APP_SECRET;
  });

  const get = (token: string) =>
    feed.GET(new Request(`https://workout.example/api/calendar/${token}`), { params: Promise.resolve({ token }) });

  it("serves the plan to the right link only", async () => {
    await freshFake();
    await training.createProgramme({ ...input, reminderTime: "06:45" });

    const { path } = (await (await link.GET()).json()) as { path: string };
    expect(path).toMatch(/^\/api\/calendar\/[0-9a-f]{32}\.ics$/);
    const token = path.split("/").pop()!;

    const response = await get(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const ics = await response.text();
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(ics).toContain("DTSTART:20260928T064500");
    expect(ics).toContain("URL:https://workout.example");

    expect((await get(token.replace(/^./, (c) => (c === "0" ? "1" : "0")))).status).toBe(404);
    expect((await get("")).status).toBe(404);
  });

  it("says so when there's no plan yet", async () => {
    await freshFake();
    const { path } = (await (await link.GET()).json()) as { path: string };
    const response = await get(path.split("/").pop()!);
    expect(response.status).toBe(404);
    expect(await response.text()).toMatch(/No training plan/);
  });
});
