// The Sections tab (GLOSSARY: Section, ADR 0021): one row per section, with the totals of its
// legs and its legs' warnings (ADR 0029). A tap on the selected row opens it (#200).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { icons } from "../src/ui/icons/icons";
import { strings } from "../src/ui/strings";
import { iconIn } from "./support/icons";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import {
  readShownFigure,
  freeMapCentre,
  legLines,
  openPlanner,
  openSectionDetails,
  panelTab,
  points,
  sectionRowButton,
  showTab,
  toggleSection,
  tripPanel,
} from "./support/planner";

const text = strings.planner;
const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };

type Point = { lat: number; lng: number; elevation?: number };
type SeedLeg = { mode: "hike" | "paddle"; line?: readonly Point[] };

// On the Brussels canal; the Anderlecht lock is at the second point of the first paddle leg.
const pointA = { lat: 50.8175, lng: 4.3005, elevation: 30 };
const LOCK = { lat: 50.8196, lng: 4.3017, elevation: 26 };
const pointB = { lat: 50.8215, lng: 4.3028, elevation: 24 };
const pointC = { lat: 50.8265, lng: 4.3075, elevation: 20 };
const pointD = { lat: 50.8275, lng: 4.3085, elevation: 20 };
const pointE = { lat: 50.8285, lng: 4.3095, elevation: 20 };

async function seed(
  page: Page,
  trip: { points: readonly Point[]; legs: readonly SeedLeg[]; camps?: readonly number[] },
) {
  const save = JSON.stringify({
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "Sections",
      points: trip.points.map(({ lat, lng }) => ({ lat, lng })),
      legs: trip.legs.map(({ mode, line }) => ({
        mode,
        ...(line && { route: { status: "routed", geometry: line.map((point) => ({ elevation: 20, ...point })) } }),
      })),
      ...(trip.camps && { camps: trip.camps }),
      startDate: "2027-07-10",
    },
  });
  await page.addInitScript((tripSave) => {
    if (sessionStorage.getItem("seeded")) {
      return;
    }
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", tripSave);
  }, save);
}

// A hike, then two paddle legs (one through the lock), then a camp and a third paddle leg.
const canalTrip = {
  points: [pointD, pointA, pointB, pointC, pointE],
  legs: [
    { mode: "hike", line: [pointD, pointA] },
    { mode: "paddle", line: [pointA, LOCK, pointB] },
    { mode: "paddle", line: [pointB, pointC] },
    { mode: "paddle", line: [pointC, pointE] },
  ],
  camps: [3],
} as const;

const sectionRows = (page: Page) =>
  tripPanel(page).getByRole("list", { name: strings.sectionsPanelLabel }).locator("> li");
const legsOf = (page: Page, section: number) =>
  tripPanel(page)
    .getByRole("list", { name: text.sectionLegs(section) })
    .getByRole("listitem");
const rowButton = (row: Locator, name: string) => row.getByRole("button", { name, exact: false }).first();
const marked = (page: Page) => tripPanel(page).locator(".planner-row-toggle[aria-current]");
// Leaflet resets the map pane after a zoom, so a zoom shows in where a leg is drawn.
const drawn = (page: Page) => legLines(page).first().getAttribute("d");
async function deletePoint(page: Page, index: number) {
  const point = (await points(page).nth(index).boundingBox())!;
  await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
  await page.getByRole("button", { name: strings.deletePointButton }).click();
}
const sectionDialog = (page: Page) => page.getByRole("dialog", { name: /^Section \d+ · / });
const showSections = (page: Page) => showTab(page, text.tabs.sections);

