// Your access points on a desktop-sized window (#55, ADR 0023): place a new one with a click on
// the map, drag it into place, open its details with the flag button, edit them in their dialog (stored on Save, ADR 0034), delete them from their row,
// with markers shaped by kind; autosave under their own key.
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";
import {
  accessPointDialog,
  editSelectedAccessPoint,
  freeMapBox,
  markAccessPointAt,
  openPlanner,
  saveAccessPoint,
  tripPanel,
} from "./support/planner";
import { draftMarker, enterAccessPointEditing, leaveAccessPointEditing } from "./support/accessPointEditing";

const text = strings.accessPoints;
const ACCESS_POINTS_KEY = "packraft-go.access-points";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
// Not through the map region, which the details dialog hides from the accessibility tree while open.
const markers = (page: Page) => page.locator(".leaflet-container .access-point-marker");
const details = accessPointDialog;
const markButton = (page: Page) =>
  page.getByRole("button", { name: strings.planner.markAccessPointButton, exact: true });
const toggle = (page: Page, group: string, option: string) =>
  details(page).getByRole("group", { name: group }).getByRole("button", { name: option });

async function openMap(page: Page) {
  await openPlanner(page);
  const box = await freeMapBox(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const addAccessPoint = markAccessPointAt;

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), ACCESS_POINTS_KEY);

test("add an access point on the map, edit it in the detail panel, and the marker shows its use and kind", async ({
  page,
}) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);

  // Placing an access point does not add a trip point.
  await expect(page.locator(".leaflet-container path.point")).toHaveCount(0);
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/use-both/);
  await expect(markers(page)).toHaveClass(/kind-informal-bank/);

  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await toggle(page, text.kindLabel, text.kinds["official-aire"]).click();
  await details(page).getByLabel(text.noteLabel).fill("Steps by the bridge");
  await details(page).getByLabel(text.checkedOnSiteLabel).fill("2026-10-12");
  await saveAccessPoint(page);

  await expect(markers(page)).toHaveClass(/use-put-in/);
  await expect(markers(page)).toHaveClass(/kind-official-aire/);
  await expect(markers(page).getByRole("img")).toHaveAccessibleName(
    // Without a name, the note's first line leads (#136).
    text.marker("Steps by the bridge", text.useAndKind(text.uses["put-in"], text.kinds["official-aire"])),
  );

  // A second point, of another use and kind, gets another marker.
  await addAccessPoint(page, { x: middle.x + 120, y: middle.y });
  await toggle(page, text.useLabel, text.uses["take-out"]).click();
  await toggle(page, text.kindLabel, text.kinds.slipway).click();
  await saveAccessPoint(page);
  await expect(markers(page).nth(1)).toHaveClass(/use-take-out/);
  await expect(markers(page).nth(1)).toHaveClass(/kind-slipway/);

  // Clicking the first marker shows its row; its edit button shows its details again.
  await markers(page).nth(0).click();
  await editSelectedAccessPoint(page);
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Steps by the bridge");
  await expect(details(page).getByLabel(text.checkedOnSiteLabel)).toHaveValue("2026-10-12");
  await expect(toggle(page, text.kindLabel, text.kinds["official-aire"])).toHaveAttribute("aria-pressed", "true");

  // Still no trip points.
  await expect(page.locator(".leaflet-container path.point")).toHaveCount(0);
});

