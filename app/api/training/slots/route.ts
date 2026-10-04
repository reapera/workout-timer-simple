import { NextResponse } from "next/server";

import { addSlot, loadArchivedSlots, updateSlots } from "@/lib/training/notion";
import { parseNewSlot, parseSlotUpdates } from "@/lib/training/validate";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

/** Exercises taken out of a workout, so they can be put back. */
export async function GET() {
  try {
    return NextResponse.json({ archived: await loadArchivedSlots() });
  } catch (error) {
    return apiError(error);
  }
}

/** Edits from the workout editor: swaps, targets, weights, order, remove and put back. */
export async function PATCH(request: Request) {
  try {
    await updateSlots(parseSlotUpdates(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

/** Adds an exercise to the end of a workout. */
export async function POST(request: Request) {
  try {
    const id = await addSlot(parseNewSlot(await request.json()));
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
