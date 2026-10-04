import { NextResponse } from "next/server";

import { updateProgramme } from "@/lib/training/notion";
import { parseProgrammeInput } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    await updateProgramme(parseProgrammeInput(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
