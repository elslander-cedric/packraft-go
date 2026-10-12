// Test support for the GPX export (#41, ADR 0021): clicks a button that
// downloads the ZIP of GPX files and unzips it in the test.
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import type { Locator, Page } from "@playwright/test";

/** One GPX file from the ZIP: its name inside the ZIP and its text. */
export type ZippedGpx = { name: string; text: string };

/** Starts the download with `trigger`, then returns the ZIP's name and its files in ZIP order. */
export async function downloadGpxZip(page: Page, trigger: Locator | (() => Promise<void>)) {
  const start = typeof trigger === "function" ? trigger : () => trigger.click();
  const [download] = await Promise.all([page.waitForEvent("download"), start()]);
  const entries = unzipSync(await readFile((await download.path())!));
  const files: ZippedGpx[] = Object.entries(entries).map(([name, bytes]) => ({ name, text: strFromU8(bytes) }));
  return { name: download.suggestedFilename(), files };
}
