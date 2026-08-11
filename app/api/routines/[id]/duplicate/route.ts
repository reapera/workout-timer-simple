import { NextResponse } from "next/server";

import { duplicateRoutine } from "@/lib/notion";
import { apiError } from "../../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await duplicateRoutine(id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
