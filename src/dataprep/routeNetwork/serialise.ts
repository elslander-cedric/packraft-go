import type { RouteNetwork } from "@/core/routeNetwork";

const lines = (items: readonly unknown[]) =>
  `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;

const listed = ["nodes", "paddleLinks", "walkingLinks"] as const;

/** The route network as JSON with one node and one link per line, so a refresh reads well as a diff. */
export function serialiseRouteNetwork(network: RouteNetwork): string {
  const present = listed.filter((key) => network[key] !== undefined);
  const placeholders = Object.fromEntries(
    present.map((key) => [key, `@@${key}@@`]),
  );
  const head = JSON.stringify({ ...network, ...placeholders }, null, 2);
  return (
    present.reduce(
      (text, key) =>
        text.replace(`"@@${key}@@"`, () => lines(network[key] ?? [])),
      head,
    ) + "\n"
  );
}
