// #85 acceptance: "Checking flow…" is the first thing a leg dated today shows.
// A MutationObserver records every status text from the first render, so
// "never open in between" is a check on the whole history, not on one moment. A leg row shows
// its status as an icon named for screen readers (ADR 0034); the day's chips are in the Days tab.
import { expect, test } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { delayedKiwis, kiwisFixtures, serveOffline } from "./support/offline";
import { openPlanner, showTab } from "./support/planner";

const RECORDED_AT = new Date("2026-10-14T09:00:00+02:00");
const RECORDED = kiwisFixtures("timeseries-list.json", "timeseries-values.json");
const FAILING = () => ({ status: 503, body: "" });

/** A paddle leg along the Semois (stretch 1.B.4c). */
const semois = [
  { lat: 49.74536, lng: 5.25046 },
  { lat: 49.74547, lng: 5.24971 },
  { lat: 49.74579, lng: 5.24932 },
  { lat: 49.74665, lng: 5.24897 },
];

const save = (startDate: string) =>
  JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Semois",
      points: [semois[0], semois[semois.length - 1]],
      legs: [{ mode: "paddle", route: { status: "routed", geometry: semois.map((p) => ({ ...p, elevation: 200 })) } }],
      startDate,
    },
  });

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

async function watchStatuses(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const record = () => {
      for (const el of document.querySelectorAll(".leg-access-icons, .day-warning-chip")) {
        const text = `${el.className}|${el.textContent}`;
        if (seen[seen.length - 1] !== text) seen.push(text);
      }
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
const history = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);

test("status history is checking, then closed: open never appears; nothing leaks into the saved trip (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(RECORDED);
  const network = await serveOffline(page, { kiwis: held.kiwis });
  await watchStatuses(page);
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), save("2026-10-14"));
  await openPlanner(page);
  const leg = page.getByRole("list", { name: strings.legsPanelLabel }).locator(".phone-row").first();
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessChecking);
  await expect.poll(() => network.kiwis.length).toBeGreaterThan(0);
  // The day's chip makes no claim about the flow while checking: the two aire warnings stay
  // visible, and only the flow-dependent closed warning waits (ADR 0029).
  await showTab(page, strings.phone.tabs.days);
  const chip = page.locator(".day-warning-chip");
  const { chipKind, chipMore } = strings.tripAccess;
  await expect(chip).toContainText(chipKind.aire);
  await expect(chip).toContainText(chipMore(1));
  held.release();
  await expect(chip).toContainText(chipKind.closed);
  await expect(chip).toContainText(chipMore(2));
  await showTab(page, strings.phone.tabs.legs);
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessState["closed-today"]);

  const seen = await history(page);
  expect(seen[0]).toContain(strings.accessChecking);
  expect(seen.some((s) => s.includes(strings.accessState["closed-today"]))).toBe(true);
  expect(seen.filter((s) => s.includes("access-status-open") || s.includes(strings.accessState.open))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("packraft-go.trip"))).not.toContain("checking");
});

test("a failing service ends unknown, never open, in the whole history (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(FAILING);
  await serveOffline(page, { kiwis: held.kiwis });
  await watchStatuses(page);
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), save("2026-10-14"));
  await openPlanner(page);
  const leg = page.getByRole("list", { name: strings.legsPanelLabel }).locator(".phone-row").first();
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessChecking);
  held.release();
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessState.unknown);
  const seen = await history(page);
  expect(seen.filter((s) => s.includes("access-status-open"))).toEqual([]);
});

test("another date is never checking and asks no flows (#85)", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  const held = delayedKiwis(RECORDED);
  const network = await serveOffline(page, { kiwis: held.kiwis });
  await watchStatuses(page);
  await page.addInitScript((s) => localStorage.setItem("packraft-go.trip", s), save("2026-10-20"));
  await openPlanner(page);
  const leg = page.getByRole("list", { name: strings.legsPanelLabel }).locator(".phone-row").first();
  await expect(leg.locator(".leg-access-icons")).toContainText(strings.accessState.open);
  expect((await history(page)).filter((s) => s.includes(strings.accessChecking))).toEqual([]);
  expect(network.kiwis).toHaveLength(0);
});
