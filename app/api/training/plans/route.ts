import { NextResponse } from "next/server";

import { loadSavedPlans, removeSavedPlan, saveCurrentAsPlan } from "@/lib/training/notion";
import { parsePlanId, parseSavePlan } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Your saved plans (the ready-made ones ship with the app). */
export async function GET() {
  try {
    return NextResponse.json({ saved: await loadSavedPlans() });
  } catch (error) {
    return apiError(error);
  }
}

/** Saves the current workouts as a plan. */
export async function POST(request: Request) {
  try {
    const { name } = parseSavePlan(await request.json());
    return NextResponse.json({ id: await saveCurrentAsPlan(name) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/** Hides a saved plan (kept in Notion as Archived). */
export async function PATCH(request: Request) {
  try {
    await removeSavedPlan(parsePlanId(await request.json()).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
