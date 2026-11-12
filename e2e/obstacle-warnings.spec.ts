// #215: a paddle leg that passes an obstacle shows a warning on the leg and a chip on its
// day; several on one leg stay readable. Uses the built-in snapshot of 2026-11-02.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import { legDetailsDialog, leafRows, openPlanner, openSectionDetails, showAllLegs, showTab } from "./support/planner";

type Place = { lat: number; lng: number };

const DAM: Place = { lng: 5.11601, lat: 50.15888 }; // SPW id 85
// Stretch 1A3c of the Ourthe past the dam with SPW id 96: listed water, so with no start date
// nothing outranks the obstacle on the day's chip.
const PAST_A_DAM_ON_LISTED_WATER: Place[] = [
  { lng: 5.53814, lat: 50.42888 },
  { lng: 5.53862, lat: 50.43003 },
  { lng: 5.53876, lat: 50.43077 },
  { lng: 5.53875, lat: 50.43159 },
  { lng: 5.53774, lat: 50.43317 },
];
const IMPASSABLE: Place = { lng: 5.69328, lat: 50.12747 }; // SPW id 149
// Two drossages, a dam and a low bridge, in that order along the Lesse, with no other near.
const SEVERAL: Place[] = [
  { lng: 5.14006, lat: 50.06522 }, // 122
  { lng: 5.14063, lat: 50.06474 }, // 123
  { lng: 5.14039, lat: 50.05708 }, // 80
  { lng: 5.13599, lat: 50.05362 }, // 154
];

/** A leg along a line of latitude, through `at` or `offLat` degrees north of it. */
const through = ({ lat, lng }: Place, offLat = 0): Place[] => [
  { lat: lat + offLat, lng: lng - 0.002 },
  { lat: lat + offLat, lng },
  { lat: lat + offLat, lng: lng + 0.002 },
];

async function seed(page: Page, line: Place[]) {
  const save = {
    format: "packraft-go-trip",
    version: 1,
    trip: {
      name: "River",
      points: [line[0], line[line.length - 1]],
      legs: [
        { mode: "paddle", route: { status: "routed", geometry: line.map((place) => ({ ...place, elevation: 200 })) } },
      ],
    },
  };
  await page.addInitScript((trip) => {
    if (sessionStorage.getItem("seeded")) {
      return;
    }
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("packraft-go.trip", trip);
  }, JSON.stringify(save));
}

const warnings = (page: Page) => legDetailsDialog(page).locator(".access-warning-obstacle");
const credit = (page: Page) => legDetailsDialog(page).locator(".leg-access-credit");
const legRow = (page: Page) => page.getByRole("list", { name: strings.sectionsPanelLabel }).locator(leafRows).first();
const closeDetails = (page: Page) =>
  legDetailsDialog(page).getByRole("button", { name: strings.planner.legDetailsClose }).click();
const dayChip = (page: Page) =>
  page
    .getByRole("complementary", { name: strings.daysPanelLabel })
    .getByRole("group", { name: strings.tripAccess.dayWarningsLabel })
    .getByRole("button");

const { names, meanings } = strings.obstacles;
const line = (name: string, meaning: string, count = 1) =>
  `${strings.tripAccess.obstacleWarning(name, count)} ${meaning}`;

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.beforeEach(({ page }) => showAllLegs(page));

  test("a leg past a dam says to check it, with an icon on its row and a chip on its day", async ({ page }) => {
    await serveOffline(page);
    await seed(page, PAST_A_DAM_ON_LISTED_WATER);
    await openPlanner(page);

    await expect(legRow(page).locator(`svg[data-icon="triangle-exclamation"]`)).toHaveCount(1);
    await expect(legRow(page).locator(".leg-access-icons")).toContainText(strings.tripAccess.chipKind.obstacle);
    await openSectionDetails(page, 1);
    await expect(warnings(page)).toHaveCount(1);
    await expect(credit(page).getByRole("link", { name: strings.flow.credit })).toBeVisible();
    await expect(warnings(page)).toContainText(line(names.dam, meanings.dam));
    await expect(warnings(page).getByRole("link", { name: /SPW/ })).toBeVisible();
    await closeDetails(page);

    // The day only points at the leg (ADR 0029).
    await showTab(page, strings.planner.tabs.days);
    await expect(dayChip(page)).toContainText(strings.tripAccess.chipKind.obstacle);
  });

  test("a leg past an impassable point says portage is required", async ({ page }) => {
    await serveOffline(page);
    await seed(page, through(IMPASSABLE));
    await openPlanner(page);
    await openSectionDetails(page, 1);
    await expect(warnings(page)).toContainText(line(names.impassable, meanings.impassable));
    await expect(warnings(page)).toContainText(/portage required/i);
  });

  test("a leg that doesn't pass an obstacle has no warning", async ({ page }) => {
    await serveOffline(page);
    await seed(page, through(DAM, 0.002)); // About 220 m to the north.
    await openPlanner(page);
    await expect(legRow(page).locator(".leg-access-icons")).toBeVisible();
    await expect(legRow(page).locator(`svg[data-icon="triangle-exclamation"]`)).toHaveCount(0);
    await openSectionDetails(page, 1);
    await expect(legDetailsDialog(page)).toBeVisible();
    await expect(warnings(page)).toHaveCount(0);
  });

  test("several obstacles on one leg read as one line per kind, in the order the leg meets them", async ({ page }) => {
    await serveOffline(page);
    await seed(page, SEVERAL);
    await openPlanner(page);
    await expect(legRow(page).locator(`svg[data-icon="triangle-exclamation"]`)).toHaveCount(1);
    await openSectionDetails(page, 1);
    await expect(warnings(page)).toHaveCount(3);
    await expect(warnings(page).nth(0)).toContainText(line(names.drossage, meanings.drossage, 2));
    await expect(warnings(page).nth(1)).toContainText(line(names.dam, meanings.dam));
    await expect(warnings(page).nth(2)).toContainText(line(names["low-bridge"], meanings["low-bridge"]));
  });
});

test.describe("on the phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a leg past several obstacles shows the warning's icon on its row, once", async ({ page }) => {
    await serveOffline(page);
    await seed(page, SEVERAL);
    await page.goto("/");
    const sheet = page.getByRole("dialog", { name: strings.planner.sheetLabel });
    await sheet.getByRole("tab", { name: strings.planner.tabs.sections }).click();
    const icons = sheet
      .getByRole("list", { name: strings.sectionsPanelLabel })
      .locator(leafRows)
      .first()
      .locator(".leg-access-icons");
    await expect(icons.locator(`svg[data-icon="triangle-exclamation"]`)).toHaveCount(1);
    await expect(icons).toContainText(strings.tripAccess.chipKind.obstacle);
  });
});
