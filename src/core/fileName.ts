// File names for files the trip leaves the app as: the save file (#10) and the GPX export (#11).
import type { Trip } from "./trip";

// Characters Windows, macOS or Linux do not allow in file names, and control characters.
const unsafeInFileName = /[/\\:*?"<>|\u0000-\u001f]+/g;

/** The trip's name made safe for a file name, or `untitledName` for a trip without one, then `extension`. */
export function tripFileName(trip: Trip, untitledName: string, extension: string): string {
  const name = trip.name.replace(unsafeInFileName, "-").trim();
  return `${name || untitledName}${extension}`;
}
