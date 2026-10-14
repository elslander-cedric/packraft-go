// What the built-in access data contains and where its geometry comes from in
// OpenStreetMap (ADR 0024). Rules come from docs/research (access-rules.md,
// flanders.md), researched 2026-10-12. Change a rule here, then re-run
// `npm run prepare:access-data` to regenerate src/access/data/.
import type { AccessRecord, AccessRule, AccessSource, Position } from "@/core/access";

export const RESEARCHED = "2026-10-12";

const sources = {
  bvr2021: {
    title: "BVR of 7 May 2021 on non-navigable watercourses, art. 21",
    url: "https://codex.vlaanderen.be/PrintDocument.ashx?id=1035746&geannoteerd=false&print=false",
  },
  visurisKano: { title: "De Vlaamse Waterweg, Visuris: Kano", url: "https://www.visuris.be/kano" },
  agw2009: {
    title: "AGW of 19 March 2009 on traffic on watercourses",
    url: "https://environnement.wallonie.be/home/loisirs/circulation-sur-les-cours-deau/les-textes-legislatifs.html",
  },
  brusselsCanal: {
    title: "Brussels police regulation for the canal and port (AGRBC of 4 March 2010, art. 127-128)",
    url: "https://etaamb.openjustice.be/fr/arrete-du-gouvernement-de-la-region-de-bruxellescapit_n2010031142.html",
  },
  brusselsPonds: {
    title: "Bruxelles Environnement on boats on Brussels ponds (bx1, 7 May 2020)",
    url: "https://bx1.be/communes/bruxelles-ville/un-kayakiste-qui-demandait-la-regularisation-de-sans-papier-arrete-au-bois-de-la-cambre/",
  },
  brusselsSenne: {
    title: "bx1: a kayak descent of the underground Senne (organised action)",
    url: "https://bx1.be/categories/news/une-descente-en-kayak-pas-comme-les-autres-sur-la-senne-souterraine/",
  },
  brusselsStreams: {
    title: "Bruxelles Environnement: management and protection of non-navigable watercourses and ponds (ordinance of 16 May 2019)",
    url: "https://environnement.brussels/citoyen/reglementation-et-inspection/obligations-et-autorisations/la-gestion-et-la-protection-des-cours-deau-non-navigables-et-des-etangs-bruxellois",
  },
  bruges: {
    title: "City of Bruges: kayaking, canoeing, rowing and SUP",
    url: "https://www.brugge.be/vrije-tijd/sport/meer-sporten/kajakken-kanovaren-roeien-suppen",
  },
  antwerpHpv: {
    title: "Port of Antwerp police regulation of 2 October 2021, art. 6.2",
    url: "https://themis.vlaanderen.be/files/61dc5f5cd129f6000c00173a/download",
  },
  ghentHpv: {
    title: "North Sea Port police regulation, port area Ghent (2026), art. 3.1.9",
    url: "https://media.northseaport.com/cdn/Nj5t2Sbds7C9/north-sea-port-havenpolitieverordening-gent-2026.pdf",
  },
  vmm: {
    title: "VMM: canoe and kayak routes",
    url: "https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten",
  },
} satisfies Record<string, AccessSource>;

/** A region and its default rule. Geometry: the region's OSM boundary relation. */
export type RegionSpec = Omit<AccessRecord, "geometry" | "scope" | "region" | "researched"> & {
  relationId: number;
};

export const regionSpecs: readonly RegionSpec[] = [
  {
    id: "flanders",
    name: "Flanders",
    relationId: 53134,
    rule: {
      type: "fixed",
      state: "open",
      text:
        "Open by default: non-motorised craft may use non-navigable rivers (BVR 7 May 2021, art. 21) " +
        "and navigable waterways, apart from listed exceptions.",
      conditions: [
        "Never pass a lock on the water: portage around it.",
        "On navigable waterways, keep clear of shipping and give way.",
      ],
      link: sources.visurisKano,
    },
    source: sources.bvr2021,
    unverified:
      "Whether water managers have banned paddling on particular rivers: there is no central list of such bans.",
  },
  {
    id: "wallonia",
    name: "Wallonia",
    relationId: 90348,
    rule: {
      type: "fixed",
      state: "unknown",
      text:
        "Only stretches listed in the AGW of 19 March 2009 may be paddled, at set seasons, hours and flows. " +
        "packraft-go doesn't check Walloon stretches yet.",
      link: { title: "SPW: kayak status today", url: "https://kayak.spw.wallonie.be/" },
    },
    source: sources.agw2009,
  },
  {
    id: "brussels",
    name: "Brussels-Capital Region",
    relationId: 54094,
    rule: {
      type: "fixed",
      state: "unknown",
      text:
        "Only the canal is known to be open (with caveats), and ponds need permission. " +
        "For other Brussels water no rule was found either way.",
    },
    source: sources.brusselsStreams,
    unverified: "Brussels law gives no default right to paddle non-navigable water, but no ban was found either.",
  },
];

