// Acceptance tests for #5 (paddle legs snap to rivers).
// BRouter is answered from recorded fixtures; a river-profile failure is
// hand-made (BRouter's 400 routing-error reply), since no river no-route was
// recorded. No live service is called (ADR 0019).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";
import { freeMapCentre, legLines, legRows as rows, mapClicker, mapRegion, nextLegMode, openPlanner } from "./support/planner";

const profiles = (urls: URL[]) => urls.map((u) => u.searchParams.get("profile"));

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const RIVER_NO_ROUTE: BRouterReply = { status: 400, body: "target island detected for section 0" };

async function openMap(page: Page) {
  await openPlanner(page);
  return mapClicker(page);
}

/** The map's free centre's x, for markers placed at offsets from it. */
const centreX = async (page: Page) => (await freeMapCentre(page)).x;

// Updated for ADR 0034: a leg's mode is picked with the next leg's mode toggle when it is drawn.
test("AC1/AC3: a leg is drawn with the next leg's mode; paddle legs look different in the panel and on the map", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await expect(nextLegMode(page, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await clickMap(-100, 0);
  await clickMap(0, 0, "paddle");
  await clickMap(100, 0, "hike");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toHaveClass(/planner-row-paddle/);
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-hike/);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);

  const [paddleStyle, hikeStyle] = await Promise.all(
    [0, 1].map((i) =>
      legLines(page)
        .nth(i)
        .evaluate((el) => ({ stroke: el.getAttribute("stroke"), width: el.getAttribute("stroke-width") })),
    ),
  );
  expect(paddleStyle.stroke).not.toBe(hikeStyle.stroke);
  // In the panel, the row's distance icon has the mode's colour.
  const [paddleIcon, hikeIcon] = await Promise.all(
    [0, 1].map((i) =>
      rows(page)
        .nth(i)
        .locator(".planner-row-distance .planner-row-figure-icon")
        .evaluate((el) => getComputedStyle(el).color),
    ),
  );
  expect(paddleIcon).not.toBe(hikeIcon);
  expect(profiles(network.brouter)).toEqual(["river", "hiking-mountain"]);
  expect(network.blocked).toEqual([]);
});

test("picking the next leg's mode sends no request and adds no undo step", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => TRAIL });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  for (const mode of ["paddle", "hike", "paddle", "paddle"] as const) {
    await nextLegMode(page, mode === "hike" ? strings.legModeHike : strings.legModePaddle).click();
  }
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(rows(page).nth(0)).toHaveClass(/planner-row-hike/);
  expect(network.brouter).toHaveLength(1);

  // One undo removes the last point (the most recent real edit), not a pick.
  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect(rows(page)).toHaveCount(0);
});

test("a paddle leg is routed on the river once; Ctrl+Z removes it and drawing it as a hike asks the trail profile", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0, "paddle");
  await expect(rows(page).nth(0)).toContainText(`${strings.dropLabel} 7 m`);
  expect(profiles(network.brouter)).toEqual(["river"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(rows(page)).toHaveCount(0);
  await clickMap(100, 0, "hike");
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(0)).not.toContainText(strings.dropLabel);
  expect(profiles(network.brouter)).toEqual(["river", "hiking-mountain"]);
});

test("a paddle leg that can't be snapped stays as a dashed straight paddle leg with a message, and retry asks the river profile again", async ({
  page,
}) => {
  const riverReplies = [RIVER_NO_ROUTE, RIVER];
  const network = await serveOffline(page, {
    brouter: (u) => (u.searchParams.get("profile") === "river" ? riverReplies.shift()! : TRAIL),
  });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await clickMap(150, 0, "paddle");

  const row = rows(page).nth(1);
  // Updated in round 2: a paddle leg that fails says no river route was found.
  await expect(row).toContainText(strings.legRouteFailedNoRiver);
  const line = legLines(page).nth(1);
  await expect(line).toHaveClass(/leg-failed/);
  await expect(line).toHaveClass(/leg-paddle/);
  expect(((await line.getAttribute("d")) ?? "").match(/[ML]/g)).toEqual(["M", "L"]);
  expect(await line.getAttribute("stroke-dasharray")).toBeTruthy();
  await expect(row).toHaveClass(/planner-row-paddle/);
  await expect(row).not.toContainText(strings.dropLabel);
  await expect(row).not.toContainText(strings.climbLabel);
  await expect(rows(page)).toHaveCount(2);
  // The other leg is untouched and the put-in is still marked.
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);

  await row.getByRole("button", { name: strings.retryRouting }).click();
  await expect(line).toHaveClass(/leg-routed/);
  await expect(row).toContainText(`${strings.dropLabel} 7 m`);
  expect(profiles(network.brouter)).toEqual(["hiking-mountain", "river", "river"]);
  expect(network.blocked).toEqual([]);
});

