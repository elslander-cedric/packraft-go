// Hike legs snap to trails (#4). BRouter is answered from recorded responses.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { brouterFixture, serveOffline, type BRouterReply } from "./support/offline";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const legsPanel = (page: Page) => page.getByRole("complementary", { name: strings.legsPanelLabel });
const legLines = (page: Page) => mapRegion(page).locator(".leaflet-overlay-pane path.leg");
const rows = (page: Page) => legsPanel(page).getByRole("listitem");

const SNAPPED: BRouterReply = { status: 200, body: brouterFixture("hiking-success.geojson") };
const NO_ROUTE: BRouterReply = { status: 400, body: brouterFixture("hiking-no-route-400.txt") };

/** Opens the app and returns a function that clicks the map `dx`, `dy` pixels from its centre. */
async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return (dx: number, dy: number) => page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** A reply the test releases when it is ready, so the pending state can be observed. */
function heldReply() {
  let release!: (reply: BRouterReply) => void;
  const reply = new Promise<BRouterReply>((r) => (release = r));
  return { reply, release };
}

test("a hike leg shows pending, then follows the trail with its distance, climb and descent", async ({ page }) => {
  const held = heldReply();
  const network = await serveOffline(page, { brouter: () => held.reply });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);

  // While BRouter has not answered, the leg is marked as being snapped.
  await expect(rows(page).nth(0).getByRole("status")).toHaveText(strings.legRouting);
  await expect(legLines(page)).toHaveClass(/leg-pending/);

  held.release(SNAPPED);

  // The routed leg follows the recorded track, not a straight line. (At the
  // opening zoom the 3 km track is a few pixels wide, so Leaflet simplifies it.)
  await expect(legLines(page)).toHaveCount(1);
  await expect(legLines(page)).toHaveClass(/leg-routed/);
  const d = (await legLines(page).getAttribute("d")) ?? "";
  expect((d.match(/L/g) ?? []).length).toBeGreaterThan(1);

  // Figures come from the routed track: 3.2 km, 118 m up, 78 m down.
  const row = rows(page).nth(0);
  await expect(row.getByRole("status")).toHaveCount(0);
  await expect(row).toContainText("3.2 km");
  await expect(row).toContainText(`${strings.climbLabel} 118 m`);
  await expect(row).toContainText(`${strings.descentLabel} 78 m`);

  // The hiking profile was asked for, once, through the two clicked points.
  expect(network.brouter).toHaveLength(1);
  expect(network.brouter[0].searchParams.get("profile")).toBe("hiking-mountain");
  expect(network.blocked).toEqual([]);
});

test("an already routed leg is never requested again when the trip grows", async ({ page }) => {
  const network = await serveOffline(page, { brouter: () => SNAPPED });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(0, 0);
  await expect(legLines(page).nth(0)).toHaveClass(/leg-routed/);
  await clickMap(100, 0);
  await expect(legLines(page)).toHaveCount(2);
  await expect(legLines(page).nth(1)).toHaveClass(/leg-routed/);

  expect(network.brouter).toHaveLength(2);
  const lonlats = network.brouter.map((url) => url.searchParams.get("lonlats"));
  expect(new Set(lonlats).size).toBe(2);
});

test("a leg that fails to snap stays as a dashed straight line with a message, and retry snaps it", async ({ page }) => {
  const replies = [NO_ROUTE, SNAPPED];
  const network = await serveOffline(page, { brouter: () => replies.shift()! });
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);

  const row = rows(page).nth(0);
  await expect(row).toContainText(strings.legRouteFailed["no-route"]);
  await expect(legLines(page)).toHaveClass(/leg-failed/);
  const line = legLines(page);
  expect(((await line.getAttribute("d")) ?? "").match(/[ML]/g)).toEqual(["M", "L"]);
  expect(await line.getAttribute("stroke-dasharray")).toBeTruthy();
  // The leg is kept in the trip, with its straight-line distance.
  await expect(rows(page)).toHaveCount(1);
  await expect(row).toContainText("km");

  await row.getByRole("button", { name: strings.retryRouting }).click();

  await expect(legLines(page)).toHaveClass(/leg-routed/);
  await expect(row).not.toContainText(strings.legRouteFailed["no-route"]);
  await expect(row).toContainText(`${strings.climbLabel} 118 m`);
  expect(network.brouter).toHaveLength(2);
  expect(network.blocked).toEqual([]);
});

test("when the routing service is unavailable the message says so", async ({ page }) => {
  await serveOffline(page);
  const clickMap = await openMap(page);

  await clickMap(-100, 0);
  await clickMap(100, 0);

  await expect(rows(page).nth(0)).toContainText(strings.legRouteFailed.unavailable);
  await expect(rows(page).nth(0).getByRole("button", { name: strings.retryRouting })).toBeVisible();
});