test.use({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Brussels" });

test("the Sections tab comes first and is the one shown", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  // Normal mode's tabs; access point editing shows only its own (ADR 0036).
  await expect(tripPanel(page).getByRole("tab")).toHaveText([text.tabs.sections, text.tabs.days]);
  await expect(panelTab(page, text.tabs.sections)).toHaveAttribute("aria-selected", "true");
  await expect(tripPanel(page).getByText(strings.sectionsPanelEmpty)).toBeVisible();
});

test("a row per section, ending at a mode change or a camp, with the totals of its legs", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await showSections(page);

  await expect(sectionRows(page)).toHaveCount(3);
  const paddle = sectionRows(page).nth(1);
  await expect(sectionRows(page).nth(0)).toContainText(strings.legRange(1, 1));
  await expect(paddle).toContainText(strings.legRange(2, 3));
  await expect(sectionRows(page).nth(2)).toContainText(strings.legRange(4, 4));
  await expect(iconIn(paddle, icons.paddle)).toBeVisible();

  // Net drop from the first put-in to the last take-out: 30 m to 20 m.
  expect(await readShownFigure(paddle, text.legFigures.drop)).toBe("10 m");
});

test("a section shows its legs' warnings on the row, and each leg's details in a dialog", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await showSections(page);

  const paddle = sectionRows(page).nth(1);
  await expect(paddle.locator('svg[data-icon="stairs"]')).toHaveCount(1);

  const dialog = await openSectionDetails(page, 2);
  await expect(dialog.getByRole("heading", { name: strings.legLabel(2), exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: strings.legLabel(3), exact: true })).toBeVisible();
  await expect(dialog.locator(".access-warning-lock")).toHaveCount(1);
  await expect(dialog.locator(".access-warning-lock")).toContainText(
    strings.tripAccess.lockWarning("Écluse d'Anderlecht - Sluis van Anderlecht"),
  );
  await dialog.getByRole("button", { name: text.legDetailsClose }).click();
  await expect(sectionDialog(page)).toHaveCount(0);
});

test("tapping a row zooms the map to the section and marks it", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);

  const button = rowButton(sectionRows(page).nth(1), strings.sectionLabel(2));
  const before = await drawn(page);
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "true");
  await expect.poll(() => drawn(page)).not.toBe(before);
  await expect(marked(page)).toHaveCount(1);
});

test("a tap on the selected section opens and closes it, and zooms back each time", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);

  const row = sectionRowButton(page, 2);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(legsOf(page, 2)).toHaveCount(0);

  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toHaveAttribute("aria-expanded", "false");

  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(legsOf(page, 2)).toHaveCount(2);
  await expect(legsOf(page, 2).nth(0)).toContainText(strings.legLabel(2));
  await expect(legsOf(page, 2).nth(1)).toContainText(strings.legLabel(3));

  await row.click();
  await expect(legsOf(page, 2)).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
});

test("the map goes back to the selected section as it opens", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await sectionRowButton(page, 2).click();
  await expect(sectionRowButton(page, 2)).toHaveAttribute("aria-current", "true");

  const centre = await freeMapCentre(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => drawn(page)).toBeTruthy();
  const zoomedOut = await drawn(page);

  // By keyboard, which works as a tap does.
  await sectionRowButton(page, 2).focus();
  await page.keyboard.press("Enter");
  await expect(sectionRowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => drawn(page)).not.toBe(zoomedOut);
});

test("a section's details button opens the dialog and leaves the row as it was, open or closed", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await expect(sectionRows(page).nth(1).locator('svg[data-icon="stairs"]')).toHaveCount(1);

  const button = tripPanel(page).getByRole("button", { name: text.sectionDetailsButton(2) });
  await expect(button).toHaveText(text.rowDetailsLine);
  await button.click();
  await expect(sectionDialog(page)).toBeVisible();
  await sectionDialog(page).getByRole("button", { name: text.legDetailsClose }).click();
  await expect(sectionRowButton(page, 2)).toHaveAttribute("aria-expanded", "false");
  await expect(sectionRowButton(page, 2)).not.toHaveAttribute("aria-current", "true");

  await toggleSection(page, 2);
  await button.click();
  await expect(sectionDialog(page)).toBeVisible();
  await sectionDialog(page).getByRole("button", { name: text.legDetailsClose }).click();
  await expect(sectionRowButton(page, 2)).toHaveAttribute("aria-expanded", "true");
});

