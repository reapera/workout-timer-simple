"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production builds (dev reloads would fight it). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  }, []);
  return null;
}
