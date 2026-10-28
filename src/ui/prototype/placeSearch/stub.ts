// PROTOTYPE (place search UI, #169): throwaway, never merged. A stub in place of Nominatim:
// canned answers in the shape the research found (jsonv2), so no live request is ever sent.
//
// Try: "hotton" (several results), "nisramont", "ourthe" (a big bounding box), "luik" (finds
// Liège), "50.27, 5.44" (coordinates, no request), "95, 5" (bad coordinates), "zzz" (nothing
// found), "fail" (search failed), "offline" (no connection; also when the browser is offline).

import type { LatLng } from "@/core/trip";

export type PrototypeResult = {
  id: string;
  /** Short label: Nominatim's `name`, or the first part of `display_name` when it is empty. */
  label: string;
  /** The rest of `display_name`, to tell results apart. */
  detail: string;
  /** From `addresstype` / `category`. */
  kind: string;
  at: LatLng;
  /** [south, north, west, east]; none for coordinates. */
  box: [number, number, number, number] | null;
};

type Canned = Omit<PrototypeResult, "label" | "detail"> & { name: string; displayName: string; also?: string[] };

const canned: Canned[] = [
  {
    id: "hotton",
    name: "Hotton",
    displayName: "Hotton, Marche-en-Famenne, Luxembourg, Wallonie, België / Belgique / Belgien",
    kind: "Town",
    at: { lat: 50.2675, lng: 5.4469 },
    box: [50.25, 50.29, 5.4, 5.49],
  },
  {
    id: "hotton-station",
    name: "Hotton",
    displayName: "Hotton, Rue de la Gare, Melreux, Hotton, Luxembourg, Wallonie, 6990, België / Belgique / Belgien",
    kind: "Railway station",
    at: { lat: 50.2832, lng: 5.4377 },
    box: [50.2827, 50.2837, 5.4372, 5.4382],
  },
  {
    id: "rue-du-moulin",
    name: "",
    displayName: "Rue du Moulin, Hotton, Marche-en-Famenne, Luxembourg, Wallonie, 6990, België / Belgique / Belgien",
    kind: "Road",
    at: { lat: 50.2702, lng: 5.4421 },
    box: [50.2695, 50.271, 5.4405, 5.4436],
    also: ["hotton"],
  },
  {
    id: "nisramont",
    name: "Barrage de Nisramont",
    displayName: "Barrage de Nisramont, N860, Nadrin, Houffalize, Luxembourg, Wallonie, België / Belgique / Belgien",
    kind: "Dam",
    at: { lat: 50.1316, lng: 5.661 },
    box: [50.131, 50.1322, 5.6595, 5.6625],
  },
  {
    id: "la-roche",
    name: "La Roche-en-Ardenne",
    displayName: "La Roche-en-Ardenne, Marche-en-Famenne, Luxembourg, Wallonie, België / Belgique / Belgien",
    kind: "Town",
    at: { lat: 50.1833, lng: 5.5756 },
    box: [50.17, 50.2, 5.55, 5.6],
  },
  {
    id: "durbuy",
    name: "Durbuy",
    displayName: "Durbuy, Marche-en-Famenne, Luxembourg, Wallonie, België / Belgique / Belgien",
    kind: "Town",
    at: { lat: 50.3524, lng: 5.4565 },
    box: [50.345, 50.36, 5.445, 5.47],
  },
  {
    id: "ourthe",
    name: "Ourthe",
    displayName: "Ourthe, Wallonie, België / Belgique / Belgien",
    kind: "River",
    at: { lat: 50.37, lng: 5.52 },
    box: [50.0, 50.64, 5.33, 5.98],
  },
  {
    id: "liege",
    name: "Liège",
    displayName: "Liège, Wallonie, België / Belgique / Belgien",
    kind: "City",
    at: { lat: 50.6326, lng: 5.5797 },
    box: [50.56, 50.69, 5.49, 5.68],
    also: ["luik", "luttich", "liege"],
  },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function toResult({ name, displayName, also: _also, ...rest }: Canned): PrototypeResult {
  const parts = displayName.split(", ");
  const label = name || parts[0];
  const detail = parts.slice(1).filter((p) => p !== label).slice(0, 3).join(", ");
  return { ...rest, label, detail };
}

export type Coordinates = { kind: "coordinates"; result: PrototypeResult } | { kind: "bad-coordinates"; message: string };

/** "50.27, 5.44" or "50.27 5.44": worked out on the device. Null when the text isn't coordinates. */
export function parseCoordinates(text: string): Coordinates | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90) return { kind: "bad-coordinates", message: "Latitude must be between -90 and 90." };
  if (Math.abs(lng) > 180) return { kind: "bad-coordinates", message: "Longitude must be between -180 and 180." };
  const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return { kind: "coordinates", result: { id: `coords-${label}`, label, detail: "", kind: "Coordinates", at: { lat, lng }, box: null } };
}

export type StubAnswer = { kind: "results"; results: PrototypeResult[] } | { kind: "offline" } | { kind: "failed" };

/** The stubbed Nominatim search: answers after a short delay, like a real request. */
export async function stubSearch(text: string): Promise<StubAnswer> {
  const q = fold(text.trim());
  if (q.includes("offline") || (typeof navigator !== "undefined" && !navigator.onLine)) return { kind: "offline" };
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (q.includes("fail")) return { kind: "failed" };
  const words = q.split(/\s+/).filter(Boolean);
  const found = canned.filter((c) => {
    const hay = fold([c.name, c.displayName, ...(c.also ?? [])].join(" "));
    return words.every((w) => hay.includes(w));
  });
  return { kind: "results", results: found.slice(0, 5).map(toResult) };
}
