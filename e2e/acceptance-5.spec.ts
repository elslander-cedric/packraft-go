// Acceptance tests for #5 (paddle legs snap to rivers), written by the tester.
// BRouter is answered from recorded fixtures; a river-profile failure is
// hand-made (BRouter's 400 routing-error reply), since no river no-route was
// recorded. No live service is called (ADR 0019).
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");
const modeGroup = (page: Page, leg: number) => legsPanel(page).getByRole("group", { name: strings.legModeLabel(leg + 1) });
const modeButton = (page: Page, leg: number, label: string) => modeGroup(page, leg).getByRole("button", { name: label });
const profiles = (urls: URL[]) => urls.map((u) => u.searchParams.get("profile"));

const TRAIL: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const RIVER: BRouterReply = { status: 200, body: brouterFixture("river-success.geojson") };
const RIVER_NO_ROUTE: BRouterReply = { status: 400, body: "target island detected for section 0" };

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

test("AC1/AC3: every leg row has a Hike/Paddle switch; paddle legs look different in the panel and on the map", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(0, 0);
  await clickMap(100, 0);
  await expect(rows(page)).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect(modeButton(page, i, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
    await expect(modeButton(page, i, strings.legModePaddle)).toHaveAttribute("aria-pressed", "false");
  }

  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);

  const [paddleStyle, hikeStyle] = await Promise.all(
    [0, 1].map((i) =>
      legLines(page)
        .nth(i)
        .evaluate((el) => ({ stroke: el.getAttribute("stroke"), width: el.getAttribute("stroke-width") })),
    ),
  );
  expect(paddleStyle.stroke).not.toBe(hikeStyle.stroke);
  const [paddleRowBg, hikeRowBg] = await Promise.all(
    [0, 1].map((i) => rows(page).nth(i).evaluate((el) => getComputedStyle(el).backgroundColor)),
  );
  expect(paddleRowBg).not.toBe(hikeRowBg);
  expect(profiles(network.brouter)).toEqual(["hiking-mountain", "hiking-mountain", "river"]);
  expect(network.blocked).toEqual([]);
});

test("clicking the mode a leg already has sends no request and adds no undo step", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => TRAIL });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  for (let i = 0; i < 3; i++) await modeButton(page, 0, strings.legModeHike).click();
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  expect(network.brouter).toHaveLength(1);

  // One undo removes the last point (the most recent real edit), not a no-op switch.
  await page.getByRole("button", { name: strings.undoButton }).click();
  await expect(rows(page)).toHaveCount(0);
});

