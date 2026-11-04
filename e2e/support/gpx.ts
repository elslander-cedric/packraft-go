// Test support for the GPX export (#11, ADR 0037): clicks a button that
// downloads the trip's one GPX file and reads it in the test.
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";

/** Starts the download with `trigger`, then returns the GPX file's name and its text. */
export async function downloadGpx(page: Page, trigger: Locator | (() => Promise<void>)) {
  const start = typeof trigger === "function" ? trigger : () => trigger.click();
  const [download] = await Promise.all([page.waitForEvent("download"), start()]);
  const text = await readFile((await download.path())!, "utf8");
  return { name: download.suggestedFilename(), text };
}
