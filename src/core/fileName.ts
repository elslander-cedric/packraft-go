// File names for files the trip leaves the app as: the save file and the GPX export.
import type { Trip } from "./trip";

// Characters Windows, macOS or Linux do not allow in file names, and control characters.
const unsafeInFileName = /[/\\:*?"<>|\u0000-\u001f]+/g;

/** `name` made safe for a file name, or `untitledName` when nothing is left, then `extension`. */
export function safeFileName(name: string, untitledName: string, extension: string): string {
  const safe = name.replace(unsafeInFileName, "-").trim();
  return `${safe || untitledName}${extension}`;
}

/** The trip's name made safe for a file name, or `untitledName` for a trip without one, then `extension`. */
export function tripFileName(trip: Trip, untitledName: string, extension: string): string {
  return safeFileName(trip.name, untitledName, extension);
}
