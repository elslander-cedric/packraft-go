// Save to file / open from file (#10, ADR 0011). Uses the same save format as
// autosave; the format, its validation and the file name live in the core.
import { parseTrip, saveFileName, serialiseTrip, type ParseResult } from "@/core/saveFile";
import type { Trip } from "@/core/trip";

/** Downloads the trip as a save file named after it (`untitledName` when it has no name). */
export function downloadTripFile(trip: Trip, untitledName: string): void {
  const url = URL.createObjectURL(new Blob([serialiseTrip(trip)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = saveFileName(trip, untitledName);
  link.click();
  // Revoke later: revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a chosen file as a trip. Any file that is not a valid save file is rejected. */
export async function readTripFile(file: File): Promise<ParseResult> {
  try {
    return parseTrip(await file.text());
  } catch {
    return { ok: false };
  }
}
