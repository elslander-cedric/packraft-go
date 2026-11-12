// Save to file / open from file (ADR 0011) and GPX export (ADR 0006, ADR 0037).
// Uses the same save format as autosave; the formats, their validation and the
// file names live in the core.
import { tripToGpx, type GpxNames } from "@/core/gpx";
import { parseTrip, saveFileName, serialiseTrip, type ParseResult } from "@/core/saveFile";
import type { Trip } from "@/core/trip";

/** Hands `data` to the browser as a downloaded file called `fileName`. */
export function download(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoke later: revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Downloads the trip as a save file named after it (`untitledName` when it has no name). */
export function downloadTripFile(trip: Trip, untitledName: string): void {
  download(serialiseTrip(trip), saveFileName(trip, untitledName), "application/json");
}

/** Downloads the trip as one GPX file named after it (`names.untitledTrip` when it has no name). A trip without legs downloads nothing. */
export function downloadGpx(trip: Trip, names: GpxNames): void {
  const gpx = tripToGpx(trip, names);
  if (gpx) download(gpx.text, gpx.fileName, "application/gpx+xml");
}

/** Reads a chosen file as a trip. Any file that is not a valid save file is rejected. */
export async function readTripFile(file: File): Promise<ParseResult> {
  try {
    return parseTrip(await file.text());
  } catch {
    return { ok: false };
  }
}
