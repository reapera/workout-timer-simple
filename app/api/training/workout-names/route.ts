import { NextResponse } from "next/server";

import { renameWorkouts } from "@/lib/training/notion";
import { parseWorkoutNamesInput } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Names the workouts ("Upper body"); an empty name goes back to "Workout A". */
export async function PATCH(request: Request) {
  try {
    await renameWorkouts(parseWorkoutNamesInput(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
