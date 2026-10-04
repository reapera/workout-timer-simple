import { NextResponse } from "next/server";

import { FEED_PREFIX, feedToken, lockSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Where the calendar feed lives. Behind the passcode, so only the owner sees the link. */
export async function GET() {
  return NextResponse.json({ path: `${FEED_PREFIX}${await feedToken(lockSecret())}.ics` });
}