test("Ctrl+Z undoes a mode switch; repeated switches never re-ask BRouter for a leg it already answered", async ({
  page,
}) => {
  const network = await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveClass(/leg-routed/);

  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(rows(page).nth(0)).toContainText(`${strings.dropLabel} 7 m`);
  await modeButton(page, 0, strings.legModeHike).click();
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(rows(page).nth(0)).toContainText(`${strings.dropLabel} 7 m`);
  expect(profiles(network.brouter)).toEqual(["hiking-mountain", "river"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(modeButton(page, 0, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page).nth(0)).toContainText(`${strings.climbLabel} 100 m`);
  await expect(rows(page).nth(0)).not.toContainText(strings.dropLabel);
  expect(profiles(network.brouter)).toEqual(["hiking-mountain", "river"]);
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
  await clickMap(150, 0);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);

  await modeButton(page, 1, strings.legModePaddle).click();

  const row = rows(page).nth(1);
  // Updated in round 2: a paddle leg that fails says no river route was found.
  await expect(row).toContainText(strings.legRouteFailedNoRiver);
  const line = legLines(page).nth(1);
  await expect(line).toHaveClass(/leg-failed/);
  await expect(line).toHaveClass(/leg-paddle/);
  expect(((await line.getAttribute("d")) ?? "").match(/[ML]/g)).toEqual(["M", "L"]);
  expect(await line.getAttribute("stroke-dasharray")).toBeTruthy();
  await expect(modeButton(page, 1, strings.legModePaddle)).toHaveAttribute("aria-pressed", "true");
  await expect(row).not.toContainText(strings.dropLabel);
  await expect(row).not.toContainText(strings.climbLabel);
  await expect(rows(page)).toHaveCount(2);
  // The other leg is untouched and the put-in is still marked.
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await expect(mapRegion(page).locator("path.put-in")).toHaveCount(1);

  await row.getByRole("button", { name: strings.retryRouting }).click();
  await expect(line).toHaveClass(/leg-routed/);
  await expect(row).toContainText(`${strings.dropLabel} 7 m`);
  expect(profiles(network.brouter)).toEqual(["hiking-mountain", "hiking-mountain", "river", "river"]);
  expect(network.blocked).toEqual([]);
});

test("a portage (paddle, hike, paddle) shows a take-out then a put-in", async ({ page }) => {
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  for (const dx of [-150, -50, 50, 150]) await clickMap(dx, 0);
  await expect(rows(page)).toHaveCount(3);
  await modeButton(page, 0, strings.legModePaddle).click();
  await modeButton(page, 2, strings.legModePaddle).click();

  // Updated in round 2: the trip starts and ends on the water, so besides the
  // portage's take-out and put-in, its start is a put-in and its end a take-out.
  const takeOut = mapRegion(page).locator("path.take-out");
  const putIn = mapRegion(page).locator("path.put-in");
  await expect(takeOut).toHaveCount(2);
  await expect(putIn).toHaveCount(2);
  const mapBox = (await mapRegion(page).boundingBox())!;
  const centreX = mapBox.x + mapBox.width / 2;
  const cx = async (l: typeof putIn) => {
    const b = (await l.boundingBox())!;
    return b.x + b.width / 2;
  };
  expect(Math.abs((await cx(putIn.nth(0))) - (centreX - 150))).toBeLessThan(3);
  expect(Math.abs((await cx(takeOut.nth(0))) - (centreX - 50))).toBeLessThan(3);
  expect(Math.abs((await cx(putIn.nth(1))) - (centreX + 50))).toBeLessThan(3);
  expect(Math.abs((await cx(takeOut.nth(1))) - (centreX + 150))).toBeLessThan(3);
});

// Round 2 acceptance tests, written by the tester from the three rules Cedric approved.

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
  await clickMap(100, 0);
  await modeButton(page, 0, strings.legModePaddle).click();
  const row = rows(page).nth(0);
  await expect(row).toContainText(`${strings.dropLabel} 0 m`);
  await expect(row).not.toContainText("upstream");
  // Updated: the row now also shows access rule text, which may contain hyphens
  // ("packraft-go"); the rule is still that no figure is negative (#58).
  await expect(row).not.toContainText(/-\s*\d/);
});

test("round 2, rule 2: a paddle leg ending 5 m higher shows the rise with the upstream hint and no drop", async ({
  page,
}) => {
  const RISE = riverEndingAbove(5);
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RISE : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-100, 0);
  await clickMap(100, 0);
  await modeButton(page, 0, strings.legModePaddle).click();
  const row = rows(page).nth(0);
  await expect(row).toContainText("↑ 5 m (upstream?)");
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

  await modeButton(page, 0, strings.legModePaddle).click();
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed.unavailable);
  await expect(row).not.toContainText(strings.legRouteFailedNoRiver);

  // Back to hike: the hike message returns, not the river one.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(modeButton(page, 0, strings.legModeHike)).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByRole("alert")).toHaveText(strings.legRouteFailed["no-route"]);
});

test("round 2, rule 1: making the last leg paddle too moves the take-out to the trip's end, with nothing between the paddle legs", async ({
  page,
}) => {
  await serveOffline(page, { brouter: (u) => (u.searchParams.get("profile") === "river" ? RIVER : TRAIL) });
  const clickMap = await openMap(page);
  await clickMap(-150, 0);
  await clickMap(0, 0);
  await clickMap(150, 0);
  await modeButton(page, 0, strings.legModePaddle).click();
  const putIn = mapRegion(page).locator("path.put-in");
  const takeOut = mapRegion(page).locator("path.take-out");
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);

  // Switch the last leg to paddle too: one stretch, take-out moves to the trip's end.
  await modeButton(page, 1, strings.legModePaddle).click();
  await expect(putIn).toHaveCount(1);
  await expect(takeOut).toHaveCount(1);
  const mapBox = (await mapRegion(page).boundingBox())!;
  const centreX = mapBox.x + mapBox.width / 2;
  const b = (await takeOut.boundingBox())!;
  expect(Math.abs(b.x + b.width / 2 - (centreX + 150))).toBeLessThan(3);
  const p = (await putIn.boundingBox())!;
  expect(Math.abs(p.x + p.width / 2 - (centreX - 150))).toBeLessThan(3);
});
