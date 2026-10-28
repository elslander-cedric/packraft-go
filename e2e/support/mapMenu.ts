// The Map menus (#179, ADR 0032): the desktop's Map button and the phone's layers button,
// with the base maps, the overlays and (phone) the access layer.
import { expect, type Page } from "@playwright/test";
import type { BaseMapId, OverlayId } from "../../src/core/settings";
import { strings } from "../../src/ui/strings";

/** The Map menu's button: bottom right on the desktop, the layers button under the position button on the phone. */
export const mapMenuButton = (page: Page) => page.getByRole("button", { name: strings.mapMenuButton, exact: true });

/** A base map in an open menu, checked when it is the current one. */
export const baseMapItem = (page: Page, id: BaseMapId) =>
  page.getByRole("menuitemradio", { name: strings.baseMaps[id], exact: true });

/** The access layer's switch in the open Map menu (phone). */
export const accessLayerItem = (page: Page) =>
  page.getByRole("menuitemcheckbox", { name: strings.accessLayerToggle, exact: true });

/** Opens the Map menu and picks base map `id`; the menu closes. */
export async function chooseBaseMap(page: Page, id: BaseMapId) {
  await mapMenuButton(page).click();
  await baseMapItem(page, id).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** Phone: opens the Map menu and turns the access layer on or off with its switch; the menu closes. */
export async function toggleAccessLayer(page: Page) {
  await mapMenuButton(page).click();
  await accessLayerItem(page).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** An overlay's switch in the open Map menu, checked while it is on. */
export const overlayItem = (page: Page, id: OverlayId) =>
  page.getByRole("menuitemcheckbox", { name: strings.overlays[id], exact: true });

/** Opens the Map menu and switches overlay `id` on or off; the menu closes. */
export async function toggleOverlay(page: Page, id: OverlayId) {
  await mapMenuButton(page).click();
  await overlayItem(page, id).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
