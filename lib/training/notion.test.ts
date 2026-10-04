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

describe("editing the workouts", () => {
  const slotOf = (data: Awaited<ReturnType<typeof load>>, exerciseId: string) =>
    data.slots.find((slot) => slot.exerciseId === exerciseId)!;

  it("swaps an exercise, giving a hold its own targets and a fresh weight", async () => {
    await freshFake();
    await training.createProgramme(input);
    const bird = slotOf(await load(), "bird-dog");

    await training.updateSlots([{ id: bird.id, exerciseId: "farmer-carry" }]);
    expect(slotOf(await load(), "farmer-carry")).toMatchObject({
      id: bird.id,
      workout: "B",
      order: bird.order,
      sets: 2,
      repMin: null,
      repMax: null,
      seconds: 20,
      maxSeconds: 45,
      rest: 60,
      weight: null,
    });

    // Same kind of move: the sets and rest you chose stay.
    const squat = slotOf(await load(), "goblet-squat");
    await training.updateSlots([{ id: squat.id, rest: 120 }]);
    await training.updateSlots([{ id: squat.id, exerciseId: "sumo-squat" }]);
    expect(slotOf(await load(), "sumo-squat")).toMatchObject({ sets: squat.sets, repMin: 10, repMax: 15, rest: 120, weight: null });
  });

  it("changes sets, reps, rest and weight, keeping ranges the right way round", async () => {
    await freshFake();
    await training.createProgramme(input);
    const squat = slotOf(await load(), "goblet-squat");

    await training.updateSlots([{ id: squat.id, sets: 4, repMin: 16, rest: 120, weight: 10 }]);
    expect(slotOf(await load(), "goblet-squat")).toMatchObject({ sets: 4, repMin: 16, repMax: 16, rest: 120, weight: 10, stretch: 0 });
  });

  it("removes without deleting, puts back, and never empties the plan", async () => {
    await freshFake();
    await training.createProgramme(input);
    const data = await load();
    const workoutA = data.slots.filter((slot) => slot.workout === "A");
    const deadBug = slotOf(data, "dead-bug");

    await training.updateSlots([{ id: deadBug.id, archived: true }]);
    expect((await load()).slots.some((slot) => slot.id === deadBug.id)).toBe(false);
    expect((await training.loadArchivedSlots()).map((slot) => slot.id)).toEqual([deadBug.id]);
    expect(fake.pagesIn(fake.databaseNamed("Programme Exercises")!.id).length).toBe(data.slots.length);

    // Setup never brings it back.
    await expect(training.createProgramme(input)).rejects.toThrow(/already exists/);
    expect((await load()).slots.some((slot) => slot.id === deadBug.id)).toBe(false);

    await training.updateSlots([{ id: deadBug.id, archived: false, order: 9 }]);
    expect(slotOf(await load(), "dead-bug")).toMatchObject({ id: deadBug.id, order: 9 });

    // A whole workout can go (it drops out of the rotation), but not every exercise in the plan.
    const everything = (await load()).slots.map((slot) => ({ id: slot.id, archived: true }));
    await expect(training.updateSlots(everything)).rejects.toThrow(/plan needs at least one exercise/);
    await training.updateSlots(workoutA.map((slot) => ({ id: slot.id, archived: true })));
    expect(new Set((await load()).slots.map((slot) => slot.workout))).toEqual(new Set(["B"]));
  });

  it("adds an exercise at the end of a workout with sensible targets", async () => {
    await freshFake();
    await training.createProgramme(input);
    const id = await training.addSlot({ workout: "A", exerciseId: "dumbbell-curl" });
    const added = (await load()).slots.find((slot) => slot.id === id);
    expect(added).toMatchObject({ exerciseId: "dumbbell-curl", workout: "A", order: 6, sets: 2, repMin: 10, repMax: 15, rest: 60, weight: null });
  });

  it("makes every exercise a dumbbell one in a single step", async () => {
    await freshFake();
    await training.createProgramme(input);
    const { dumbbellOnlyChanges, slotUsesDumbbell } = await import("./customize");
    const before = await load();

    await training.updateSlots(dumbbellOnlyChanges(before.slots, before.programme.equipment));
    const after = await load();
    expect(after.slots.map((slot) => slot.exerciseId).sort()).toEqual(
      [
        "dumbbell-dead-bug",
        "farmer-carry",
        "floor-press",
        "glute-bridge",
        "goblet-squat",
        "one-arm-row",
        "romanian-deadlift",
        "shoulder-press",
        "split-squat",
        "suitcase-carry",
      ],
    );
    expect(after.slots.every(slotUsesDumbbell)).toBe(true);
    expect(dumbbellOnlyChanges(after.slots, after.programme.equipment)).toEqual([]);
  });

  it("refuses rows that aren't in the plan", async () => {
    await freshFake();
    await training.createProgramme(input);
    await expect(training.updateSlots([{ id: "00000000-0000-4000-8000-000000000000", sets: 2 }])).rejects.toThrow(/no longer in your plan/);
  });
});

