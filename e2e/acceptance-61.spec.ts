// Acceptance tests for #61 (live Walloon flows). KiWIS is always
// intercepted; no test calls the live service.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { kiwisFixture, kiwisFixtures, serveOffline } from "./support/offline";

const RECORDED_AT = new Date("2026-10-14T09:00:00+02:00");
const SEMOIS = "walloon-1B4c";
const AMBLEVE = "walloon-1B1a";

test.use({ viewport: { width: 1400, height: 900 } });

const water = (page: Page, id: string) => page.locator(`path.access-record-${id}`);
const detail = (page: Page) => page.getByRole("region", { name: strings.accessDetailLabel });

async function clickWater(page: Page, id: string) {
  const at = await water(page, id).evaluate((path: SVGPathElement) => {
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(at.x, at.y);
}

async function openAccessLayer(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("region", { name: strings.mapLabel }).locator(".leaflet-container")).toBeVisible();
  await page.getByRole("switch", { name: strings.accessLayerToggle }).click();
}

/** The recorded values with every 08:00 reading raised far above any maximum. */
function highAt8(url: URL) {
  if (url.searchParams.get("request") === "getTimeseriesList") {
    return { status: 200, body: kiwisFixture("timeseries-list.json") };
  }
  const entries = JSON.parse(kiwisFixture("timeseries-values.json")) as { data: [string, number][] }[];
  for (const e of entries) for (const row of e.data) if (row[0].includes("T08:00")) row[1] = 9999;
  return { status: 200, body: JSON.stringify(entries) };
}

for (const timezoneId of ["Europe/Brussels", "UTC", "Pacific/Auckland"]) {
  test.describe(`time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("high flow at 08:00 closes an open stretch, labelled as measured flow", async ({ page }) => {
      await page.clock.setFixedTime(RECORDED_AT);
      const network = await serveOffline(page, { kiwis: highAt8 });
      await openAccessLayer(page);
      await expect(water(page, AMBLEVE)).toHaveClass(/access-closed-today/);
      await clickWater(page, AMBLEVE);
      await expect(detail(page)).toContainText("Closed today: high flow");
      await expect(detail(page)).toContainText("based on measured flow; the official status may differ");
      expect(network.kiwis.length).toBeLessThanOrEqual(2);
      expect(network.blocked).toEqual([]);
    });

    test("recorded flows: low flow still closes the Semois", async ({ page }) => {
      await page.clock.setFixedTime(RECORDED_AT);
      await serveOffline(page, { kiwis: kiwisFixtures("timeseries-list.json", "timeseries-values.json") });
      await openAccessLayer(page);
      await expect(water(page, SEMOIS)).toHaveClass(/access-closed-today/);
    });
  });
}

test("stale data (recording replayed a day later) shows unknown with the kayak link", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T09:00:00+02:00"));
  await serveOffline(page, { kiwis: kiwisFixtures("timeseries-list.json", "timeseries-values.json") });
  await openAccessLayer(page);
  await expect(water(page, SEMOIS)).toHaveClass(/access-unknown/);
  await clickWater(page, SEMOIS);
  await expect(detail(page)).toContainText("72-hour mean flow isn't from today");
  await expect(detail(page).getByRole("link", { name: "SPW: kayak status today" })).toBeVisible();
});

test("a malformed KiWIS answer is unknown, not a crash", async ({ page }) => {
  await page.clock.setFixedTime(RECORDED_AT);
  await serveOffline(page, { kiwis: () => ({ status: 200, body: "<html>not json</html>" }) });
  await openAccessLayer(page);
  await expect(water(page, SEMOIS)).toHaveClass(/access-unknown/);
  await clickWater(page, SEMOIS);
  await expect(detail(page)).toContainText("Flow unknown");
});
