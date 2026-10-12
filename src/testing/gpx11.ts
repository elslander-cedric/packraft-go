// Test support for GPX export (#11): parses GPX text and checks it against the
// GPX 1.1 schema's structure (https://www.topografix.com/GPX/1/1/gpx.xsd),
// without fetching the schema. Shared by unit and e2e tests.
import { DOMParser, type Element } from "@xmldom/xmldom";

export const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";

export type GpxPoint = { lat: number; lon: number; ele?: number; name?: string };
export type GpxTrack = { name?: string; points: GpxPoint[] };
export type ParsedGpx = { metadataName?: string; waypoints: GpxPoint[]; tracks: GpxTrack[] };

/** Child elements a GPX 1.1 type allows, in schema order, with how often each may occur. */
type Sequence = readonly (readonly [name: string, max: number])[];
const MANY = Infinity;

const GPX_TYPE: Sequence = [["metadata", 1], ["wpt", MANY], ["rte", MANY], ["trk", MANY], ["extensions", 1]];
const METADATA_TYPE: Sequence = [
  ["name", 1], ["desc", 1], ["author", 1], ["copyright", 1], ["link", MANY],
  ["time", 1], ["keywords", 1], ["bounds", 1], ["extensions", 1],
];
const WPT_TYPE: Sequence = [
  ["ele", 1], ["time", 1], ["magvar", 1], ["geoidheight", 1], ["name", 1], ["cmt", 1], ["desc", 1],
  ["src", 1], ["link", MANY], ["sym", 1], ["type", 1], ["fix", 1], ["sat", 1], ["hdop", 1], ["vdop", 1],
  ["pdop", 1], ["ageofdgpsdata", 1], ["dgpsid", 1], ["extensions", 1],
];
const TRK_TYPE: Sequence = [
  ["name", 1], ["cmt", 1], ["desc", 1], ["src", 1], ["link", MANY],
  ["number", 1], ["type", 1], ["extensions", 1], ["trkseg", MANY],
];
const TRKSEG_TYPE: Sequence = [["trkpt", MANY], ["extensions", 1]];

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

class GpxStructureError extends Error {}

function fail(message: string): never {
  throw new GpxStructureError(message);
}

function children(element: Element): Element[] {
  const found: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === node.ELEMENT_NODE) found.push(node as Element);
    else if (node.nodeType === node.TEXT_NODE && node.nodeValue?.trim() && element.localName !== "name") {
      fail(`<${element.localName}> holds stray text "${node.nodeValue.trim()}"`);
    }
  }
  return found;
}

/** Checks the element's children follow the type's sequence; returns them. */
function checkSequence(element: Element, sequence: Sequence): Element[] {
  const elements = children(element);
  let position = 0;
  let count = 0;
  for (const child of elements) {
    if (child.namespaceURI !== GPX_NAMESPACE) fail(`<${child.tagName}> is not in the GPX 1.1 namespace`);
    while (position < sequence.length && sequence[position][0] !== child.localName) {
      position += 1;
      count = 0;
    }
    if (position === sequence.length) fail(`<${child.localName}> is not allowed here in <${element.localName}>`);
    count += 1;
    if (count > sequence[position][1]) fail(`too many <${child.localName}> in <${element.localName}>`);
  }
  return elements;
}

function decimal(text: string, what: string): number {
  if (!DECIMAL.test(text.trim())) fail(`${what} "${text}" is not a decimal`);
  return Number(text);
}

function text(element: Element): string {
  return element.textContent ?? "";
}

/** A wpt or trkpt (both wptType): lat and lon attributes in range, optional ele and name. */
function readPoint(element: Element): GpxPoint {
  const lat = decimal(element.getAttribute("lat") ?? "", "lat");
  const lon = decimal(element.getAttribute("lon") ?? "", "lon");
  if (lat < -90 || lat > 90) fail(`lat ${lat} is out of range`);
  if (lon < -180 || lon >= 180) fail(`lon ${lon} is out of range`);
  const point: GpxPoint = { lat, lon };
  for (const child of checkSequence(element, WPT_TYPE)) {
    if (child.localName === "ele") point.ele = decimal(text(child), "ele");
    if (child.localName === "name") point.name = text(child);
  }
  return point;
}

function readTrack(element: Element): GpxTrack {
  const track: GpxTrack = { points: [] };
  for (const child of checkSequence(element, TRK_TYPE)) {
    if (child.localName === "name") track.name = text(child);
    if (child.localName === "trkseg") {
      for (const point of checkSequence(child, TRKSEG_TYPE)) {
        if (point.localName === "trkpt") track.points.push(readPoint(point));
      }
    }
  }
  return track;
}

/**
 * Parses GPX text, throwing when it is not well-formed XML or does not follow
 * the GPX 1.1 structure (root, namespace, version, element order and counts,
 * required attributes and coordinate ranges). Returns what tests assert on.
 */
export function parseGpx11(gpx: string): ParsedGpx {
  if (!gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail("missing XML declaration");
  // XML 1.0 Char production; xmldom accepts characters outside it, so check the raw text first.
  const invalidChar = gpx.match(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/u);
  if (invalidChar) {
    fail(`character U+${invalidChar[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} is not allowed in XML 1.0`);
  }
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") fail(`not well-formed XML: ${message}`);
    },
  }).parseFromString(gpx, "application/xml");
  const root = document.documentElement;
  if (!root || root.localName !== "gpx" || root.namespaceURI !== GPX_NAMESPACE) fail("root is not a GPX 1.1 <gpx>");
  if (root.getAttribute("version") !== "1.1") fail('<gpx> version is not "1.1"');
  if (!root.getAttribute("creator")) fail("<gpx> has no creator");

  const parsed: ParsedGpx = { waypoints: [], tracks: [] };
  for (const child of checkSequence(root, GPX_TYPE)) {
    if (child.localName === "metadata") {
      const name = checkSequence(child, METADATA_TYPE).find((e) => e.localName === "name");
      if (name) parsed.metadataName = text(name);
    }
    if (child.localName === "wpt") parsed.waypoints.push(readPoint(child));
    if (child.localName === "trk") parsed.tracks.push(readTrack(child));
  }
  return parsed;
}
