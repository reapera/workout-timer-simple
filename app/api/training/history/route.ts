import { NextResponse } from "next/server";

import { loadHistory } from "@/lib/training/notion";
import { apiError } from "../../_helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadHistory());
  } catch (error) {
    return apiError(error);
  }
}
