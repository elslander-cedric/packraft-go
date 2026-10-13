// Your access points on the desktop (#55, ADR 0023): add, edit and delete them
// on the map, with markers by use and kind and a detail panel; autosave under
// their own key; export, and import into a fresh profile with a merge.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strings } from "../src/ui/strings";
import { serveOffline } from "./support/offline";

const text = strings.accessPoints;
const ACCESS_POINTS_KEY = "packraft-go.access-points";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const panel = (page: Page) => page.getByRole("complementary", { name: text.panelLabel });
const details = (page: Page) => page.getByRole("region", { name: text.detailsLabel });
const addButton = (page: Page) => panel(page).getByRole("button", { name: text.addButton });
const toggle = (page: Page, group: string, option: string) =>
  details(page).getByRole("group", { name: group }).getByRole("button", { name: option });

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
  const box = (await mapRegion(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function addAccessPoint(page: Page, at: { x: number; y: number }) {
  await addButton(page).click();
  await expect(addButton(page)).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(at.x, at.y);
  await expect(details(page)).toBeVisible();
}

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), ACCESS_POINTS_KEY);

test("add an access point on the map, edit it in the detail panel, and the marker shows its use and kind", async ({
  page,
}) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);

  // Placing an access point does not add a trip point.
  await expect(mapRegion(page).locator(".point")).toHaveCount(0);
  await expect(addButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(markers(page)).toHaveCount(1);
  await expect(markers(page)).toHaveClass(/use-both/);
  await expect(markers(page)).toHaveClass(/kind-informal-bank/);

  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await toggle(page, text.kindLabel, text.kinds["official-aire"]).click();
  await details(page).getByLabel(text.noteLabel).fill("Steps by the bridge");
  await details(page).getByLabel(text.checkedOnSiteLabel).fill("2026-10-12");

  await expect(markers(page)).toHaveClass(/use-put-in/);
  await expect(markers(page)).toHaveClass(/kind-official-aire/);
  await expect(markers(page).getByRole("img")).toHaveAccessibleName(
    text.marker(text.uses["put-in"], text.kinds["official-aire"]),
  );

  // A second point, of another use and kind, gets another marker.
  await addAccessPoint(page, { x: middle.x + 120, y: middle.y });
  await toggle(page, text.useLabel, text.uses["take-out"]).click();
  await toggle(page, text.kindLabel, text.kinds.slipway).click();
  await expect(markers(page).nth(1)).toHaveClass(/use-take-out/);
  await expect(markers(page).nth(1)).toHaveClass(/kind-slipway/);

  // Clicking the first marker shows its details again.
  await details(page).getByRole("button", { name: text.closeButton }).click();
  await expect(details(page)).toHaveCount(0);
  await markers(page).nth(0).click();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Steps by the bridge");
  await expect(details(page).getByLabel(text.checkedOnSiteLabel)).toHaveValue("2026-10-12");
  await expect(toggle(page, text.kindLabel, text.kinds["official-aire"])).toHaveAttribute("aria-pressed", "true");

  // Still no trip points.
  await expect(mapRegion(page).locator(".point")).toHaveCount(0);
});

test("Escape cancels placing an access point; the next click adds a trip point", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addButton(page).click();
  await expect(panel(page)).toContainText(text.placingHint);
  await page.keyboard.press("Escape");
  await expect(addButton(page)).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(middle.x, middle.y);
  await expect(mapRegion(page).locator(".point")).toHaveCount(1);
  await expect(markers(page)).toHaveCount(0);
});

test("drag an access point to move it", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
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
  await details(page).getByRole("button", { name: text.deleteButton }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveAccessibleName(text.deleteConfirm.title);
  await dialog.getByRole("button", { name: strings.confirmCancel }).click();
  await expect(markers(page)).toHaveCount(1);

  await details(page).getByRole("button", { name: text.deleteButton }).click();
  await dialog.getByRole("button", { name: text.deleteConfirm.confirm }).click();
  await expect(markers(page)).toHaveCount(0);
  await expect(details(page)).toHaveCount(0);
  expect((await stored(page)).accessPoints).toEqual([]);
});

