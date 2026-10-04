import { NextResponse } from "next/server";

import { recordSession } from "@/lib/training/notion";
import { parseSessionLog } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Safe to retry: a session already (partly) written is completed, not duplicated. */
export async function POST(request: Request) {
  try {
    const result = await recordSession(parseSessionLog(await request.json()));
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
