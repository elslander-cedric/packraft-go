// Small, hand-made access rule data for core tests: a square "Flanders" and a few
// waters in it. Distances: 0.001° of latitude is about 111 m.
import type { AccessRecord, AccessRules } from "../access";
import type { LatLng } from "../trip";

const source = { title: "Visuris: Kano", url: "https://www.visuris.be/kano" };
const researched = "2026-10-12";

/** A region from 50.5 to 51.5 N and 3.5 to 4.5 E, open by default. */
export const flandersSquare: AccessRecord = {
  id: "flanders",
  name: "Flanders",
  scope: "region",
  region: "flanders",
  rule: { type: "fixed", state: "open", text: "Open by default for non-motorised craft." },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [3.5, 50.5],
        [4.5, 50.5],
        [4.5, 51.5],
        [3.5, 51.5],
        [3.5, 50.5],
      ],
    ],
  },
  source: { title: "BVR 7 May 2021, art. 21", url: "https://codex.vlaanderen.be/" },
  researched,
};

/** A forbidden canal running east–west along 51.0 N. */
export const forbiddenCanal: AccessRecord = {
  id: "test-canal",
  name: "Test canal",
  scope: "water",
  region: "flanders",
  rule: { type: "fixed", state: "forbidden", text: "Excluded by the waterway manager." },
  geometry: {
    type: "LineString",
    coordinates: [
      [3.6, 51.0],
      [4.4, 51.0],
    ],
  },
  source,
  researched,
};

/** A forbidden port area: a small square around 51.3 N, 4.0 E. */
export const forbiddenPort: AccessRecord = {
  id: "test-port",
  name: "Test port",
  scope: "water",
  region: "flanders",
  rule: { type: "fixed", state: "forbidden", text: "No water sports without the harbour master's permission." },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [3.95, 51.28],
        [4.05, 51.28],
        [4.05, 51.32],
        [3.95, 51.32],
        [3.95, 51.28],
      ],
    ],
  },
  source: { title: "Port police regulation", url: "https://example.org/hpv" },
  researched,
};

/** An agreement stretch running north–south along 3.8 E, open with extra rules. */
export const agreementStretch: AccessRecord = {
  id: "test-agreement",
  name: "Test river (agreement stretch)",
  scope: "water",
  region: "flanders",
  rule: {
    type: "fixed",
    state: "open",
    text: "Open under a VMM agreement, with extra rules.",
    conditions: ["No paddling from half an hour after sunset until sunrise."],
    link: { title: "VMM agreement", url: "https://vmm.vlaanderen.be/" },
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [3.8, 50.6],
      [3.8, 50.9],
    ],
  },
  source: { title: "VMM", url: "https://vmm.vlaanderen.be/" },
  researched,
  unverified: "Whether the agreement was renewed.",
};

export const insideFlanders: LatLng = { lat: 51.2, lng: 4.0 };
/** About 11 m north of the forbidden canal. */
export const onForbiddenCanal: LatLng = { lat: 51.0001, lng: 4.0 };
/** About 220 m north of the forbidden canal. */
export const nearForbiddenCanal: LatLng = { lat: 51.002, lng: 4.0 };
export const inForbiddenPort: LatLng = { lat: 51.3, lng: 4.0 };
export const onAgreementStretch: LatLng = { lat: 50.75, lng: 3.8 };
export const outsideAnyRegion: LatLng = { lat: 52.5, lng: 4.0 };

/** Builds the rules the core evaluates from a list of records. */
export function fakeAccessRules(records: readonly AccessRecord[]): AccessRules {
  return { records };
}
