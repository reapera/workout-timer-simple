import { NextResponse } from "next/server";

import { logBodyWeight } from "@/lib/training/notion";
import { parseBodyWeight } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Appends a row to the Weight Log. */
export async function POST(request: Request) {
  try {
    await logBodyWeight(parseBodyWeight(await request.json()));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