test("click, drag, flag, Save: the new point is stored where it was dragged, then the next click places another", async ({
  page,
}) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await enterAccessPointEditing(page);

  // A click places the new point; nothing is stored or listed yet.
  await page.mouse.click(middle.x, middle.y);
  await expect(draftMarker(page)).toHaveCount(1);
  await expect(draftMarker(page).getByRole("img")).toHaveAccessibleName(text.draftMarker);
  expect((await stored(page)).accessPoints).toEqual([]);
  await expect(tripPanel(page).locator(".planner-access-point-item")).toHaveCount(0);

  // Drag it into place.
  const box = (await draftMarker(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(draftMarker(page)).toHaveCount(1);

  // A tap on it doesn't open its details: only the flag does.
  await draftMarker(page).click();
  await page.waitForTimeout(300);
  await expect(details(page)).toHaveCount(0);
  await expect(draftMarker(page)).toHaveCount(1);

  // The flag opens its details; Save stores it where it was dropped and lists it.
  await markButton(page).click();
  await expect(details(page)).toBeVisible();
  await details(page).getByLabel(text.noteLabel).fill("First");
  await saveAccessPoint(page);
  await expect(draftMarker(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(1);
  await expect(tripPanel(page).locator(".planner-access-point-item")).toHaveCount(1);
  const first = (await stored(page)).accessPoints[0];
  expect(first.note).toBe("First");
  const dropped = (await markers(page).boundingBox())!;
  expect(Math.abs(dropped.x - box.x - 60)).toBeLessThan(3);
  expect(Math.abs(dropped.y - box.y - 40)).toBeLessThan(3);

  // Again: a click places another, which the flag and Save store too.
  await page.mouse.click(middle.x - 120, middle.y);
  await expect(draftMarker(page)).toHaveCount(1);
  await markButton(page).click();
  await saveAccessPoint(page);
  await expect(markers(page)).toHaveCount(2);
  await expect(tripPanel(page).locator(".planner-access-point-item")).toHaveCount(2);
  await expect(mapRegion(page).locator(".point")).toHaveCount(0);
});

test("a second click moves the new point; Cancel keeps it unsaved, leaving drops it, and after leaving a click adds a trip point", async ({
  page,
}) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await enterAccessPointEditing(page);
  await page.mouse.click(middle.x, middle.y);
  const placed = (await draftMarker(page).boundingBox())!;
  await page.mouse.click(middle.x - 100, middle.y);
  await expect(markers(page)).toHaveCount(1);
  await expect.poll(async () => (await draftMarker(page).boundingBox())!.x).toBeLessThan(placed.x - 50);

  // Cancel closes its details; it stays on the map, not stored.
  await markButton(page).click();
  await details(page).getByRole("button", { name: strings.confirmCancel }).click();
  await expect(draftMarker(page)).toHaveCount(1);
  expect((await stored(page)).accessPoints).toEqual([]);

  // Leaving drops a new point not saved.
  await leaveAccessPointEditing(page);
  await expect(markers(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toEqual([]);

  await page.mouse.click(middle.x + 40, middle.y);
  await expect(mapRegion(page).locator(".point")).toHaveCount(1);
  await expect(markers(page)).toHaveCount(0);
});

test("drag an access point to move it", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  await saveAccessPoint(page);
  const before = (await stored(page)).accessPoints[0].position;

  const box = (await markers(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await stored(page)).accessPoints[0].position.lng).toBeGreaterThan(before.lng);
  expect((await stored(page)).accessPoints[0].position.lat).toBeLessThan(before.lat);
  // Dragging neither adds a trip point nor another access point.
  await expect(mapRegion(page).locator(".point")).toHaveCount(0);
  await expect(markers(page)).toHaveCount(1);
});

test("delete an access point after confirming", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  await saveAccessPoint(page);
  // Deleted from its row in the Access points tab.
  await enterAccessPointEditing(page);
  const deleteButton = tripPanel(page)
    .locator(".planner-access-point-item")
    .getByRole("button", { name: /^Delete / });
  await deleteButton.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveAccessibleName(text.deleteConfirm.title);
  await dialog.getByRole("button", { name: strings.confirmCancel }).click();
  await expect(markers(page)).toHaveCount(1);

  await deleteButton.click();
  await dialog.getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(markers(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toEqual([]);
});

test("access points are autosaved under their own key, apart from the trip, and survive a reload", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  await details(page).getByLabel(text.noteLabel).fill("Park at the church");
  await saveAccessPoint(page);

  expect(await stored(page)).toMatchObject({
    format: "packraft-go-access-points",
    version: 1,
    accessPoints: [{ use: "both", kind: "informal-bank", note: "Park at the church", checkedOnSite: null }],
  });
  const trip = await page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null"));
  expect(JSON.stringify(trip ?? {})).not.toContain("Park at the church");

  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  await enterAccessPointEditing(page);
  await markers(page).click();
  await editSelectedAccessPoint(page);
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Park at the church");
});
