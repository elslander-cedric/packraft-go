// Your access points in the route network (ADR 0039, ADR 0023): at search time they join it as
// nodes, with estimated walks to the nodes nearby and, when one lies on a water, as a place to
// get in or out there. Pure: the network is never changed, a new one is returned.
import type { AccessPoint, AccessPoints } from "./accessPoints";
import { distanceM, projectOntoLine, type Position } from "./geo";
import type {
  PaddleLink,
  RouteNetwork,
  RouteNode,
  WalkingLink,
} from "./routeNetwork";
import type { LatLng } from "./trip";

/** An estimated walk is the straight line times this, for the bends of real paths. */
const WALK_DETOUR_FACTOR = 1.3;
/** The longest walk, as for the prepared walking links (about 15 km). */
const WALKING_CEILING_M = 15_000;
/** An access point this close to a paddle link's line is on that water, as for official aires. */
const ON_WATER_M = 150;
/** An access point this close along the water to a link's end gets in or out there already. */
const LINK_END_M = 50;

/** The network with your access points joined. */
export function withAccessPoints(
  network: RouteNetwork,
  points: AccessPoints,
): RouteNetwork {
  return points.reduce(withAccessPoint, network);
}

/** The route node id of your access point with this id. */
export const accessPointNodeId = (id: string) => `access-point-${id}`;

function withAccessPoint(
  network: RouteNetwork,
  point: AccessPoint,
): RouteNetwork {
  const node: RouteNode = {
    id: accessPointNodeId(point.id),
    kind: "access-point",
    use: point.use,
    position: [point.position.lng, point.position.lat],
  };
  return {
    ...network,
    nodes: [...network.nodes, node],
    paddleLinks: onWater(network.paddleLinks, node, point.position),
    walkingLinks: [
      ...(network.walkingLinks ?? []),
      ...estimatedWalks(network.nodes, node, point.position),
    ],
  };
}

const latLng = ([lng, lat]: Position): LatLng => ({ lat, lng });

/** A straight walk from every node near enough to the access point. */
function estimatedWalks(
  nodes: readonly RouteNode[],
  to: RouteNode,
  at: LatLng,
): WalkingLink[] {
  return nodes.flatMap((from) => {
    const walkM = Math.round(
      distanceM(latLng(from.position), at) * WALK_DETOUR_FACTOR,
    );
    if (walkM > WALKING_CEILING_M) return [];
    // Nothing is known of its paths: no trail or road share, no climb.
    return [
      {
        from: from.id,
        to: to.id,
        distanceM: walkM,
        climbM: 0,
        descentM: 0,
        trailShare: 0,
        roadShare: 0,
        line: [from.position, to.position],
      },
    ];
  });
}

/** The paddle links with the one the access point is on, if any, split there into two. */
function onWater(
  links: readonly PaddleLink[],
  node: RouteNode,
  at: LatLng,
): readonly PaddleLink[] {
  let nearest: { link: PaddleLink; offM: number; alongM: number } | undefined;
  for (const link of links) {
    const { offM, alongM } = projectOntoLine(at, link.line.map(latLng));
    if (offM <= ON_WATER_M && (!nearest || offM < nearest.offM))
      nearest = { link, offM, alongM };
  }
  if (!nearest) return links;
  const { link, alongM } = nearest;
  const lengthM = lineLengthM(link.line);
  if (alongM < LINK_END_M || alongM > lengthM - LINK_END_M) return links;
  const [before, after] = splitLine(link.line, alongM);
  const beforeM = Math.round((link.distanceM * alongM) / lengthM);
  // Both halves keep the link's waters, records and obstacles: never more open than the whole.
  const halves: PaddleLink[] = [
    { ...link, to: node.id, distanceM: beforeM, line: before },
    {
      ...link,
      from: node.id,
      distanceM: link.distanceM - beforeM,
      line: after,
    },
  ];
  return links.flatMap((other) => (other === link ? halves : [other]));
}

function lineLengthM(line: readonly Position[]): number {
  let lengthM = 0;
  for (let i = 1; i < line.length; i++)
    lengthM += distanceM(latLng(line[i - 1]), latLng(line[i]));
  return lengthM;
}

const round5 = (value: number) => Math.round(value * 1e5) / 1e5;
const samePosition = (a: Position, b: Position) =>
  a[0] === b[0] && a[1] === b[1];

/** The line up to `alongM` from its start, and from there on; the split point rounded as the network's lines. */
function splitLine(
  line: readonly Position[],
  alongM: number,
): [Position[], Position[]] {
  let startM = 0;
  for (let i = 1; i < line.length; i++) {
    const segmentM = distanceM(latLng(line[i - 1]), latLng(line[i]));
    if (startM + segmentM >= alongM || i === line.length - 1) {
      const share = segmentM === 0 ? 0 : (alongM - startM) / segmentM;
      const [fromLng, fromLat] = line[i - 1];
      const [toLng, toLat] = line[i];
      const split: Position = [
        round5(fromLng + share * (toLng - fromLng)),
        round5(fromLat + share * (toLat - fromLat)),
      ];
      return [
        withoutRepeats([...line.slice(0, i), split]),
        withoutRepeats([split, ...line.slice(i)]),
      ];
    }
    startM += segmentM;
  }
  return [[...line], [...line]];
}

const withoutRepeats = (line: Position[]) =>
  line.filter((position, i) => i === 0 || !samePosition(position, line[i - 1]));
