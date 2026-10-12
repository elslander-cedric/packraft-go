// Save to file / open from file (#10, ADR 0011) and GPX export (#11, ADR 0006).
// Uses the same save format as autosave; the formats, their validation and the
// file names live in the core.
import { gpxFileName, tripToGpx, type GpxNames } from "@/core/gpx";
import { parseTrip, saveFileName, serialiseTrip, type ParseResult } from "@/core/saveFile";
import type { Trip } from "@/core/trip";

/** Hands `text` to the browser as a downloaded file called `fileName`. */
function downloadText(text: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoke later: revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Downloads the trip as a save file named after it (`untitledName` when it has no name). */
export function downloadTripFile(trip: Trip, untitledName: string): void {
  downloadText(serialiseTrip(trip), saveFileName(trip, untitledName), "application/json");
}

/** Downloads the trip as a GPX file named after it (`names.untitledTrip` when it has no name). */
export function downloadGpxFile(trip: Trip, names: GpxNames): void {
  downloadText(tripToGpx(trip, names), gpxFileName(trip, names.untitledTrip), "application/gpx+xml");
}

/** Reads a chosen file as a trip. Any file that is not a valid save file is rejected. */
export async function readTripFile(file: File): Promise<ParseResult> {
  try {
    return parseTrip(await file.text());
  } catch {
    return { ok: false };
  }
}
