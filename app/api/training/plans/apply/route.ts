import { NextResponse } from "next/server";

import { applyPlan } from "@/lib/training/notion";
import { parseApplyPlan } from "@/lib/training/validate";
import { apiError } from "../../../_helpers";

export const dynamic = "force-dynamic";

/** Switches to a ready-made or saved plan. */
export async function POST(request: Request) {
  try {
    await applyPlan(parseApplyPlan(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
