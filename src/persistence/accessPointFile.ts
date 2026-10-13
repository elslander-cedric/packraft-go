// Export and import of your access points as a file (#55, ADR 0023): a backup,
// a way to move them between phone and desktop, and to share them with friends.
// Same format as autosave; the format and its validation live in the core.
import {
  ACCESS_POINTS_FILE_NAME,
  parseAccessPoints,
  serialiseAccessPoints,
  type AccessPoints,
  type AccessPointsParseResult,
} from "@/core/accessPoints";
import { download } from "./tripFile";

/** Downloads your access points as one file. */
export function downloadAccessPointsFile(points: AccessPoints): void {
  download(serialiseAccessPoints(points), ACCESS_POINTS_FILE_NAME, "application/json");
}

/** Reads a chosen file as access points. Any file that is not a valid access points file is refused. */
export async function readAccessPointsFile(file: File): Promise<AccessPointsParseResult> {
  try {
    return parseAccessPoints(await file.text());
  } catch {
    return { ok: false };
  }
}
