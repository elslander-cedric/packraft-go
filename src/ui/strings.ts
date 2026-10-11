// All user-facing text lives here (ADR 0013), so other languages can be added later.

export const strings = {
  appTitle: "packraft-go",
  appDescription: "Plan packrafting trips: hike legs and paddle legs on one map.",
  mapLabel: "Trip map",
  mapLoading: "Loading map…",
  plannerLoading: "Loading trip…",
  legsPanelLabel: "Legs",
  legsPanelEmpty: "Click the map to place the start point, then click again to add legs.",
  editHint: "Drag a point to move it. Click a point to select it, then delete it.",
  tripToolbarLabel: "Trip",
  tripNameLabel: "Trip name",
  tripNamePlaceholder: "Untitled trip",
  newTripButton: "New trip",
  newTripHint: "Start an empty trip. The current trip is replaced.",
  newTripConfirm: "Start a new trip? Your current trip will be lost.",
  toolbarLabel: "Edit route",
  undoButton: "Undo",
  undoShortcut: "Undo the last edit (Ctrl+Z / Cmd+Z)",
  deletePointButton: "Delete point",
  deletePointShortcut: "Delete the selected point (Delete key)",
  legLabel: (n: number) => `Leg ${n}`,
  legModeHike: "Hike",
  legModePaddle: "Paddle",
  tripTotalDistance: "Total distance",
  kilometreUnit: "km",
  metreUnit: "m",
  climbLabel: "Climb",
  descentLabel: "Descent",
  legRouting: "Snapping to the map…",
  legRouteFailed: {
    "no-route": "No path found between these points. Shown as a straight line; move a point or retry.",
    unavailable: "The routing service is unavailable. Shown as a straight line; retry later.",
  },
  retryRouting: "Retry",
  navigationRulesNotice:
    "Check local navigation rules before paddling. packraft-go does not check whether a river may be paddled.",
  // Shown in the map's attribution control. Contains HTML links.
  mapAttribution:
    'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
    '<a href="http://viewfinderpanoramas.org">SRTM</a> | ' +
    'Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
    '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>) | ' +
    'Routing: <a href="https://brouter.de/">BRouter</a>',
} as const;
