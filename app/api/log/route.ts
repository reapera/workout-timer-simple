import { NextResponse } from "next/server";

import { logSession, type SessionLog } from "@/lib/notion";
import { apiError, ValidationError } from "../_helpers";

export const dynamic = "force-dynamic";

function parseSession(input: unknown): SessionLog {
  if (typeof input !== "object" || input === null) {
    throw new ValidationError("Expected a JSON object");
  }

  const { routineId, routineName, completed, plannedCount, elapsedSeconds } =
    input as Record<string, unknown>;

  if (typeof routineId !== "string" || !routineId) {
    throw new ValidationError("routineId is required");
  }
  if (typeof routineName !== "string" || !routineName) {
    throw new ValidationError("routineName is required");
  }
  if (!Array.isArray(completed) || completed.length === 0) {
    throw new ValidationError("A session with no completed exercises is not logged");
  }

  return {
    routineId,
    routineName,
    completed: completed.map((raw) => {
      const { name, duration } = (raw ?? {}) as Record<string, unknown>;
      return {
        name: typeof name === "string" ? name.slice(0, 100) : "Exercise",
        duration: Math.max(0, Math.round(Number(duration) || 0)),
      };
    }),
    plannedCount: Math.max(completed.length, Math.round(Number(plannedCount) || 0)),
    elapsedSeconds: Math.max(0, Math.round(Number(elapsedSeconds) || 0)),
  };
}

export async function POST(request: Request) {
  try {
    const session = parseSession(await request.json());
    return NextResponse.json(await logSession(session), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