/** How a water's geometry is cut out of OpenStreetMap. */
export type WaterSpec = Omit<AccessRecord, "geometry" | "scope" | "researched"> & {
  rule: AccessRule;
  /** Overpass QL statements selecting the ways or relations (without output statements). */
  query: string;
  /** Lines (rivers, canals) or areas (docks). */
  shape: "lines" | "areas";
  /** Keeps only the ways or areas whose tags pass. */
  include?: (tags: Record<string, string>) => boolean;
  /** Keeps only the parts inside this envelope ([lng, lat] ring), drawn by hand around the place the rule names. */
  envelope?: Position[];
  /** Keeps only the part of the (merged) line between these two places. */
  between?: { from: Position; to: Position };
  /** Douglas–Peucker tolerance in metres. */
  toleranceM: number;
};

const box = (west: number, south: number, east: number, north: number): Position[] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

/** Port water: docks, harbour basins and port canals, but not the Albert canal, which starts in the port and is open. */
const isDock = (tags: Record<string, string>) =>
  tags.waterway === "dock" ||
  ["harbour", "dock", "lock"].includes(tags.water ?? "") ||
  (tags.water === "canal" && !/albert/i.test(tags.name ?? ""));

const forbidden = (text: string): AccessRule => ({ type: "fixed", state: "forbidden", text });

