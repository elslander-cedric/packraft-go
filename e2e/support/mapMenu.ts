// The base map and access layer controls (#179): the desktop's base map button and the
// phone's layers button with its Map menu.
import { expect, type Page } from "@playwright/test";
import type { BaseMapId } from "../../src/core/settings";
import { strings } from "../../src/ui/strings";

/** The phone's layers button under the position button: it opens the Map menu. */
export const mapLayersButton = (page: Page) =>
  page.getByRole("button", { name: strings.phone.mapMenuButton, exact: true });

/** The desktop's base map button, bottom right on the map. */
export const baseMapButton = (page: Page) => page.getByRole("button", { name: strings.baseMapButton, exact: true });

/** A base map in an open menu, checked when it is the current one. */
export const baseMapItem = (page: Page, id: BaseMapId) =>
  page.getByRole("menuitemradio", { name: strings.baseMaps[id], exact: true });

/** The access layer's switch in the open Map menu (phone). */
export const accessLayerItem = (page: Page) =>
  page.getByRole("menuitemcheckbox", { name: strings.accessLayerToggle, exact: true });

/** Opens the menu with `button` and picks base map `id`; the menu closes. */
export async function chooseBaseMap(page: Page, button: ReturnType<typeof baseMapButton>, id: BaseMapId) {
  await button.click();
  await baseMapItem(page, id).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** Phone: opens the Map menu and turns the access layer on or off with its switch; the menu closes. */
export async function toggleAccessLayer(page: Page) {
  await mapLayersButton(page).click();
  await accessLayerItem(page).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
