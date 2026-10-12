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

/** Waits for the `which` confirmation, checks its text, answers it and waits for it to close. */
export async function answerConfirmation(page: Page, which: Confirmation, answer: "confirm" | "cancel") {
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(texts[which].title);
  await expect(dialog).toContainText(texts[which].message);
  const button = answer === "confirm" ? texts[which].confirm : strings.confirmCancel;
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toHaveCount(0);
}
