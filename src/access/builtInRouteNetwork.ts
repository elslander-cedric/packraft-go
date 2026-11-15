// The route network for suggested trips (ADR 0039), prepared offline by
// scripts/prepare-route-network.mts. Its own chunk: load it through `loadRouteNetwork`
// (src/ui/routeNetwork.ts), only when a search needs it, never with a static import.
import type { RouteNetwork } from "@/core/routeNetwork";
import network from "./data/route-network.json";

/** JSON loses tuple and literal types, hence the cast; the data test checks the shape. */
export const builtInRouteNetwork: RouteNetwork = network as unknown as RouteNetwork;
