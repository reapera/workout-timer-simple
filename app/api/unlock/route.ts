import { NextResponse } from "next/server";

import { AUTH_COOKIE, AUTH_MAX_AGE, lockSecret, passcodeToken, safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.json({ ok: true });

  let attempt = "";
  try {
    const body = (await request.json()) as { passcode?: unknown };
    attempt = typeof body.passcode === "string" ? body.passcode.slice(0, 200) : "";
  } catch {
    // Treated as a wrong passcode below.
  }

  const secret = lockSecret();
  const [expected, given] = await Promise.all([passcodeToken(passcode, secret), passcodeToken(attempt, secret)]);
  if (!safeEqual(expected, given)) {
    // A pause per wrong guess makes guessing slow.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "That's not it — try again." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return response;
}
