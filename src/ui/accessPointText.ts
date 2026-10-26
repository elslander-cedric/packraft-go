import type { AccessPoint } from "@/core/accessPoints";
import { strings } from "./strings";

const text = strings.accessPoints;

/** How an access point reads in a list, a marker or a snap offer (#136). */
export type AccessPointText = {
  /** What makes it recognisable: its name, else its note's first line, else its use and kind. */
  readonly heading: string;
  /** The note, without the line used as the heading; "" for none. */
  readonly note: string;
  /** Its use and kind, e.g. "Put-in, Slipway", or null when that is already the heading. */
  readonly detail: string | null;
};

export function accessPointText(point: AccessPoint): AccessPointText {
  const useAndKind = text.useAndKind(text.uses[point.use], text.kinds[point.kind]);
  const name = point.name.trim();
  if (name) return { heading: name, note: point.note.trim(), detail: useAndKind };
  const [first, ...rest] = point.note.split("\n").map((line) => line.trim()).filter(Boolean);
  if (first) return { heading: first, note: rest.join("\n"), detail: useAndKind };
  return { heading: useAndKind, note: "", detail: null };
}
