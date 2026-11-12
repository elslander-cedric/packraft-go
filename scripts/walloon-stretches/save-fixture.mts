// Saves a small OSM extract from the local cache as a test fixture (#54), so the
// preparation logic is tested on real OSM data without any live call.
// Usage: npx tsx scripts/walloon-stretches/save-fixture.mts <river> <name> <south> <west> <north> <east>
// Keeps the river's elements with a point inside the box, plus the national border ways in it.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { OverpassElement } from "../../src/dataprep/walloonStretches/overpass";
import { loadOsmData, ROOT } from "./osmCache";

const [river, name, ...box] = process.argv.slice(2);
const [south, west, north, east] = box.map(Number);
const inside = (lat: number, lon: number) => lat >= south && lat <= north && lon >= west && lon <= east;
const keep = (overpassElement: OverpassElement) =>
  overpassElement.type === "node"
    ? inside(overpassElement.lat!, overpassElement.lon!)
    : (overpassElement.geometry ?? []).some((point) => point !== null && inside(point.lat, point.lon));
const slim = (overpassElement: OverpassElement): OverpassElement => ({
  type: overpassElement.type,
  id: overpassElement.id,
  ...(overpassElement.lat !== undefined ? { lat: overpassElement.lat, lon: overpassElement.lon } : {}),
  ...(overpassElement.tags ? { tags: overpassElement.tags } : {}),
  ...(overpassElement.geometry ? { geometry: overpassElement.geometry } : {}),
});

const osm = await loadOsmData({ offline: true });
const fixture = {
  note: `OSM extract (© OpenStreetMap contributors, ODbL) for the ${river}, box ${box.join(",")}. Saved from the Overpass cache by save-fixture.mts.`,
  river: { elements: osm.rivers[river].elements.filter(keep).map(slim) },
  border: { elements: osm.border.elements.filter(keep).map(slim) },
};
const file = path.join(ROOT, "src", "dataprep", "walloonStretches", "fixtures", `${name}.json`);
await writeFile(file, JSON.stringify(fixture) + "\n");
console.log(`${file}: ${fixture.river.elements.length} river elements, ${fixture.border.elements.length} border ways`);
