import { NextResponse } from "next/server";

import { NotionApiError, NotionConfigError } from "@/lib/notion";
import { ConflictError, TrainingSetupError } from "@/lib/training/notion";
import { InputError } from "@/lib/training/validate";
import type { Exercise } from "@/lib/types";

export function apiError(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message, kind: "unknown" }, { status: 400 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message, kind: "unknown" }, { status: 409 });
  }
  if (error instanceof TrainingSetupError) {
    return NextResponse.json(
      { error: error.message, kind: "setup", reason: error.reason, missing: error.missing },
      { status: 409 },
    );
  }
  if (error instanceof NotionConfigError) {
    return NextResponse.json({ error: error.message, kind: "config" }, { status: 503 });
  }
  if (error instanceof NotionApiError) {
    const status = error.status === 404 ? 404 : 502;
    return NextResponse.json({ error: error.message, kind: "notion" }, { status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message, kind: "unknown" }, { status: 400 });
}

export class ValidationError extends Error {}

/** Guards against empty names and absurd durations before they reach Notion. */
export function parseRoutineBody(input: unknown): { name: string; exercises: Exercise[] } {
  if (typeof input !== "object" || input === null) {
    throw new ValidationError("Expected a JSON object");
  }

  const { name, exercises } = input as { name?: unknown; exercises?: unknown };

  if (typeof name !== "string" || !name.trim()) {
    throw new ValidationError("Routine name is required");
  }
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new ValidationError("Add at least one exercise");
  }
  if (exercises.length > 60) {
    throw new ValidationError("A routine can hold at most 60 exercises");
  }

  const parsed = exercises.map((raw, index) => {
    const { id, name: exerciseName, duration } = (raw ?? {}) as Record<string, unknown>;

    if (typeof exerciseName !== "string" || !exerciseName.trim()) {
      throw new ValidationError(`Exercise ${index + 1} needs a name`);
    }
    const seconds = Number(duration);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) {
      throw new ValidationError(
        `"${exerciseName.trim()}" needs a duration between 1 and 3600 seconds`,
      );
    }

    return {
      id: typeof id === "string" && id ? id : `tmp-${index}`,
      name: exerciseName.trim().slice(0, 100),
      duration: Math.round(seconds),
    };
  });

  return { name: name.trim().slice(0, 100), exercises: parsed };
}
