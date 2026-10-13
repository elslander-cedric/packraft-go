"use client";

import { useEffect } from "react";

/** Same-origin build files (scripts, styles) the page has loaded so far. */
function loadedBuildFiles(): string[] {
  const urls = [
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ...Array.from(document.scripts, (script) => script.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => link.href),
  ];
  return [...new Set(urls)].filter((url) => {
    if (!url) return false;
    const { origin, pathname } = new URL(url, location.href);
    return origin === location.origin && pathname.startsWith("/_next/static/");
  });
}

/**
 * Registers the service worker (public/sw.js, #56) so the app shell opens
 * offline. Production builds only: in development, build files change on every
 * edit and must not be kept. Renders nothing.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      // Files loaded before the worker took over didn't pass through it; hand them over to keep.
      .then((registration) => registration.active?.postMessage({ type: "cache-build-files", urls: loadedBuildFiles() }))
      .catch(() => {
        // Without a service worker the app still works online.
      });
  }, []);
  return null;
}
