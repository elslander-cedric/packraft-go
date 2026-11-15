import type { RouteNetwork } from "@/core/routeNetwork";

const lines = (items: readonly unknown[]) => `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;

/** The route network as JSON with one node and one link per line, so a refresh reads well as a diff. */
export function serialiseRouteNetwork(network: RouteNetwork): string {
  const head = JSON.stringify({ ...network, nodes: "@@nodes@@", paddleLinks: "@@paddleLinks@@" }, null, 2);
  return (
    head.replace('"@@nodes@@"', () => lines(network.nodes)).replace('"@@paddleLinks@@"', () => lines(network.paddleLinks)) +
    "\n"
  );
}
