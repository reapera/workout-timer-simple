"use client";

import { readError, readJson, writeJson, type ApiFailure } from "../client";
import type { TrainingData, SessionLog } from "./types";
import type { ProgrammeInput } from "./validate";
import { applySession, applyWorkout, toSessionLog, type WorkoutState } from "./workout";

const DATA_KEY = "wt.training.v1";
const ACTIVE_KEY = "wt.activeWorkout.v1";
const QUEUE_KEY = "wt.pendingWorkouts.v1";

/** An unfinished workout older than this is stale, not something to resume. */
const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;

export type TrainingLoad =
  | { kind: "ready"; data: TrainingData; stale: boolean; failure: ApiFailure | null }
  | { kind: "setup"; reason: "databases" | "programme"; missing: string[] }
  | { kind: "error"; failure: ApiFailure };

type TrainingResponse =
  | { status: "ready"; data: TrainingData }
  | { status: "setup"; reason: "databases" | "programme"; missing: string[] };

export function cachedTraining(): TrainingData | null {
  return readJson<TrainingData>(DATA_KEY);
}

function cacheTraining(data: TrainingData) {
  writeJson(DATA_KEY, data);
}

/** Notion first; the last good copy when offline, flagged as stale. */
export async function fetchTraining(): Promise<TrainingLoad> {
  const fallback = (failure: ApiFailure): TrainingLoad => {
    const cached = cachedTraining();
    return cached ? { kind: "ready", data: cached, stale: true, failure } : { kind: "error", failure };
  };

  try {
    const response = await fetch("/api/training", { cache: "no-store" });
    if (!response.ok) return fallback(await readError(response));
    const body = (await response.json()) as TrainingResponse;
    if (body.status === "setup") return { kind: "setup", reason: body.reason, missing: body.missing };
    // Workouts still waiting to upload count already; Notion just hasn't heard yet.
    const queued = readJson<SessionLog[]>(QUEUE_KEY) ?? [];
    const data = queued.reduce(applySession, body.data);
    cacheTraining(data);
    return { kind: "ready", data, stale: false, failure: null };
  } catch {
    return fallback({ message: "You appear to be offline.", kind: "unknown" });
  }
}

async function send(path: string, method: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await readError(response)).message);
}

export function createPlan(input: ProgrammeInput): Promise<void> {
  return send("/api/training/setup", "POST", input);
}

export function savePlan(input: ProgrammeInput): Promise<void> {
  return send("/api/training/programme", "PATCH", input);
}

/* ------------------------------------------------------------------ *
 * The workout in progress
 * ------------------------------------------------------------------ */

export function loadActiveWorkout(): WorkoutState | null {
  const state = readJson<WorkoutState>(ACTIVE_KEY);
  if (!state || state.version !== 1) return null;
  if (state.phase !== "done" && Date.now() - state.startedAt > RESUME_WINDOW_MS) return null;
  return state;
}

export function saveActiveWorkout(state: WorkoutState) {
  writeJson(ACTIVE_KEY, state);
}

export function clearActiveWorkout() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/* ------------------------------------------------------------------ *
 * Uploading finished workouts, with an offline queue
 * ------------------------------------------------------------------ */

async function postWorkout(session: SessionLog): Promise<boolean> {
  try {
    const response = await fetch("/api/training/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    // 400 means the payload itself is unusable; retrying would never succeed.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

export type UploadResult = "written" | "queued";

/**
 * Records a finished workout. The local plan is updated straight away so the
 * next visit shows the new targets; Notion gets it now or, if unreachable,
 * the next time the app opens. The server makes retries harmless.
 */
export async function finishWorkout(state: WorkoutState): Promise<UploadResult> {
  const session = toSessionLog(state);
  const cached = cachedTraining();
  if (cached) cacheTraining(applyWorkout(cached, state));

  if (!session.exercises.some((exercise) => exercise.sets.length)) return "written";
  if (await postWorkout(session)) return "written";

  const queue = readJson<SessionLog[]>(QUEUE_KEY) ?? [];
  if (!queue.some((queued) => queued.id === session.id)) writeJson(QUEUE_KEY, [...queue, session]);
  return "queued";
}

export function pendingWorkoutCount(): number {
  return (readJson<SessionLog[]>(QUEUE_KEY) ?? []).length;
}

/** Retries queued workouts oldest first, stopping at the first failure. */
export async function flushPendingWorkouts(): Promise<number> {
  const queue = readJson<SessionLog[]>(QUEUE_KEY) ?? [];
  let sent = 0;
  while (queue.length) {
    if (!(await postWorkout(queue[0]))) break;
    queue.shift();
    sent += 1;
  }
  if (sent) writeJson(QUEUE_KEY, queue);
  return sent;
}
