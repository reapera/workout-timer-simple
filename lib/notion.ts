import "server-only";

import type { Exercise, Routine } from "./types";

// Overridable so a local fake can stand in for Notion during development.
const NOTION_API = process.env.NOTION_API_BASE ?? "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new NotionConfigError(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export class NotionConfigError extends Error {}

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function notion<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${NOTION_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env("NOTION_TOKEN")}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Routines change rarely but must never be served stale after an edit.
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    let message = detail;
    try {
      message = (JSON.parse(detail) as { message?: string }).message ?? detail;
    } catch {
      // Non-JSON error body — the raw text is the best we have.
    }
    throw new NotionApiError(
      `Notion ${init.method ?? "GET"} ${path} failed (${response.status}): ${message}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ *
 * Property readers
 * ------------------------------------------------------------------ */

export type NotionPage = {
  id: string;
  properties: Record<string, any>;
};

export function readTitle(page: NotionPage, key: string): string {
  const parts = page.properties?.[key]?.title ?? [];
  return parts.map((part: any) => part.plain_text).join("").trim();
}

export function readNumber(page: NotionPage, key: string): number | null {
  const value = page.properties?.[key]?.number;
  return typeof value === "number" ? value : null;
}

export function readCheckbox(page: NotionPage, key: string): boolean {
  return page.properties?.[key]?.checkbox === true;
}

export function readDate(page: NotionPage, key: string): string | null {
  return page.properties?.[key]?.date?.start ?? null;
}

export function readRelationIds(page: NotionPage, key: string): string[] {
  const relation = page.properties?.[key]?.relation ?? [];
  return relation.map((item: { id: string }) => item.id);
}

/** Notion returns ids with dashes; incoming env vars may not have them. */
export function normalizeId(id: string): string {
  return id.replace(/-/g, "");
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export async function queryAll(
  databaseId: string,
  body: Record<string, unknown> = {},
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const page = await notion<{
      results: NotionPage[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: { ...body, page_size: 100, start_cursor: cursor },
    });

    pages.push(...page.results);
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

export async function listRoutines(): Promise<Routine[]> {
  const [routinePages, exercisePages] = await Promise.all([
    queryAll(env("NOTION_ROUTINES_DB"), {
      filter: { property: "Archived", checkbox: { equals: false } },
      sorts: [{ property: "Name", direction: "ascending" }],
    }),
    queryAll(env("NOTION_EXERCISES_DB")),
  ]);

  const exercisesByRoutine = new Map<string, Array<Exercise & { order: number }>>();

  for (const page of exercisePages) {
    const name = readTitle(page, "Name");
    if (!name) continue;

    for (const routineId of readRelationIds(page, "Routine")) {
      const key = normalizeId(routineId);
      const bucket = exercisesByRoutine.get(key) ?? [];
      bucket.push({
        id: page.id,
        name,
        duration: Math.max(1, Math.round(readNumber(page, "Duration (s)") ?? 30)),
        order: readNumber(page, "Order") ?? Number.MAX_SAFE_INTEGER,
      });
      exercisesByRoutine.set(key, bucket);
    }
  }

  return routinePages.map((page) => {
    const bucket = exercisesByRoutine.get(normalizeId(page.id)) ?? [];
    bucket.sort((a, b) => a.order - b.order);

    return {
      id: page.id,
      name: readTitle(page, "Name") || "Untitled routine",
      isDefault: readCheckbox(page, "Default"),
      lastUsed: readDate(page, "Last Used"),
      exercises: bucket.map(({ id, name, duration }) => ({ id, name, duration })),
    };
  });
}

export async function getRoutine(id: string): Promise<Routine | null> {
  const routines = await listRoutines();
  return routines.find((routine) => normalizeId(routine.id) === normalizeId(id)) ?? null;
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

/**
 * Notion's rate limit is ~3 requests/second. Exercise writes fan out one
 * request per row, so cap concurrency rather than firing the whole list.
 */
export async function inBatches<T>(items: T[], size: number, task: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
}

function exerciseProperties(exercise: Exercise, index: number, routineId: string) {
  return {
    Name: { title: [{ text: { content: exercise.name } }] },
    Routine: { relation: [{ id: routineId }] },
    Order: { number: index + 1 },
    "Duration (s)": { number: exercise.duration },
  };
}

async function createExercise(exercise: Exercise, index: number, routineId: string) {
  await notion("/pages", {
    method: "POST",
    body: {
      parent: { database_id: env("NOTION_EXERCISES_DB") },
      properties: exerciseProperties(exercise, index, routineId),
    },
  });
}

async function archivePage(pageId: string) {
  await notion(`/pages/${pageId}`, { method: "PATCH", body: { archived: true } });
}

export async function createRoutine(
  name: string,
  exercises: Exercise[],
): Promise<{ id: string }> {
  const routine = await notion<{ id: string }>("/pages", {
    method: "POST",
    body: {
      parent: { database_id: env("NOTION_ROUTINES_DB") },
      properties: {
        Name: { title: [{ text: { content: name } }] },
        Default: { checkbox: false },
        Archived: { checkbox: false },
      },
    },
  });

  await inBatches(
    exercises.map((exercise, index) => ({ exercise, index })),
    3,
    ({ exercise, index }) => createExercise(exercise, index, routine.id),
  );

  return { id: routine.id };
}

/**
 * Reconciles the saved exercise rows against the submitted list: rows that
 * disappeared are archived, new rows are created, and survivors are patched
 * only when something actually changed.
 */
export async function updateRoutine(
  routineId: string,
  name: string,
  exercises: Exercise[],
): Promise<void> {
  const existing = await getRoutine(routineId);
  if (!existing) throw new NotionApiError("Routine not found", 404);

  await notion(`/pages/${routineId}`, {
    method: "PATCH",
    body: { properties: { Name: { title: [{ text: { content: name } }] } } },
  });

  const submittedIds = new Set(exercises.map((exercise) => normalizeId(exercise.id)));
  const removed = existing.exercises.filter(
    (exercise) => !submittedIds.has(normalizeId(exercise.id)),
  );

  const previousById = new Map(
    existing.exercises.map((exercise, index) => [
      normalizeId(exercise.id),
      { ...exercise, order: index + 1 },
    ]),
  );

  const toCreate: Array<{ exercise: Exercise; index: number }> = [];
  const toUpdate: Array<{ exercise: Exercise; index: number }> = [];

  exercises.forEach((exercise, index) => {
    const previous = previousById.get(normalizeId(exercise.id));
    if (!previous) {
      toCreate.push({ exercise, index });
      return;
    }
    const unchanged =
      previous.name === exercise.name &&
      previous.duration === exercise.duration &&
      previous.order === index + 1;
    if (!unchanged) toUpdate.push({ exercise, index });
  });

  await inBatches(removed, 3, (exercise) => archivePage(exercise.id));
  await inBatches(toUpdate, 3, ({ exercise, index }) =>
    notion(`/pages/${exercise.id}`, {
      method: "PATCH",
      body: { properties: exerciseProperties(exercise, index, routineId) },
    }),
  );
  await inBatches(toCreate, 3, ({ exercise, index }) =>
    createExercise(exercise, index, routineId),
  );
}

export async function duplicateRoutine(routineId: string): Promise<{ id: string }> {
  const source = await getRoutine(routineId);
  if (!source) throw new NotionApiError("Routine not found", 404);
  return createRoutine(`${source.name} (copy)`, source.exercises);
}

export async function archiveRoutine(routineId: string): Promise<void> {
  await notion(`/pages/${routineId}`, {
    method: "PATCH",
    body: { properties: { Archived: { checkbox: true } } },
  });
}

/** Exactly one routine carries the Default flag, so clear the previous holder. */
export async function setDefaultRoutine(routineId: string): Promise<void> {
  const routines = await listRoutines();
  const stale = routines.filter(
    (routine) => routine.isDefault && normalizeId(routine.id) !== normalizeId(routineId),
  );

  await inBatches(stale, 3, (routine) =>
    notion(`/pages/${routine.id}`, {
      method: "PATCH",
      body: { properties: { Default: { checkbox: false } } },
    }),
  );

  await notion(`/pages/${routineId}`, {
    method: "PATCH",
    body: { properties: { Default: { checkbox: true } } },
  });
}

/* ------------------------------------------------------------------ *
 * Session logging
 * ------------------------------------------------------------------ */

export type SessionLog = {
  routineId: string;
  routineName: string;
  /** Exercises actually completed, in the order they ran. */
  completed: Array<{ name: string; duration: number }>;
  /** How many the routine contained, so partial sessions are visible. */
  plannedCount: number;
  /** Wall-clock seconds from start to finish, including prep and rest. */
  elapsedSeconds: number;
  /** The phone's calendar date (YYYY-MM-DD); the server's clock is UTC. */
  date?: string;
};

/**
 * Writes one row per session into the existing Workout Log, matching the
 * shape of the hand-entered rows: "YYYY-MM-DD - <name>" title plus a date.
 * `Reps` and `Level` are deliberately left empty — they belong to the
 * rep-based entries and would be meaningless for a timed session.
 */
export async function logSession(session: SessionLog): Promise<{ id: string }> {
  const workSeconds = session.completed.reduce((sum, item) => sum + item.duration, 0);
  const date = session.date ?? new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  const breakdown = session.completed
    .map((item) => `${item.name} ${item.duration}s`)
    .join(" · ");
  const partial = session.completed.length < session.plannedCount ? " (partial)" : "";
  const notes =
    `${breakdown} — ${session.completed.length}/${session.plannedCount} exercises, ` +
    `${workSeconds}s work, ${Math.round(session.elapsedSeconds)}s total${partial}`;

  const page = await notion<{ id: string }>("/pages", {
    method: "POST",
    body: {
      parent: { database_id: env("NOTION_LOG_DB") },
      properties: {
        Name: { title: [{ text: { content: `${date} - ${session.routineName}` } }] },
        Date: { date: { start: date } },
        Exercise: { rich_text: [{ text: { content: session.routineName } }] },
        "Duration (s)": { number: workSeconds },
        Notes: { rich_text: [{ text: { content: notes.slice(0, 2000) } }] },
      },
    },
  });

  // Best-effort: a failed timestamp must not fail an otherwise-logged session.
  // Built-in routines (warm-up, back care) have no Notion page to stamp.
  if (!session.routineId.startsWith("builtin-")) {
    try {
      await notion(`/pages/${session.routineId}`, {
        method: "PATCH",
        body: { properties: { "Last Used": { date: { start: date } } } },
      });
    } catch {
      // Ignored on purpose.
    }
  }

  return { id: page.id };
}