test("a leg's details button shows that leg alone", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await toggleSection(page, 2);

  await tripPanel(page)
    .getByRole("button", { name: text.legDetailsButton(3) })
    .click();
  const dialog = page.getByRole("dialog", { name: /^Leg 3 · / });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: text.legDetailsClose }).click();
  await expect(legsOf(page, 2)).toHaveCount(2);
  await expect(rowButton(legsOf(page, 2).nth(1), strings.legLabel(3))).not.toHaveAttribute("aria-current", "true");
});

test("the details button sits under the time, at the right of the row's last line", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await page.evaluate(() => document.fonts.ready);

  const row = sectionRows(page).nth(1);
  const button = await tripPanel(page)
    .getByRole("button", { name: text.sectionDetailsButton(2) })
    .boundingBox();
  const time = await row.locator(".planner-row-time").first().boundingBox();
  const icons = await row.locator(".planner-row-access").first().boundingBox();
  const line = await row.locator(".planner-row-toggle").first().boundingBox();
  expect(button && time && icons && line).toBeTruthy();
  expect(button!.y).toBeGreaterThanOrEqual(time!.y + time!.height);
  expect(Math.abs(button!.x + button!.width - (time!.x + time!.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(button!.y + button!.height - (line!.y + line!.height))).toBeLessThanOrEqual(1);
  // The icons keep clear of the button's text, however many there are.
  const iconsRight = await row
    .locator(".planner-row-access")
    .first()
    .evaluate((el) => {
      const icons = [...el.children].map((child) => child.getBoundingClientRect().right);
      return Math.max(...icons);
    });
  const label = await tripPanel(page)
    .getByRole("button", { name: text.sectionDetailsButton(2) })
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().left;
    });
  expect(iconsRight).toBeLessThanOrEqual(label);
});

test("a section of hike legs opens to its legs alone", async ({ page }) => {
  await serveOffline(page);
  await seed(page, {
    points: [pointD, pointA, pointB],
    legs: [
      { mode: "hike", line: [pointD, pointA] },
      { mode: "hike", line: [pointA, pointB] },
    ],
  });
  await openPlanner(page);
  await toggleSection(page, 1);
  await expect(legsOf(page, 1)).toHaveCount(2);
  await expect(tripPanel(page).getByRole("button", { name: text.sectionDetailsButton(1) })).toHaveCount(0);
});

test("a second tap on a selected section of one leg only zooms, and a hike without details has no button", async ({
  page,
}) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await expect(sectionRows(page).nth(2).locator(".leg-access-icons")).toBeVisible();

  // The hike has no details and nothing to open.
  await expect(sectionRows(page).nth(0).locator("[aria-expanded]")).toHaveCount(0);
  await expect(tripPanel(page).getByRole("button", { name: text.sectionDetailsButton(1) })).toHaveCount(0);

  await sectionRowButton(page, 3).click();
  await expect(sectionRowButton(page, 3)).toHaveAttribute("aria-current", "true");
  await sectionRowButton(page, 3).click();
  await expect(sectionDialog(page)).toHaveCount(0);
  await expect(sectionRows(page).nth(2).locator("[aria-expanded]")).toHaveCount(0);
  await expect(tripPanel(page).getByRole("button", { name: text.sectionDetailsButton(3) })).toBeVisible();
});

test("a second tap on a shown leg only zooms", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await toggleSection(page, 2);

  const leg = rowButton(legsOf(page, 2).nth(1), strings.legLabel(3));
  await leg.click();
  await expect(leg).toHaveAttribute("aria-current", "true");
  await leg.click();
  await expect(legsOf(page, 2)).toHaveCount(2);
  await expect(sectionDialog(page)).toHaveCount(0);
  await expect(leg).not.toHaveAttribute("aria-expanded");
});

