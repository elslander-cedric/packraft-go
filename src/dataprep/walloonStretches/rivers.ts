// The rivers that carry Walloon stretches (AGW Annex 1), with the names OSM uses
// for them and a generous search box. One Overpass query per river (#54).

export type Bbox = { south: number; west: number; north: number; east: number };

export type RiverConfig = {
  /** Annex 1 river name, as in docs/research/data/walloon-stretches.json. */
  river: string;
  /** Names OSM uses (articles like "La" or "L'" and bilingual "A - B" forms are handled separately). */
  osmNames: string[];
  bbox: Bbox;
  /** Named streams (not rivers) needed for a confluence, e.g. the Estinée. */
  streams?: string[];
};

export const RIVERS: readonly RiverConfig[] = [
  { river: "Amblève", osmNames: ["Amblève", "Amel"], bbox: { south: 50.22, west: 5.55, north: 50.56, east: 6.12 } },
  { river: "Lesse", osmNames: ["Lesse"], bbox: { south: 49.95, west: 4.86, north: 50.27, east: 5.4 } },
  { river: "Ourthe", osmNames: ["Ourthe"], bbox: { south: 50.1, west: 5.25, north: 50.66, east: 5.8 } },
  { river: "Semois", osmNames: ["Semois", "Semoy"], bbox: { south: 49.62, west: 4.78, north: 49.92, east: 5.6 } },
  { river: "Viroin", osmNames: ["Viroin"], bbox: { south: 50.02, west: 4.48, north: 50.14, east: 4.78 } },
  { river: "Warche", osmNames: ["Warche"], bbox: { south: 50.37, west: 5.93, north: 50.5, east: 6.2 } },
  { river: "Salm", osmNames: ["Salm"], bbox: { south: 50.22, west: 5.8, north: 50.4, east: 6.0 } },
  { river: "Lhomme", osmNames: ["Lhomme", "Lomme"], bbox: { south: 50.02, west: 5.08, north: 50.2, east: 5.34 } },
  { river: "Houille", osmNames: ["Houille"], bbox: { south: 49.94, west: 4.76, north: 50.13, east: 5.04 } },
  { river: "Sûre", osmNames: ["Sûre", "Sauer"], bbox: { south: 49.77, west: 5.66, north: 49.93, east: 5.9 } },
  { river: "Our", osmNames: ["Our"], bbox: { south: 50.08, west: 6.02, north: 50.34, east: 6.3 } },
  { river: "Aisne", osmNames: ["Aisne"], streams: ["Estin"], bbox: { south: 50.2, west: 5.44, north: 50.41, east: 5.78 } },
  {
    river: "Ourthe occidentale",
    osmNames: ["Ourthe occidentale"],
    bbox: { south: 49.97, west: 5.38, north: 50.18, east: 5.73 },
  },
  {
    river: "Ourthe orientale",
    osmNames: ["Ourthe orientale"],
    bbox: { south: 50.08, west: 5.62, north: 50.2, east: 5.9 },
  },
  { river: "Vierre", osmNames: ["Vierre"], bbox: { south: 49.71, west: 5.26, north: 49.85, east: 5.46 } },
];

const ARTICLE = /^(l'|l’|la |le |les |die |der |d')/;

/** Lower case, no accents, no leading article: "L'Ourthe" -> "ourthe". */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(ARTICLE, "")
    .trim();
}

/** True when any of a waterway's OSM names (name, alt_name, name:fr, ...) names one of these rivers. */
export function tagsMatch(tags: Readonly<Record<string, string>> | undefined, names: readonly string[]): boolean {
  if (!tags) return false;
  return ["name", "alt_name", "name:fr", "name:de", "official_name"].some((k) => nameMatches(tags[k], names));
}

/** True when an OSM name ("La Sûre", "Sauer - Sûre", "Amblève/Amel") names one of these rivers. */
export function nameMatches(osmName: string | undefined, names: readonly string[]): boolean {
  if (!osmName) return false;
  const wanted = new Set(names.map(normaliseName));
  return osmName
    .split(/\s+-\s+|\s*\/\s*|;/)
    .map(normaliseName)
    .some((part) => wanted.has(part));
}

/**
 * One Overpass query per river: the river's ways, named waterways touching it
 * (for confluences), bridges, dams and weirs, hydro plants and slipways near it,
 * places within a few km, and the national boundary inside the box.
 */
export function riverQuery(config: RiverConfig): string {
  const { south, west, north, east } = config.bbox;
  const box = `${south},${west},${north},${east}`;
  // Plain box queries on indexed tags: "around" filters along a long river time out
  // on the public servers. Everything is filtered by distance to the river afterwards.
  const streams = (config.streams ?? []).map((n) => n.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&")).join("|");
  return [
    `[out:json][timeout:180][bbox:${box}];`,
    `(`,
    `  way["waterway"="river"];`,
    ...(streams ? [`  way["waterway"="stream"]["name"~"${streams}",i];`] : []),
    `  way["bridge"]["highway"];`,
    `  way["bridge"]["railway"];`,
    `  way["man_made"="bridge"];`,
    `  nw["waterway"~"^(dam|weir)$"];`,
    `  nw["power"~"^(plant|generator)$"];`,
    `  node["leisure"="slipway"];`,
    `  node["place"~"^(town|village|hamlet|suburb|neighbourhood|locality|isolated_dwelling)$"];`,
    `);`,
    `out geom;`,
  ].join("\n");
}

/** Box around every river, for the one national boundary query. */
export function allRiversBbox(rivers: readonly RiverConfig[] = RIVERS): Bbox {
  return {
    south: Math.min(...rivers.map((r) => r.bbox.south)),
    west: Math.min(...rivers.map((r) => r.bbox.west)),
    north: Math.max(...rivers.map((r) => r.bbox.north)),
    east: Math.max(...rivers.map((r) => r.bbox.east)),
  };
}

/** The national boundary (ISO code BE) ways inside the box: one query for all border end points. */
export function borderQuery(bbox: Bbox = allRiversBbox()): string {
  const { south, west, north, east } = bbox;
  return [
    `[out:json][timeout:180];`,
    // Relation 52411 is the national boundary (ISO3166-1 BE, admin_level 2); by id, a tag search times out.
    `rel(52411)->.country;`,
    `way(r.country)(${south},${west},${north},${east});`,
    `out geom;`,
  ].join("\n");
}
