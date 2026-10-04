import { NextResponse } from "next/server";

import { applyReview } from "@/lib/training/notion";
import { parseReview } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Applies the choices from a 4-week review and marks the block reviewed. */
export async function POST(request: Request) {
  try {
    await applyReview(parseReview(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
