import type { MetadataRoute } from "next";
import { strings } from "@/ui/strings";

/** Paddle blue, the app icon's background (see public/icons/icon.svg). */
export const THEME_COLOR = "#1b6fb5";

/** The dark theme's surface (--color-surface in globals.css), for the phone's status bar (#141). */
export const DARK_THEME_COLOR = "#1c1c1e";

/**
 * The web app manifest (#56, ADR 0023): makes packraft-go installable on a
 * phone's home screen. Served by Next.js as /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.appTitle,
    short_name: strings.appTitle,
    description: strings.appDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The icon is drawn full-bleed with its drawing in the safe zone, so it can be masked too.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