test.describe("on a phone with the sheet raised", () => {
  test.use({ viewport: { width: 390, height: 640 }, hasTouch: true });

  test("the row tapped stays in view, with the legs it opened", async ({ page }) => {
    await serveOffline(page);
    await seed(page, {
      points: [pointD, pointA, LOCK, pointB, pointC, pointE],
      legs: [
        { mode: "hike", line: [pointD, pointA] },
        { mode: "paddle", line: [pointA, LOCK] },
        { mode: "hike", line: [LOCK, pointB] },
        { mode: "paddle", line: [pointB, pointC] },
        { mode: "paddle", line: [pointC, pointE] },
      ],
    });
    await page.goto("/");
    const handle = page.getByRole("slider", { name: text.resizeSheetHandle });
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");

    const list = page.getByRole("list", { name: strings.sectionsPanelLabel });
    const row = list.locator("> li").last().getByRole("button").first();
    await row.click();
    await expect(row).toBeInViewport({ ratio: 1 });
    await row.click();
    await expect(
      page
        .getByRole("list", { name: text.sectionLegs(4) })
        .getByRole("listitem")
        .last(),
    ).toBeInViewport();
  });
});

test("a shown leg has its own figures, warning icons and details, but no Retry", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await toggleSection(page, 2);

  const [throughLock, after] = [legsOf(page, 2).nth(0), legsOf(page, 2).nth(1)];
  // A leg's drop, not the section's net 10 m: 30 m to 24 m, then 24 m to 20 m.
  expect(await readShownFigure(throughLock, text.legFigures.drop)).toBe("6 m");
  expect(await readShownFigure(after, text.legFigures.drop)).toBe("4 m");
  await expect(throughLock.locator('svg[data-icon="stairs"]')).toHaveCount(1);
  await expect(after.locator('svg[data-icon="stairs"]')).toHaveCount(0);
  await expect(throughLock.getByRole("button", { name: strings.retryRouting })).toHaveCount(0);
  await expect(throughLock.getByRole("button", { name: text.legDetailsButton(2) })).toBeVisible();
});

test("tapping a shown leg zooms to it, and one row stays marked between sections and legs", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await toggleSection(page, 2);

  const section = rowButton(sectionRows(page).nth(1), strings.sectionLabel(2));
  const leg = rowButton(legsOf(page, 2).nth(1), strings.legLabel(3));
  await expect(section).toHaveAttribute("aria-current", "true");

  const before = await drawn(page);
  await leg.click();
  await expect(leg).toHaveAttribute("aria-current", "true");
  await expect.poll(() => drawn(page)).not.toBe(before);
  await expect(marked(page)).toHaveCount(1);
  // Its left bar marks the leg alone, not the section around it too.
  const bar = (row: Locator) => row.evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(await bar(legsOf(page, 2).nth(1))).not.toBe(await bar(sectionRows(page).nth(1)));

  await section.click();
  await expect(section).toHaveAttribute("aria-current", "true");
  await expect(marked(page)).toHaveCount(1);
});

test("shown legs stay open across tabs, side by side, and through an edit further on", async ({ page }) => {
  await serveOffline(page);
  await seed(page, {
    points: [pointD, pointA, pointB, pointC, pointE],
    legs: [
      { mode: "hike", line: [pointD, pointA] },
      { mode: "hike", line: [pointA, pointB] },
      { mode: "paddle", line: [pointB, pointC] },
      { mode: "paddle", line: [pointC, pointE] },
    ],
  });
  await openPlanner(page);
  await toggleSection(page, 1);
  await toggleSection(page, 2);
  await expect(legsOf(page, 1)).toHaveCount(2);
  await expect(legsOf(page, 2)).toHaveCount(2);

  await showTab(page, text.tabs.days);
  await showTab(page, text.tabs.sections);
  await expect(legsOf(page, 1)).toHaveCount(2);
  await expect(legsOf(page, 2)).toHaveCount(2);

  // Deleting the last point leaves section 2 with one leg, which closes it; section 1 is untouched.
  await deletePoint(page, 4);
  await expect(sectionRowButton(page, 2)).not.toHaveAttribute("aria-expanded");
  await expect(legsOf(page, 1)).toHaveCount(2);
});

