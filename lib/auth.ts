/**
 * Optional passcode lock. When APP_PASSCODE is set, every page and API route
 * needs a cookie holding an HMAC of the passcode. The key is a server secret,
 * so a leaked cookie can't be brute-forced back into the passcode.
 */

export const AUTH_COOKIE = "wt_auth";

/** Browsers cap cookie lifetimes at 400 days. */
export const AUTH_MAX_AGE = 400 * 24 * 60 * 60;

export function lockSecret(): string {
  return process.env.APP_SECRET || process.env.NOTION_TOKEN || "workout-timer";
}

export async function passcodeToken(passcode: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`passcode:${passcode}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison, so response timing leaks nothing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
