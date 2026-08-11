import { NextResponse } from "next/server";

import { archiveRoutine, updateRoutine } from "@/lib/notion";
import { apiError, parseRoutineBody } from "../../_helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = parseRoutineBody(await request.json());
    await updateRoutine(id, body.name, body.exercises);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await archiveRoutine(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
