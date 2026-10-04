/*
 * Offline support for the installed app.
 *
 * - Pages: network first, falling back to the last copy seen, so the app
 *   opens without signal. Today's plan and workouts already keep their own
 *   offline copies in the browser; this makes sure the app shell loads too.
 * - Build files and exercise pictures: cache first. Build files have content
 *   hashes in their names, so a cached copy is never stale.
 * - /api is never touched: live data and uploads stay with the app's own
 *   offline queue.
 */

const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_ASSETS = 300;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, ASSETS];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request));
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/exercises/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(asset(request));
  }
});

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Never keep the unlock screen (or any redirect) as a page's offline copy.
    if (response.ok && !response.redirected) await cache.put(request, response.clone());
    return response;
  } catch {
    // Only the page that was asked for: another page's HTML at this URL would confuse the app.
    return (await cache.match(request, { ignoreSearch: true })) || offline();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    // Oldest first: drop build files from long-gone deploys.
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
  }
  return response;
}

function offline() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Offline</title>" +
      '<body style="background:#06070a;color:#f4f6fb;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:0 20px;text-align:center">' +
      "<div><h1 style=\"font-size:20px\">You're offline</h1>" +
      '<p style="color:rgb(255 255 255 / .6)">This page hasn\'t been opened on this phone yet, so there\'s no offline copy of it.</p>' +
      '<p><a href="/" style="color:#2ee66b;font-weight:600">Back to today\'s plan</a></p></div>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
