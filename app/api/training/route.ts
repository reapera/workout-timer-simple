import { NextResponse } from "next/server";

import { loadTraining } from "@/lib/training/notion";
import { apiError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadTraining());
  } catch (error) {
    return apiError(error);
  }
}
