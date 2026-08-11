import { NextResponse } from "next/server";

import { createRoutine, listRoutines } from "@/lib/notion";
import { apiError, parseRoutineBody } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ routines: await listRoutines() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = parseRoutineBody(await request.json());
    const created = await createRoutine(body.name, body.exercises);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
