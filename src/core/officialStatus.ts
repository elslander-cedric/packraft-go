// Official status (ADR 0035, GLOSSARY "Official status"): the SPW's own
// status per official stretch for today, and what each of its codes means. Pure:
// readings are passed in by whoever asked the source.
import type { OfficialIncidents } from "./incident";

/** What the SPW publishes for one official stretch. `code` is its status code, as published. */
export type OfficialReading = {
  readonly code: string;
  /** The SPW's reason in English, when it gives one. */
  readonly reasonEn?: string;
  /** The SPW's reason in French, when it gives one. */
  readonly reasonFr?: string;
};

/**
 * Today's readings, keyed by official stretch id. `failed` means the service
 * could not be reached or answered with an error.
 */
export type OfficialReadings =
  | { readonly status: "ok"; readonly stretches: Readonly<Record<string, OfficialReading>> }
  | { readonly status: "failed" };

/**
 * Gives today's reading of every official stretch, and the SPW's current incidents. One
 * refresh serves both, and each can fail without the other. The real implementation (the
 * PKAYAK adapter) is injected; tests pass a fake. Implementations never throw: a failure
 * is a `failed` result.
 */
export interface OfficialStatusSource {
  readings(): Promise<OfficialReadings>;
  incidents(): Promise<OfficialIncidents>;
}

/** Why the SPW closed a stretch: code 0 means too low, or whatever reason it gives. */
export type OfficialClosure = "too-low-or-stated" | "high-water" | "out-of-season";

/**
 * What the official status says about one stretch for today:
 * - `open`: paddling allowed; `soon` when the SPW warns it may soon be forbidden.
 * - `closed`: forbidden today, with the SPW's reason if it gives one.
 * - `unrecognised`: a code the app doesn't know, which never reads as open.
 * - `unavailable`: no reading for this stretch, so the computed status stands.
 * - `none`: the SPW lists no official stretch here, so no official status exists.
 */
export type OfficialVerdict =
  | { readonly kind: "open"; readonly soon?: true }
  | { readonly kind: "closed"; readonly cause: OfficialClosure; readonly reason?: string }
  | { readonly kind: "unrecognised"; readonly code: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "none" };

/** What the app asks the SPW and may have to go without, today or on a future date: the note names each one. */
export type OfficialCheck = "closures" | "incidents";

/** A stretch the SPW has closed today, with its reason if it gives one. */
export type OfficialClosedVerdict = Extract<OfficialVerdict, { kind: "closed" }>;

function closed(cause: OfficialClosure, { reasonEn, reasonFr }: OfficialReading): OfficialVerdict {
  const reason = reasonEn ?? reasonFr;
  return { kind: "closed", cause, ...(reason !== undefined && { reason }) };
}

function verdictOf(reading: OfficialReading): OfficialVerdict {
  switch (reading.code) {
    case "0":
      return closed("too-low-or-stated", reading);
    case "1":
    case "5":
      return { kind: "open" };
    case "2":
      return { kind: "open", soon: true };
    case "3":
      return closed("high-water", reading);
    case "4":
      return closed("out-of-season", reading);
    default:
      return { kind: "unrecognised", code: reading.code };
  }
}

/**
 * What the SPW couldn't answer at all, whatever the water: for a note on the whole map.
 * Empty before an answer, and when something isn't asked for (undefined).
 */
export function checksFailed(
  readings: OfficialReadings | undefined,
  incidents: OfficialIncidents | undefined,
): readonly OfficialCheck[] {
  return [
    ...(readings?.status === "failed" ? (["closures"] as const) : []),
    ...(incidents?.status === "failed" ? (["incidents"] as const) : []),
  ];
}

/** A stretch's official verdict for today; undefined while its readings haven't arrived. */
export function officialVerdict(
  officialStretch: string | undefined,
  readings: OfficialReadings | undefined,
): OfficialVerdict | undefined {
  if (officialStretch === undefined) {
    return { kind: "none" };
  }
  if (!readings) {
    return undefined;
  }
  if (readings.status === "failed") {
    return { kind: "unavailable" };
  }
  const reading = readings.stretches[officialStretch];
  return reading ? verdictOf(reading) : { kind: "unavailable" };
}
