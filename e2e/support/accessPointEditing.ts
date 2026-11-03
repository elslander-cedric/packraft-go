// Access point editing (ADR 0036, #225): the planner's mode for changing your access points.
// Specs that mark, edit or delete access points, or read the Access points tab, enter it first.
import { expect, type Page } from "@playwright/test";
import { strings } from "../../src/ui/strings";

const text = strings.planner;

/** The floating button that enters access point editing (normal mode only). */
export const editAccessPointsButton = (page: Page) =>
  page.getByRole("button", { name: text.editAccessPointsButton, exact: true });

/** The banner shown while editing access points. */
export const editingBanner = (page: Page) => page.getByRole("status").filter({ hasText: text.editingAccessPointsState });

/** The banner's Done, which leaves access point editing. */
export const doneButton = (page: Page) => page.getByRole("button", { name: text.editingAccessPointsDone, exact: true });

/** The floating button that marks an access point (access point editing only). */
export const markAccessPointButton = (page: Page) =>
  page.getByRole("button", { name: text.markAccessPointButton, exact: true });

/**
 * Enters access point editing, unless the planner is already in it: the panel or sheet opens on
 * the Access points tab.
 */
export async function enterAccessPointEditing(page: Page) {
  if ((await editingBanner(page).count()) === 0) await editAccessPointsButton(page).click();
  await expect(editingBanner(page)).toBeVisible();
  await expect(page.getByRole("tab", { name: text.tabs.accessPoints })).toHaveAttribute("aria-selected", "true");
}

/** Done: back to normal mode. */
export async function leaveAccessPointEditing(page: Page) {
  await doneButton(page).click();
  await expect(editingBanner(page)).toHaveCount(0);
  await expect(editAccessPointsButton(page)).toBeVisible();
}
