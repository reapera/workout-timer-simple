import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, lockSecret, passcodeToken, safeEqual } from "@/lib/auth";

/** The passcode gate. Without APP_PASSCODE set, the app stays open as before. */
export async function proxy(request: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await passcodeToken(passcode, lockSecret()))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked — open the app and enter your passcode.", kind: "unknown" }, { status: 401 });
  }

  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(unlock);
}

export const config = {
  // Static assets (scripts, styles, exercise pictures) stay public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|svg|png|jpg|jpeg|ico|txt)$).*)"],
};
