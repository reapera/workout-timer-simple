import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "../proxy";
import { AUTH_COOKIE, feedToken, passcodeToken, safeEqual } from "./auth";

describe("passcodeToken", () => {
  it("is stable for the same passcode and secret, and differs otherwise", async () => {
    const token = await passcodeToken("2468-squat", "secret");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await passcodeToken("2468-squat", "secret")).toBe(token);
    expect(await passcodeToken("2468-squaT", "secret")).not.toBe(token);
    expect(await passcodeToken("2468-squat", "other")).not.toBe(token);
  });

  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("feedToken", () => {
  it("is a stable 128-bit token that changes with the secret", async () => {
    const token = await feedToken("secret");
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await feedToken("secret")).toBe(token);
    expect(await feedToken("other")).not.toBe(token);
    // Never the passcode cookie, even with the same secret.
    expect((await passcodeToken("", "secret")).startsWith(token)).toBe(false);
  });
});

describe("proxy", () => {
  const original = { passcode: process.env.APP_PASSCODE, secret: process.env.APP_SECRET };
  afterEach(() => {
    process.env.APP_PASSCODE = original.passcode;
    process.env.APP_SECRET = original.secret;
    if (original.passcode === undefined) delete process.env.APP_PASSCODE;
    if (original.secret === undefined) delete process.env.APP_SECRET;
  });

  const request = (path: string, cookie?: string) =>
    new NextRequest(new URL(path, "https://workout.example"), {
      headers: cookie ? { cookie: `${AUTH_COOKIE}=${cookie}` } : {},
    });

  it("lets everything through when no passcode is configured", async () => {
    delete process.env.APP_PASSCODE;
    const response = await proxy(request("/api/training"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends pages to the unlock screen and refuses API calls without the cookie", async () => {
    process.env.APP_PASSCODE = "open sesame";
    process.env.APP_SECRET = "s3cret";

    const page = await proxy(request("/workout?x=1"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://workout.example/unlock?next=%2Fworkout%3Fx%3D1");

    const api = await proxy(request("/api/training"));
    expect(api.status).toBe(401);

    const wrong = await proxy(request("/api/training", "nope"));
    expect(wrong.status).toBe(401);

    expect((await proxy(request("/unlock"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/api/unlock"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("lets calendar apps reach the feed, which checks its own token, but not the link", async () => {
    process.env.APP_PASSCODE = "open sesame";
    process.env.APP_SECRET = "s3cret";
    expect((await proxy(request("/api/calendar/abc.ics"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/api/calendar"))).status).toBe(401);
  });

  it("accepts the right cookie", async () => {
    process.env.APP_PASSCODE = "open sesame";
    process.env.APP_SECRET = "s3cret";
    const cookie = await passcodeToken("open sesame", "s3cret");
    const response = await proxy(request("/api/training", cookie));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
