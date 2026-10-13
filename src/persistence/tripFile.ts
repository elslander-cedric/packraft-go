// Save to file / open from file (#10, ADR 0011) and GPX export (#11, #41; ADR 0006, ADR 0021).
// Uses the same save format as autosave; the formats, their validation and the
// file names live in the core.
import { strToU8, zipSync } from "fflate";
import { gpxZipFileName, tripToGpxFiles, type GpxNames } from "@/core/gpx";
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

/** The trip's GPX files, one per section (ADR 0021), as the bytes of one ZIP file. */
export function gpxZip(trip: Trip, names: GpxNames): Uint8Array {
  const entries = Object.fromEntries(tripToGpxFiles(trip, names).map((file) => [file.fileName, strToU8(file.text)]));
  return zipSync(entries);
}

/**
 * Downloads the trip's GPX files as one ZIP named after the trip
 * (`names.untitledTrip` when it has no name). One download, because browsers
 * block or ask about pages that download several files at once (ADR 0021).
 */
export function downloadGpxZip(trip: Trip, names: GpxNames): void {
  download(gpxZip(trip, names) as Uint8Array<ArrayBuffer>, gpxZipFileName(trip, names.untitledTrip), "application/zip");
}

/** Reads a chosen file as a trip. Any file that is not a valid save file is rejected. */
export async function readTripFile(file: File): Promise<ParseResult> {
  try {
    return parseTrip(await file.text());
  } catch {
    return { ok: false };
  }
}
