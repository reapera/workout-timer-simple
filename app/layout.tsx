import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/ServiceWorker";

import "./globals.css";

export const metadata: Metadata = {
  title: "Workout Timer",
  description: "A home dumbbell plan that progresses with you, plus a spoken interval timer.",
  // Home-screen install on iPhone: full screen, with its own name under the icon.
  appleWebApp: { capable: true, title: "Workout", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
  // The run screen is a fixed-height layout; zooming only gets in the way mid-set.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
