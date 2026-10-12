import { expect, type Page } from "@playwright/test";
import { strings } from "../../src/ui/strings";

/** Which question the planner is asked before a trip with points is replaced. */
export type Confirmation = "newTrip" | "openFile";

const texts = { newTrip: strings.newTripConfirm, openFile: strings.openFileConfirm } as const;

/**
 * The in-page confirmation (a Base UI Alert Dialog) that replaced the
 * browser's native `window.confirm` in #31.
 */
export const confirmDialog = (page: Page) => page.getByRole("alertdialog");

/**
 * Waits until the open confirmation has moved focus to its first button,
 * Cancel (the safe answer).
 *
 * Base UI shows the dialog first and moves focus into it on the next
 * animation frame. A key pressed in between goes to the page behind, so
 * keyboard tests must wait for this before pressing Tab, Escape or Enter.
 */
export async function expectInitialFocus(page: Page) {
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: strings.confirmCancel })).toBeFocused();
}

/** Waits for the `which` confirmation, checks its text, answers it and waits for it to close. */
export async function answerConfirmation(page: Page, which: Confirmation, answer: "confirm" | "cancel") {
  const dialog = confirmDialog(page);
  await expectInitialFocus(page);
  await expect(dialog).toHaveAccessibleName(texts[which].title);
  await expect(dialog).toContainText(texts[which].message);
  const button = answer === "confirm" ? texts[which].confirm : strings.confirmCancel;
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toHaveCount(0);
}