test("access points are autosaved under their own key, apart from the trip, and survive a reload", async ({
  page,
}) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  await details(page).getByLabel(text.noteLabel).fill("Park at the church");

  expect(await stored(page)).toMatchObject({
    format: "packraft-go-access-points",
    version: 1,
    accessPoints: [{ use: "both", kind: "informal-bank", note: "Park at the church", checkedOnSite: null }],
  });
  const trip = await page.evaluate(() => JSON.parse(localStorage.getItem("packraft-go.trip") ?? "null"));
  expect(JSON.stringify(trip ?? {})).not.toContain("Park at the church");

  await page.reload();
  await expect(markers(page)).toHaveCount(1);
  await markers(page).click();
  await expect(details(page).getByLabel(text.noteLabel)).toHaveValue("Park at the church");
});

test("export, then import into a fresh profile; importing again adds no duplicates", async ({ page, browser }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  await toggle(page, text.useLabel, text.uses["put-in"]).click();
  await addAccessPoint(page, { x: middle.x + 120, y: middle.y });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel(page).getByRole("button", { name: text.exportButton }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("packraft-go-access-points.json");
  const exported = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(exported)).toMatchObject({ format: "packraft-go-access-points", version: 1 });

  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await serveOffline(other);
  await openMap(other);
  await expect(markers(other)).toHaveCount(0);

  const importFile = async (contents: string) => {
    const [chooser] = await Promise.all([
      other.waitForEvent("filechooser"),
      panel(other).getByRole("button", { name: text.importButton }).click(),
    ]);
    await chooser.setFiles({ name: "points.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  };

  await importFile(exported);
  await expect(markers(other)).toHaveCount(2);
  await expect(panel(other)).toContainText(text.imported(2, 0));

  await importFile(exported);
  await expect(panel(other)).toContainText(text.imported(0, 2));
  await expect(markers(other)).toHaveCount(2);
  expect((await stored(other)).accessPoints).toHaveLength(2);

  await other.reload();
  await expect(markers(other)).toHaveCount(2);
  await fresh.close();
});

test("while saving is paused for an unknown-version save, an import says it was not saved", async ({ page }) => {
  // Round 2 of #55: messages must not claim success while changes aren't saved.
  const newer = JSON.stringify({ format: "packraft-go-access-points", version: 2, accessPoints: [] });
  await serveOffline(page);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [ACCESS_POINTS_KEY, newer]);
  await openMap(page);
  await expect(panel(page).getByRole("alert").filter({ hasText: text.autosaveUnknownVersion })).toBeVisible();

  const imported = JSON.stringify({
    format: "packraft-go-access-points",
    version: 1,
    accessPoints: [
      {
        id: "b",
        position: { lat: 50.6, lng: 5.6 },
        use: "both",
        kind: "jetty",
        note: "",
        checkedOnSite: null,
        createdAt: "2026-10-12T08:00:00.000Z",
        updatedAt: "2026-10-12T08:00:00.000Z",
      },
    ],
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    panel(page).getByRole("button", { name: text.importButton }).click(),
  ]);
  await chooser.setFiles({ name: "points.json", mimeType: "application/json", buffer: Buffer.from(imported) });

  const message = text.importedNotSaved(text.notSaved["unknown-version"], 1);
  await expect(panel(page).getByRole("alert").filter({ hasText: message })).toBeVisible();
  await expect(panel(page)).not.toContainText(text.imported(1, 0));
  await expect(markers(page)).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), ACCESS_POINTS_KEY)).toBe(newer);
});

test("an invalid access points file is refused and leaves your points untouched", async ({ page }) => {
  await serveOffline(page);
  const middle = await openMap(page);
  await addAccessPoint(page, middle);
  const before = await stored(page);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    panel(page).getByRole("button", { name: text.importButton }).click(),
  ]);
  await chooser.setFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{not json") });

  await expect(panel(page).getByRole("alert")).toHaveText(text.importInvalid);
  await expect(markers(page)).toHaveCount(1);
  expect(await stored(page)).toEqual(before);
});
