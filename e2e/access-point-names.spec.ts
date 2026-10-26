// Access point names (#136, ADR 0027): a point marked offline is saved at once
// without a name, and gets its default name from the nearest road and place
// (recorded Nominatim answers) once the app is back online. A name you type
// survives a drag; a default name follows the point.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { serialiseAccessPoints, type AccessPoint } from "../src/core/accessPoints";
import { ACCESS_POINTS_KEY } from "../src/persistence/accessPointStorage";
import { strings } from "../src/ui/strings";
import { nominatimFixture, serveOffline } from "./support/offline";
import { touch } from "./support/touch";

const text = strings.accessPoints;
const phoneText = strings.phone;
const DEFAULT_NAME = "Rue du Batty, Melreux";

const mapRegion = (page: Page) => page.getByRole("region", { name: strings.mapLabel });
const markers = (page: Page) => mapRegion(page).locator(".access-point-marker");
const details = (page: Page) => page.getByRole("region", { name: text.detailsLabel, exact: true });
const nameField = (page: Page) => details(page).getByLabel(text.nameLabel, { exact: true });

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.accessPoints, ACCESS_POINTS_KEY);

async function centreOf(shape: Locator) {
  const box = (await shape.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openMap(page: Page) {
  await page.goto("/");
  await expect(mapRegion(page).locator("img.leaflet-tile-loaded").first()).toBeVisible();
}

test.describe("on the desktop", () => {
  const panel = (page: Page) => page.getByRole("complementary", { name: text.panelLabel });

  async function drag(page: Page, dx: number, dy: number) {
    const from = await centreOf(markers(page).first());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
    await page.mouse.up();
  }

  test("a point added offline gets its default name back online; a typed name survives a drag", async ({
    page,
    context,
  }) => {
    const network = await serveOffline(page, { nominatim: nominatimFixture("reverse-road.json") });
    await openMap(page);

    // Offline: the point is added and saved at once, without a name, and nothing is asked.
    await context.setOffline(true);
    await panel(page).getByRole("button", { name: text.addButton }).click();
    const centre = await centreOf(mapRegion(page));
    await page.mouse.click(centre.x, centre.y);
    await expect(nameField(page)).toHaveValue("");
    await expect(nameField(page)).toHaveAttribute("placeholder", text.namePlaceholder);
    await expect.poll(async () => (await stored(page))?.[0]?.nameSource).toBe("to-look-up");
    expect((await stored(page))[0].name).toBe("");
    expect(network.nominatim).toHaveLength(0);

    // Back online: the default name shows in the field, greyed, leads the marker's name, and is saved.
    await context.setOffline(false);
    await expect(nameField(page)).toHaveAttribute("placeholder", DEFAULT_NAME);
    await expect(nameField(page)).toHaveValue("");
    await expect(markers(page).getByRole("img")).toHaveAccessibleName(
      text.marker(DEFAULT_NAME, text.useAndKind(text.uses.both, text.kinds["informal-bank"])),
    );
    await expect.poll(async () => (await stored(page))[0]).toMatchObject({ name: DEFAULT_NAME, nameSource: "default" });
    expect(network.nominatim).toHaveLength(1);
    expect(network.nominatim[0].searchParams.get("accept-language")).toBe("zxx");

    // Moving a point with a default name looks it up again, at the new position.
    await drag(page, 60, 40);
    await expect.poll(() => network.nominatim.length).toBe(2);
    const moved = (await stored(page))[0].position;
    expect(Number(network.nominatim[1].searchParams.get("lat"))).toBeCloseTo(moved.lat, 6);

    // A name you type is kept: a drag doesn't look it up again.
    await expect(nameField(page)).toHaveAttribute("placeholder", DEFAULT_NAME);
    await nameField(page).fill("Hotton bridge");
    await expect.poll(async () => (await stored(page))[0]).toMatchObject({ name: "Hotton bridge", nameSource: "typed" });
    await drag(page, -60, -40);
    await expect.poll(async () => (await stored(page))[0].position).not.toEqual(moved);
    await page.waitForTimeout(1500);
    expect(network.nominatim).toHaveLength(2);
    await expect(nameField(page)).toHaveValue("Hotton bridge");
    await expect(markers(page).getByRole("img")).toHaveAccessibleName(
      text.marker("Hotton bridge", text.useAndKind(text.uses.both, text.kinds["informal-bank"])),
    );

    // Markup characters in a name stay text in the marker (CLAUDE.md: names with / : & <).
    const awkward = 'A & <b>B</b> "C" / D: E';
    await nameField(page).fill(awkward);
    await expect(markers(page).getByRole("img")).toHaveAccessibleName(
      text.marker(awkward, text.useAndKind(text.uses.both, text.kinds["informal-bank"])),
    );
    await expect(markers(page).locator("b")).toHaveCount(0);

    // Clearing it brings the default name back.
    await nameField(page).fill("");
    await expect(nameField(page)).toHaveAttribute("placeholder", DEFAULT_NAME);
    expect(network.blocked).toEqual([]);
  });
});

test.describe("on the phone", () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  const sheet = (page: Page) => page.getByRole("dialog", { name: phoneText.sheetLabel });
  const section = (page: Page) => sheet(page).getByRole("region", { name: phoneText.accessPointsLabel, exact: true });
  const rows = (page: Page) => section(page).getByRole("list").getByRole("listitem");

  test("a point marked offline gets its default name back online, which leads its row", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 50.268, longitude: 5.446, accuracy: 10 });
    const network = await serveOffline(page, { nominatim: nominatimFixture("reverse-road.json") });
    await openMap(page);
    await sheet(page).getByRole("tab", { name: phoneText.tabs.accessPoints }).click();

    await context.setOffline(true);
    await section(page).getByRole("button", { name: phoneText.markHereButton }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect.poll(async () => (await stored(page))?.[0]?.nameSource).toBe("to-look-up");
    // Unnamed, without a note: its use and kind lead.
    await expect(rows(page).first().locator(".phone-row-heading")).toHaveText(
      text.useAndKind(text.uses.both, text.kinds["informal-bank"]),
    );
    expect(network.nominatim).toHaveLength(0);

    await context.setOffline(false);
    await expect(rows(page).first().locator(".phone-row-heading")).toHaveText(DEFAULT_NAME);
    await expect(rows(page).first()).toContainText(text.useAndKind(text.uses.both, text.kinds["informal-bank"]));
    await expect(nameField(page)).toHaveAttribute("placeholder", DEFAULT_NAME);
    await expect.poll(async () => (await stored(page))[0]).toMatchObject({ name: DEFAULT_NAME, nameSource: "default" });
    expect(network.blocked).toEqual([]);
  });

  test("a typed name survives a finger drag, and is not looked up", async ({ page }) => {
    const named: AccessPoint = {
      id: "ap-1",
      position: { lat: 50.268, lng: 5.446 },
      name: "Hotton bridge",
      nameSource: "typed",
      use: "put-in",
      kind: "slipway",
      note: "Steep bank\nPark at the church",
      checkedOnSite: null,
      createdAt: "2026-05-01T08:00:00.000Z",
      updatedAt: "2026-05-01T08:00:00.000Z",
    };
    const network = await serveOffline(page, { nominatim: nominatimFixture("reverse-road.json") });
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [ACCESS_POINTS_KEY, serialiseAccessPoints([named])],
    );
    await openMap(page);
    await sheet(page).getByRole("tab", { name: phoneText.tabs.accessPoints }).click();

    // The name leads the row; the whole note and use and kind follow.
    const row = rows(page).first();
    await expect(row.locator(".phone-row-heading")).toHaveText("Hotton bridge");
    await expect(row).toContainText("Steep bank");
    await expect(row).toContainText(text.useAndKind(text.uses["put-in"], text.kinds.slipway));

    // Open it, which centres it above the sheet, and drag it with a finger once the map has settled.
    await row.getByRole("button").click();
    await expect(nameField(page)).toHaveValue("Hotton bridge");
    let last = "";
    await expect
      .poll(
        async () => {
          const now = JSON.stringify(await markers(page).first().boundingBox());
          const settled = now === last;
          last = now;
          return settled;
        },
        { intervals: [200] },
      )
      .toBe(true);
    const from = await centreOf(markers(page).first());
    await (await touch(page)).drag(from, { x: from.x + 60, y: from.y - 40 });

    await expect.poll(async () => (await stored(page))[0].position).not.toEqual(named.position);
    await page.waitForTimeout(1500);
    expect((await stored(page))[0]).toMatchObject({ name: "Hotton bridge", nameSource: "typed" });
    expect(network.nominatim).toHaveLength(0);
  });
});