test("a section closes when no section of several legs starts at its first leg", async ({ page }) => {
  await serveOffline(page);
  await seed(page, canalTrip);
  await openPlanner(page);
  await toggleSection(page, 2);

  // Deleting the point between its two legs merges them into one.
  await deletePoint(page, 2);
  await expect(sectionRows(page)).toHaveCount(3);
  await expect(tripPanel(page).locator(".planner-section-legs")).toHaveCount(0);
});

test("a section whose legs are waiting for routes says so once", async ({ page }) => {
  await serveOffline(page, { brouter: () => new Promise<BRouterReply>(() => {}) });
  await seed(page, { points: [pointD, pointA, pointB], legs: [{ mode: "hike" }, { mode: "hike" }] });
  await openPlanner(page);
  await showSections(page);
  await expect(sectionRows(page).first().getByRole("status")).toHaveText(strings.legRouting);
});

test("each failed leg shows by number with its own Retry", async ({ page }) => {
  let up = false;
  const network = await serveOffline(page, { brouter: () => (up ? TRAIL : { status: 503, body: "" }) });
  await seed(page, {
    points: [pointD, pointA, pointB, pointC],
    legs: [{ mode: "hike" }, { mode: "hike", line: [pointA, pointB] }, { mode: "hike" }],
  });
  await openPlanner(page);
  await showSections(page);

  const row = sectionRows(page).first();
  await expect(row.getByRole("alert")).toHaveText([
    text.sectionLegFailed(1, strings.legRouteFailed.unavailable),
    text.sectionLegFailed(3, strings.legRouteFailed.unavailable),
  ]);
  up = true;
  const asked = network.brouter.length;
  await row.getByRole("button", { name: strings.retryRouting }).first().click();
  await expect(row.getByRole("alert")).toHaveText([text.sectionLegFailed(3, strings.legRouteFailed.unavailable)]);
  expect(network.brouter.length).toBe(asked + 1);
});

test("a failed section's details button drops under its Retry, and comes back with the route", async ({ page }) => {
  let up = false;
  await serveOffline(page, { brouter: () => (up ? RIVER : { status: 503, body: "" }) });
  await seed(page, { points: [pointA, pointB], legs: [{ mode: "paddle" }] });
  await openPlanner(page);
  await showSections(page);

  const row = sectionRows(page).first();
  const button = row.getByRole("button", { name: text.sectionDetailsButton(1) });
  const retry = row.getByRole("button", { name: strings.retryRouting });
  await expect(retry).toBeVisible();
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await retry.boundingBox())!.y + (await retry.boundingBox())!.height,
  );
  up = true;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(
    row.locator(".planner-row-head").getByRole("button", { name: text.sectionDetailsButton(1) }),
  ).toBeVisible();
});

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

  test("the tabs fit side by side, and no label is cut off (#70)", async ({ page }) => {
    await serveOffline(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const sheet = page.getByRole("dialog", { name: text.sheetLabel });
    const tabs = sheet.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    for (const tab of await tabs.all()) {
      await expect(tab).toBeInViewport({ ratio: 1 });
      const fits = await tab.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits).toBe(true);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("the tab keeps its name for screen readers", async ({ page }) => {
  await serveOffline(page);
  await openPlanner(page);
  await expect(panelTab(page, text.tabs.sections)).toBeVisible();
  await expect(tripPanel(page).getByRole("tablist", { name: text.tabsLabel })).toBeVisible();
});
