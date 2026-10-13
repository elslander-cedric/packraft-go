// The hand-written service worker (public/sw.js, #56): which requests it
// answers. It caches the app shell only; map tiles, BRouter and every other
// service are left to the network (and to the e2e tests' interception).
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://packraft-go.example";

type Listener = (event: unknown) => void;

/** Runs the service worker script in a stand-in worker scope and returns its listeners. */
function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  // Requests never settle: these tests only look at which requests are answered.
  const pending = () => new Promise(() => {});
  const caches = { match: pending, open: pending, keys: pending, delete: pending };
  vm.runInNewContext(SOURCE, { self: scope, caches, fetch: pending, URL, Promise, Response });
  return listeners;
}

/** Sends one fetch event; true when the service worker answers it. */
function answers(request: { url: string; method?: string; mode?: string }) {
  const respondWith = vi.fn();
  loadServiceWorker().get("fetch")!({
    request: { method: "GET", mode: "no-cors", ...request },
    respondWith,
  });
  return respondWith.mock.calls.length > 0;
}

describe("service worker", () => {
  it("installs, activates and listens for fetches", () => {
    expect([...loadServiceWorker().keys()].sort()).toEqual(["activate", "fetch", "install", "message"]);
  });

  it("answers page loads and the app's own files", () => {
    expect(answers({ url: `${ORIGIN}/`, mode: "navigate" })).toBe(true);
    expect(answers({ url: `${ORIGIN}/_next/static/chunks/app.js` })).toBe(true);
    expect(answers({ url: `${ORIGIN}/_next/static/css/app.css` })).toBe(true);
    expect(answers({ url: `${ORIGIN}/manifest.webmanifest` })).toBe(true);
    expect(answers({ url: `${ORIGIN}/icons/icon-192.png` })).toBe(true);
  });

  it("leaves map tiles, BRouter and other services to the network", () => {
    expect(answers({ url: "https://a.tile.opentopomap.org/12/2130/1390.png" })).toBe(false);
    expect(answers({ url: "https://brouter.de/brouter?lonlats=5.4,50.2|5.5,50.3&profile=hiking-mountain" })).toBe(false);
    expect(answers({ url: "https://hydrometrie.wallonie.be/services/KiWIS/KiWIS?request=getTimeseriesValues" })).toBe(
      false,
    );
  });

  it("never answers anything but GET", () => {
    expect(answers({ url: `${ORIGIN}/`, method: "POST", mode: "navigate" })).toBe(false);
  });

  it("leaves other same-origin requests, such as data prefetches, to the network", () => {
    expect(answers({ url: `${ORIGIN}/?_rsc=abc` })).toBe(false);
    expect(answers({ url: `${ORIGIN}/favicon.ico` })).toBe(false);
  });
});