describe("plans", () => {
  const SIX_DAYS: ProgrammeInput["trainingDays"] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const layout = (slots: Array<{ workout: string; order: number; exerciseId: string }>) =>
    slots.map((slot) => `${slot.workout}${slot.order}:${slot.exerciseId}`).sort();

  it("switches to Upper / Legs / Core, keeping known weights and restarting the rotation", async () => {
    await freshFake();
    await training.createProgramme(input);
    const before = await load();
    const squat = before.slots.find((slot) => slot.exerciseId === "goblet-squat")!;
    await training.updateSlots([{ id: squat.id, weight: 9 }]);

    await training.applyPlan({
      plan: { kind: "builtin", id: "upper-legs-core" },
      days: { trainingDays: SIX_DAYS, backCareDays: [] },
    });
    const after = await load();
    expect(after.programme).toMatchObject({
      name: "Upper / Legs / Core",
      workoutNames: { A: "Upper body", B: "Legs", C: "Core" },
      trainingDays: SIX_DAYS,
      backCareDays: [],
    });
    expect(after.programme.planSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Set(after.slots.map((slot) => slot.workout))).toEqual(new Set(["A", "B", "C"]));
    expect(after.slots.find((slot) => slot.exerciseId === "goblet-squat")).toMatchObject({ workout: "B", weight: 9 });
    expect(after.slots.find((slot) => slot.exerciseId === "dumbbell-curl")?.weight).toBeNull();
    // The old exercises are archived with their history, not deleted.
    expect((await training.loadArchivedSlots()).map((slot) => slot.id).sort()).toEqual(before.slots.map((slot) => slot.id).sort());
  });

  it("saves the current workouts as a plan and switches back to them", async () => {
    await freshFake();
    await training.createProgramme(input);
    const original = await load();
    const deadBug = original.slots.find((slot) => slot.exerciseId === "dead-bug")!;
    await training.updateSlots([{ id: deadBug.id, sets: 3 }]);
    expect(await training.loadSavedPlans()).toEqual([]);

    await training.applyPlan({ plan: { kind: "builtin", id: "upper-lower" }, saveCurrentAs: "My full body" });
    expect(fake.databaseNamed("Saved Plans")).toBeTruthy();
    const saved = await training.loadSavedPlans();
    expect(saved.map((plan) => plan.name)).toEqual(["My full body"]);
    expect((await load()).programme.workoutNames).toEqual({ A: "Upper body", B: "Lower body" });

    await training.applyPlan({ plan: { kind: "saved", id: saved[0].id } });
    const back = await load();
    expect(back.programme).toMatchObject({ name: "My full body", workoutNames: {} });
    expect(layout(back.slots)).toEqual(layout(original.slots));
    expect(back.slots.find((slot) => slot.exerciseId === "dead-bug")?.sets).toBe(3);

    await training.removeSavedPlan(saved[0].id);
    expect(await training.loadSavedPlans()).toEqual([]);
    // Only saved plans can be removed this way.
    await expect(training.removeSavedPlan(back.slots[0].id)).rejects.toThrow(/doesn't exist/);
  });

  it("names and renames workouts", async () => {
    await freshFake();
    await training.createProgramme(input);
    await training.renameWorkouts({ A: "Push", B: "Pull" });
    expect((await load()).programme.workoutNames).toEqual({ A: "Push", B: "Pull" });
    await training.renameWorkouts({ B: "" });
    expect((await load()).programme.workoutNames).toEqual({ A: "Push" });
  });

  it("records a third workout like any other", async () => {
    await freshFake();
    await training.createProgramme(input);
    await training.applyPlan({ plan: { kind: "builtin", id: "upper-legs-core" } });
    const data = await load();
    const carry = data.slots.find((slot) => slot.exerciseId === "suitcase-carry")!;
    await training.recordSession({
      id: "session-core-0001",
      workout: "C",
      date: "2026-09-30",
      startedAt: "2026-09-30T07:00:00.000Z",
      elapsedSeconds: 900,
      exercises: [
        { slotId: carry.id, exerciseId: "suitcase-carry", plannedSets: 2, sets: [{ weight: 8, value: 20 }, { weight: 8, value: 20 }], effort: "good", back: "none" },
      ],
    });
    const lift = fake.pagesIn(fake.databaseNamed("Lift Log")!.id).find((page) => props(page, "Exercise ID") === "suitcase-carry")!;
    expect(props(lift, "Workout")).toBe("C");
    const history = (await load()).history.filter((mark) => mark.kind === "strength");
    expect(history.map((mark) => mark.workout)).toEqual(["C"]);
    expect((await training.loadHistory()).lifts.map((entry) => entry.workout)).toEqual(["C"]);
  });

  it("refuses unknown plans and plans that don't fit the equipment", async () => {
    await freshFake();
    await training.createProgramme(input);
    await expect(training.applyPlan({ plan: { kind: "builtin", id: "nope" } })).rejects.toThrow(/Unknown plan/);
    await expect(training.applyPlan({ plan: { kind: "saved", id: "00000000-0000-4000-8000-000000000000" } })).rejects.toThrow(/no longer exists/);
  });
});