export const flandersWaterSpecs: readonly WaterSpec[] = [
  {
    id: "flanders-ghent-terneuzen-canal",
    name: "Ghent–Terneuzen canal",
    region: "flanders",
    rule: forbidden("De Vlaamse Waterweg excludes the Ghent–Terneuzen canal from canoeing and kayaking."),
    source: sources.visurisKano,
    query: "relation(12230517);",
    shape: "lines",
    matchWithinM: 100,
    toleranceM: 15,
  },
  {
    id: "flanders-lower-sea-scheldt",
    name: "Lower Sea Scheldt, downstream of Burcht",
    region: "flanders",
    rule: forbidden("De Vlaamse Waterweg excludes the fairway of the Lower Sea Scheldt downstream of Burcht."),
    source: sources.visurisKano,
    query: 'way["waterway"="river"]["name"="Schelde"](51.19,4.18,51.40,4.40);',
    shape: "lines",
    // From Burcht's latitude down to the Dutch border (the Flanders clip ends it there).
    envelope: box(4.18, 51.205, 4.4, 51.4),
    matchWithinM: 250,
    toleranceM: 15,
  },
  {
    id: "flanders-bruges-reien",
    name: "Reien (inner canals), Bruges",
    region: "flanders",
    rule: forbidden("Bruges doesn't allow going on the Reien on your own initiative; De Vlaamse Waterweg excludes them too."),
    source: sources.bruges,
    query: 'way["waterway"="canal"](51.193,3.212,51.222,3.242);',
    shape: "lines",
    include: (tags) => /rei$|^Dijver$|^Coupure$|^Minnewater$/i.test(tags.name ?? ""),
    unverified: "Which parts of the Ringvaart around Bruges are closed too.",
    toleranceM: 3,
  },
  {
    id: "flanders-lier-nete-diversion",
    name: "Afleiding van de Nete, Lier",
    region: "flanders",
    rule: forbidden("De Vlaamse Waterweg excludes the Afleiding van de Nete in Lier."),
    source: sources.visurisKano,
    query: 'way["waterway"]["name"="Afleidingsvaart van de Nete"](51.11,4.54,51.15,4.60);',
    shape: "lines",
    unverified: "Whether Visuris means this diversion channel (as mapped in OpenStreetMap) or the Binnennete through the centre.",
    toleranceM: 5,
  },
  {
    id: "flanders-port-antwerp",
    name: "Port of Antwerp",
    region: "flanders",
    rule: forbidden("Water sports, including canoeing and kayaking, need the harbour master's permission in the port."),
    source: sources.antwerpHpv,
    query: 'nwr["waterway"="dock"](51.22,4.18,51.40,4.43); nwr["natural"="water"](51.22,4.18,51.40,4.43);',
    shape: "areas",
    include: isDock,
    // The docks on both banks, north of the city centre's marinas up to the Dutch border.
    envelope: box(4.18, 51.225, 4.43, 51.4),
    unverified: "Whether a newer Port of Antwerp-Bruges regulation replaces the 2021 one; the port's edge is approximated by its docks.",
    toleranceM: 10,
  },
  {
    id: "flanders-port-ghent",
    name: "Port of Ghent (North Sea Port)",
    region: "flanders",
    rule: forbidden("All pleasure boating and water recreation is banned in the docks without written permission."),
    source: sources.ghentHpv,
    query: 'nwr["waterway"="dock"](51.03,3.70,51.25,3.90); nwr["natural"="water"](51.03,3.70,51.25,3.90);',
    shape: "areas",
    include: isDock,
    // The docks along the canal from the city's ring road to Zelzate, east of the Ringvaart (which stays open).
    // OSM's own port area (relation 17383856) only covers the southern docks, so it isn't used.
    envelope: box(3.74, 51.075, 3.86, 51.21),
    unverified: "The port's edge is approximated by the docks mapped in OpenStreetMap.",
    toleranceM: 10,
  },
  {
    id: "flanders-port-zeebrugge",
    name: "Port of Zeebrugge",
    region: "flanders",
    rule: forbidden("Bruges says going on the water on your own initiative isn't allowed in the port of Zeebrugge."),
    source: sources.bruges,
    query: 'nwr["waterway"="dock"](51.30,3.12,51.37,3.25); nwr["natural"="water"](51.30,3.12,51.37,3.25);',
    shape: "areas",
    include: isDock,
    // East of Blankenberge's marina.
    envelope: box(3.155, 51.3, 3.25, 51.37),
    unverified: "The Zeebrugge port regulation itself wasn't read; the status of the Boudewijnkanaal is open.",
    toleranceM: 10,
  },
  {
    id: "flanders-vmm-kleine-nete",
    name: "Kleine Nete (VMM agreement), Retie to Grobbendonk",
    region: "flanders",
    rule: {
      type: "fixed",
      state: "open",
      text: "Open under a VMM agreement, with extra rules.",
      conditions: [
        "Get in and out only at the 9 put-in points.",
        "No paddling from half an hour after sunset until sunrise.",
        "Closed once the warning or threshold level is reached at the Retie, Herentals or Grobbendonk gauges (waterinfo.be).",
        "Closed below 50 cm on the gauge at Retie.",
      ],
      link: {
        title: "VMM: paddling on the Kleine Nete",
        url: "https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kanovaren-op-de-kleine-nete",
      },
    },
    source: sources.vmm,
    query: "relation(10309979); relation(10309980);",
    shape: "lines",
    // From the Retie watermill to the Grobbendonk watermill.
    between: { from: [5.05227, 51.24396], to: [4.75289, 51.19445] },
    toleranceM: 10,
  },
  {
    id: "flanders-vmm-dijle",
    name: "Dijle (VMM agreement), regional border to the Demer",
    region: "flanders",
    rule: {
      type: "fixed",
      state: "open",
      text: "Open under a VMM agreement, with extra rules.",
      conditions: [
        "Get in only at the 11 marked points between Huldenberg and Rotselaar.",
        "Paddle only from sunrise to half an hour after sunset.",
        "Don't paddle at very high or very low water.",
      ],
      link: {
        title: "VMM: Dijle agreement",
        url: "https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/overeenkomst_kano_dijle_definitief_tw.pdf/@@download/file",
      },
    },
    source: sources.vmm,
    query: "relation(2469797);",
    shape: "lines",
    unverified: "The water-level thresholds: the agreement PDF couldn't be read.",
    toleranceM: 10,
  },
  {
    id: "flanders-vmm-zenne",
    name: "Zenne (VMM agreement), Lot to Drogenbos",
    region: "flanders",
    rule: {
      type: "fixed",
      state: "open",
      text: "Open under a VMM covenant, with extra rules.",
      conditions: ["No paddling from half an hour after sunset until sunrise.", "No motorised craft."],
      link: {
        title: "VMM: Zenne covenant (2023)",
        url: "https://www.vmm.be/water/beheer-waterlopen/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/convenant-kajak-zenne_2023.pdf",
      },
    },
    source: sources.vmm,
    query: "relation(2430630);",
    shape: "lines",
    // From Lot to Drogenbos, where the Zenne enters Brussels.
    between: { from: [4.2745, 50.7665], to: [4.3125, 50.7925] },
    unverified: "Whether the 2023 covenant (valid until 31-12-2023) was renewed.",
    toleranceM: 10,
  },
  {
    id: "flanders-vmm-stekene-zuidlede",
    name: "Kanaal van Stekene and Zuidlede (VMM agreement)",
    region: "flanders",
    rule: {
      type: "fixed",
      state: "open",
      text: "Open under the VMM agreement \"Peddelroute Waasland\" (February 2020), with extra rules.",
      conditions: ["Read the agreement for its rules before you go."],
      link: {
        title: "VMM: Peddelroute Waasland agreement",
        url: "https://vmm.vlaanderen.be/beleid/waterbeleid/waterrecreatie/kano-en-kajaktrajecten/kano-en-kajakkaarten-en-reglement/overeenkomst_peddelroute-waasland_feb2020_def.pdf/@@download/file",
      },
    },
    source: sources.vmm,
    query:
      'way["waterway"]["name"~"^(Kanaal van Stekene|Stekense Vaart)$"](51.10,3.95,51.25,4.10); relation(12234204);',
    shape: "lines",
    include: (tags) => tags.waterway !== "ditch",
    unverified: "The agreement's rules: its PDF wasn't read.",
    toleranceM: 10,
  },
];