test("a portage (paddle, hike, paddle) shows a take-out then a put-in", async ({ page }) => {
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(-50, 0, "paddle");
  await clickMap(50, 0, "hike");
  await clickMap(150, 0, "paddle");
  await expect(rows(page)).toHaveCount(3);

  // Updated in round 2: the trip starts and ends on the water, so besides the
  // portage's take-out and put-in, its start is a put-in and its end a take-out.
  const takeOut = mapRegion(page).locator("path.take-out");
  const putIn = mapRegion(page).locator("path.put-in");
  await expect(takeOut).toHaveCount(2);
  await expect(putIn).toHaveCount(2);
  const centre = await centreX(page);
  const cx = async (l: typeof putIn) => {
    const b = (await l.boundingBox())!;
    return b.x + b.width / 2;
  };
  expect(Math.abs((await cx(putIn.nth(0))) - (centre - 150))).toBeLessThan(3);
  expect(Math.abs((await cx(takeOut.nth(0))) - (centre - 50))).toBeLessThan(3);
  expect(Math.abs((await cx(putIn.nth(1))) - (centre + 50))).toBeLessThan(3);
  expect(Math.abs((await cx(takeOut.nth(1))) - (centre + 150))).toBeLessThan(3);
});

// Round 2 acceptance tests written from the three rules Cedric approved.

/** The Lesse fixture with its last point's elevation moved so the leg ends `rise` metres above its start. */
function riverEndingAbove(rise: number): BRouterReply {
  const doc = JSON.parse(brouterFixture("river-success.geojson"));
  const coords: number[][] = doc.features[0].geometry.coordinates;
  coords[coords.length - 1][2] = coords[0][2] + rise;
  return { status: 200, body: JSON.stringify(doc) };
}

test("round 2, rule 2: a paddle leg ending 1.5 m higher shows Drop 0 m and no upstream hint", async ({ page }) => {
  const RISE = riverEndingAbove(1.5);
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RISE : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0, "paddle");
  const row = rows(page).nth(0);
  await expect(row).toContainText(`${strings.dropLabel} 0 m`);
  // Updated: the row also shows access rule text, which can contain "upstream" and
  // date ranges like "1 Oct - 15 Jun" (#58, #59). Both rules are about the figures, so
  // check the figures only.
  const figures = (await row.locator(".planner-row-headline, .planner-row-figures").allTextContents()).join(" ");
  expect(figures).not.toContain("upstream");
  expect(figures).not.toMatch(/-\s*\d/);
});

test("round 2, rule 2: a paddle leg ending 5 m higher shows the rise with the upstream hint and no drop", async ({
  page,
}) => {
  const RISE = riverEndingAbove(5);
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RISE : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0, "paddle");
  const row = rows(page).nth(0);
  await expect(row).toContainText(`${strings.planner.legFigures.rise} 5 m?`);
  await expect(row).not.toContainText(strings.dropLabel);
});

test("round 2, rule 3: a paddle leg whose service is down keeps the unavailable message; a hike no-route keeps the generic one", async ({
  page,
}) => {
  const DOWN: BRouterReply = { status: 503, body: "" };
  await serveOffline(page, {
    brouter: (u) => (u.searchParams.get("profile") === "river" ? DOWN : RIVER_NO_ROUTE),
  });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  const row = rows(page).nth(0);
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed["no-route"]);

  // The same leg drawn as a paddle leg: the unavailable message, not the river one.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(rows(page)).toHaveCount(0);
  await clickMap(100, 0, "paddle");
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);
  await expect(row).not.toContainText(strings.legRouteFailedNoRiver);

  // Drawn as a hike again: the hike message returns, not the river one.
  await page.keyboard.press("ControlOrMeta+z");
  await clickMap(100, 0, "hike");
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed["no-route"]);
});

test("round 2, rule 1: drawing the last leg as paddle too puts the take-out at the trip's end, with nothing between the paddle legs", async ({
  page,
}) => {
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0, "paddle");
  await clickMap(150, 0, "hike");
  const putIn = mapRegion(page).locator("path.put-in");
  const takeOut = mapRegion(page).locator("path.take-out");
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);

  // The last leg drawn as paddle too: one stretch, the take-out is at the trip's end.
  await page.keyboard.press("ControlOrMeta+z");
  await clickMap(150, 0, "paddle");
  await expect(rows(page).nth(1)).toHaveClass(/planner-row-paddle/);
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);
  const centre = await centreX(page);
  const b = (await takeOut.boundingBox())!;
  expect(Math.abs(b.x + b.width / 2 - (centre + 150))).toBeLessThan(3);
  const p = (await putIn.boundingBox())!;
  expect(Math.abs(p.x + p.width / 2 - (centre - 150))).toBeLessThan(3);
});
