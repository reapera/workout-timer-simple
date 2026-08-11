import { NextResponse } from "next/server";

import { setDefaultRoutine } from "@/lib/notion";
import { apiError } from "../../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await setDefaultRoutine(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
