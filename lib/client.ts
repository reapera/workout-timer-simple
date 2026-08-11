"use client";

import type { Exercise, Routine } from "./types";

const ROUTINES_KEY = "wt.routines.v1";
const LAST_PICKED_KEY = "wt.lastRoutineId.v1";
const LOG_QUEUE_KEY = "wt.pendingLogs.v1";

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota — caching is an optimisation, not a feature.
  }
}

export type ApiFailure = { message: string; kind: "config" | "notion" | "unknown" };

async function readError(response: Response): Promise<ApiFailure> {
  try {
    const body = (await response.json()) as { error?: string; kind?: ApiFailure["kind"] };
    return {
      message: body.error ?? `Request failed (${response.status})`,
      kind: body.kind ?? "unknown",
    };
  } catch {
    return { message: `Request failed (${response.status})`, kind: "unknown" };
  }
}

/* ------------------------------------------------------------------ *
 * Routines
 * ------------------------------------------------------------------ */

export function cachedRoutines(): Routine[] | null {
  return readJson<Routine[]>(ROUTINES_KEY);
}

/**
 * Notion is the source of truth, but a dead connection at the gym should not
 * mean a dead app — the last successful read is kept locally and returned with
 * `stale: true` so the UI can say so.
 */
export async function fetchRoutines(): Promise<{
  routines: Routine[];
  stale: boolean;
  failure: ApiFailure | null;
}> {
  try {
    const response = await fetch("/api/routines", { cache: "no-store" });
    if (!response.ok) {
      const failure = await readError(response);
      return { routines: cachedRoutines() ?? [], stale: true, failure };
    }
    const { routines } = (await response.json()) as { routines: Routine[] };
    writeJson(ROUTINES_KEY, routines);
    return { routines, stale: false, failure: null };
  } catch {
    return {
      routines: cachedRoutines() ?? [],
      stale: true,
      failure: { message: "You appear to be offline.", kind: "unknown" },
    };
  }
}

export async function saveRoutine(
  routineId: string | null,
  name: string,
  exercises: Exercise[],
): Promise<{ id?: string }> {
  const response = await fetch(routineId ? `/api/routines/${routineId}` : "/api/routines", {
    method: routineId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, exercises }),
  });
  if (!response.ok) throw new Error((await readError(response)).message);
  return (await response.json()) as { id?: string };
}

export async function duplicateRoutine(routineId: string): Promise<{ id: string }> {
  const response = await fetch(`/api/routines/${routineId}/duplicate`, { method: "POST" });
  if (!response.ok) throw new Error((await readError(response)).message);
  return (await response.json()) as { id: string };
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const response = await fetch(`/api/routines/${routineId}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await readError(response)).message);
}

export async function makeDefault(routineId: string): Promise<void> {
  const response = await fetch(`/api/routines/${routineId}/default`, { method: "POST" });
  if (!response.ok) throw new Error((await readError(response)).message);
}

/* ------------------------------------------------------------------ *
 * Last picked routine
 * ------------------------------------------------------------------ */

export function getLastPickedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_PICKED_KEY);
  } catch {
    return null;
  }
}

export function setLastPickedId(routineId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_PICKED_KEY, routineId);
  } catch {
    // Non-fatal: the Default flag in Notion is the fallback.
  }
}

/** Last picked wins, then the routine flagged Default in Notion, then the first. */
export function pickInitialRoutine(routines: Routine[]): Routine | null {
  if (!routines.length) return null;
  const lastId = getLastPickedId();
  return (
    routines.find((routine) => routine.id === lastId) ??
    routines.find((routine) => routine.isDefault) ??
    routines[0]
  );
}

/* ------------------------------------------------------------------ *
 * Session logging, with an offline queue
 * ------------------------------------------------------------------ */

export type PendingLog = {
  routineId: string;
  routineName: string;
  completed: Array<{ name: string; duration: number }>;
  plannedCount: number;
  elapsedSeconds: number;
};

async function postLog(session: PendingLog): Promise<boolean> {
  try {
    const response = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type LogResult = "written" | "queued";

/** A finished workout is never lost: if Notion is unreachable, it waits on disk. */
export async function logSession(session: PendingLog): Promise<LogResult> {
  if (await postLog(session)) return "written";
  writeJson(LOG_QUEUE_KEY, [...(readJson<PendingLog[]>(LOG_QUEUE_KEY) ?? []), session]);
  return "queued";
}

export function pendingLogCount(): number {
  return (readJson<PendingLog[]>(LOG_QUEUE_KEY) ?? []).length;
}

/** Retries queued sessions oldest-first, stopping at the first failure. */
export async function flushPendingLogs(): Promise<number> {
  const queue = readJson<PendingLog[]>(LOG_QUEUE_KEY) ?? [];
  if (!queue.length) return 0;

  let sent = 0;
  while (queue.length) {
    if (!(await postLog(queue[0]))) break;
    queue.shift();
    sent += 1;
  }

  writeJson(LOG_QUEUE_KEY, queue);
  return sent;
}
