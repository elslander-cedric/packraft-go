// Round 2 acceptance tests for #55: a damaged autosave is backed up, never wiped.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { showTab, tripPanel } from "./support/planner";

const text = strings.accessPoints;
const KEY = "packraft-go.access-points";
const PREFIX = `${KEY}.backup-`;
const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
/** The trip panel, showing its Access points tab once `ready`. */
const panel = (page: Page) => tripPanel(page);
const backups = (page: Page) =>
  page.evaluate(
    (p) => Object.keys(localStorage).filter((k) => k.startsWith(p)).sort().map((k) => [k, localStorage.getItem(k)]),
    PREFIX,
  );

async function ready(page: Page) {
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  await showTab(page, strings.phone.tabs.accessPoints);
}

test("backup write fails: damaged save kept byte for byte and warned", async ({ page }) => {
  await serveOffline(page);
  await page.addInitScript(
    ([key, prefix]) => {
      if (!localStorage.getItem("seeded")) {
        localStorage.setItem("seeded", "1");
        localStorage.setItem(key!, "{corrupt");
      }
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k.startsWith(prefix!)) throw new DOMException("full", "QuotaExceededError");
        return orig.call(this, k, v);
      };
    },
    [KEY, PREFIX],
  );
  await page.goto("/");
  await ready(page);
  await expect(panel(page).getByRole("alert").filter({ hasText: text.damagedNotBackedUp })).toBeVisible();
  expect(await backups(page)).toEqual([]);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("{corrupt");
  // Still damaged and still unwritable after a reload: still kept, still no duplicates.
  await page.reload();
  await ready(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("{corrupt");
  expect(await backups(page)).toEqual([]);
});

test("repeated loads make one backup; a different later damage gets its own, the first stays", async ({ page }) => {
  await serveOffline(page);
  await page.goto("/");
  await ready(page);
  await page.evaluate((k) => localStorage.setItem(k, "{corrupt-one"), KEY);
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await ready(page);
  }
  let found = await backups(page);
  expect(found).toHaveLength(1);
  expect(found[0][1]).toBe("{corrupt-one");
  await expect(panel(page)).not.toContainText("damaged and couldn't be read"); // notice is for the load that found it
  // The same damaged text again (e.g. pasted back) is not backed up twice.
  await page.evaluate((k) => localStorage.setItem(k, "{corrupt-one"), KEY);
  await page.reload();
  await ready(page);
  expect(await backups(page)).toHaveLength(1);
  // Different damage: a second backup; the first is untouched.
  await page.evaluate((k) => localStorage.setItem(k, "{corrupt-two"), KEY);
  await page.reload();
  await ready(page);
  found = await backups(page);
  expect(found.map((f) => f[1]).sort()).toEqual(["{corrupt-one", "{corrupt-two"]);
});
