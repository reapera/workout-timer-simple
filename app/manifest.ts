import type { MetadataRoute } from "next";

/** Lets the app be installed to the home screen and open full screen, like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Workout — home dumbbell plan",
    short_name: "Workout",
    description: "Today's dumbbell workout, tracked and progressed for you, plus a spoken interval timer.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06070a",
    theme_color: "#06070a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today's workout", url: "/" },
      { name: "Progress", url: "/progress" },
      { name: "Interval timer", url: "/timer" },
    ],
  };
}
