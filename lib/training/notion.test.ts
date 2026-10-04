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
