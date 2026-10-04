import { NextResponse } from "next/server";

import { createProgramme } from "@/lib/training/notion";
import { parseProgrammeInput } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Creates the Notion databases (if missing), the programme and its exercises. */
export async function POST(request: Request) {
  try {
    await createProgramme(parseProgrammeInput(await request.json()));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
