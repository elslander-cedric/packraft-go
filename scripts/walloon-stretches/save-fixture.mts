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
const keep = (e: OverpassElement) =>
  e.type === "node"
    ? inside(e.lat!, e.lon!)
    : (e.geometry ?? []).some((p) => p !== null && inside(p.lat, p.lon));
const slim = (e: OverpassElement): OverpassElement => ({
  type: e.type,
  id: e.id,
  ...(e.lat !== undefined ? { lat: e.lat, lon: e.lon } : {}),
  ...(e.tags ? { tags: e.tags } : {}),
  ...(e.geometry ? { geometry: e.geometry } : {}),
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