/** Brussels waters (#57; docs/research/brussels.md, researched 2026-10-12). Geometry is kept inside the region. */
const BRUSSELS_BBOX = "50.76,4.24,50.93,4.50";
const isSenne = (tags: Record<string, string>) => /senne|zenne/i.test(tags.name ?? "");
const isCulvert = (tags: Record<string, string>) => ["culvert", "building_passage", "covered"].includes(tags.tunnel ?? "");

export const brusselsWaterSpecs: readonly WaterSpec[] = [
  {
    id: "brussels-canal",
    name: "Canal, Brussels",
    region: "brussels",
    rule: {
      type: "fixed",
      state: "open",
      text: "Paddling is allowed in the port domain, but commercial shipping has priority.",
      conditions: [
        "Commercial traffic has priority: keep to the edge and give way to barges.",
        "Read literally, the regulation requires a VHF radio and reporting to the Capitainerie (+32 2 247 91 21). " +
          "Whether this is enforced for paddlers is not confirmed: a courtesy call before a transit is advised.",
        "Portage around the Anderlecht and Molenbeek locks.",
        "Swimming in the canal is forbidden.",
      ],
      link: sources.brusselsCanal,
    },
    source: sources.brusselsCanal,
    query: `way["waterway"="canal"](${BRUSSELS_BBOX});`,
    shape: "lines",
    include: (tags) => /charleroi|zeekanaal|brussel-schelde|canal maritime/i.test(tags.name ?? "") && !isCulvert(tags),
    matchWithinM: 80,
    unverified:
      "Packrafts and SUPs aren't named in the regulation (read as small craft); " +
      "notices to skippers can reserve zones; the port domain's edge is taken to be the whole canal in the region; " +
      "the side basins are not drawn.",
    toleranceM: 5,
  },
  {
    id: "brussels-ponds",
    name: "Ponds, Brussels",
    region: "brussels",
    rule: {
      type: "fixed",
      state: "forbidden",
      text: "Boats are not allowed on Brussels ponds without permission.",
    },
    source: sources.brusselsPonds,
    query: `nwr["natural"="water"]["water"~"^(pond|lake|moat|reservoir)$"](${BRUSSELS_BBOX});`,
    shape: "areas",
    include: (tags) => tags.natural === "water" && /^(pond|lake|moat|reservoir)$/.test(tags.water ?? ""),
    unverified:
      "The quote concerns the regional ponds; the City-managed ponds (such as the Bois de la Cambre) " +
      "follow the City's own regulation, which wasn't found.",
    toleranceM: 5,
  },
  {
    id: "brussels-senne",
    name: "Senne (Zenne), Brussels",
    region: "brussels",
    rule: {
      type: "fixed",
      state: "unknown",
      text: "The Senne runs mostly underground through Brussels; no rule for paddling it was found.",
    },
    source: sources.brusselsSenne,
    query: `way["waterway"="river"]["name"~"Senne|Zenne"](${BRUSSELS_BBOX});`,
    shape: "lines",
    include: isSenne,
    unverified: "No legal text was found. The only known descents were organised actions from a Vivaqua site.",
    toleranceM: 5,
  },
  {
    id: "brussels-streams",
    name: "Small streams, Brussels",
    region: "brussels",
    rule: {
      type: "fixed",
      state: "unknown",
      text: "No rule for paddling Brussels' small streams was found; they are tiny and partly culverted.",
    },
    source: sources.brusselsStreams,
    query: `way["waterway"~"^(river|stream)$"](${BRUSSELS_BBOX});`,
    shape: "lines",
    include: (tags) => !isSenne(tags) && !isCulvert(tags),
    unverified: "Brussels law gives no default right to paddle non-navigable water; none was found either way.",
    toleranceM: 5,
  },
];

/** Where the portage-at-locks rule of each region comes from. */
export const lockRuleSources: Record<string, AccessSource> = {
  flanders: sources.visurisKano,
  brussels: sources.brusselsCanal,
};
export const LOCK_REGIONS = ["brussels", "flanders"] as const;
/** Covers Flanders and Brussels; the region areas cut it down. */
export const LOCK_BBOX = "50.67,2.50,51.52,5.95";
