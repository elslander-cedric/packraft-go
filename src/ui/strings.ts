// All user-facing text lives here (ADR 0013), so other languages can be added later.

export const strings = {
  appTitle: "packraft-go",
  appDescription: "Plan packrafting trips: hike legs and paddle legs on one map.",
  mapLabel: "Trip map",
  mapLoading: "Loading map…",
  plannerLoading: "Loading trip…",
  legsPanelLabel: "Legs",
  legsPanelEmpty: "Click the map to place the start point, then click again to add legs.",
  editHint:
    "Drag a point to move it. Click a point to select it, then delete it or mark it as a camp. Switch a leg between hike and paddle in the list.",
  tripToolbarLabel: "Trip",
  tripNameLabel: "Trip name",
  tripNamePlaceholder: "Untitled trip",
  // The trip's optional start date (#52, GLOSSARY "Start date"); days get dates from it.
  startDateLabel: "Start date",
  clearStartDateButton: "Clear date",
  newTripButton: "New trip",
  newTripHint: "Start an empty trip. The current trip is replaced.",
  // Asked in an in-page dialog before a trip with points is replaced (#31).
  newTripConfirm: {
    title: "Start a new trip?",
    message: "Your current trip will be lost.",
    confirm: "Discard current trip",
  },
  confirmCancel: "Cancel",
  saveFileButton: "Save to file",
  saveFileHint: "Download the trip as a file, as a backup or to open on another computer.",
  openFileButton: "Open file",
  openFileHint: "Open a trip file saved earlier. The current trip is replaced.",
  openFileConfirm: {
    title: "Open this trip file?",
    message: "Your current trip will be replaced.",
    confirm: "Replace current trip",
  },
  openFileInvalid: "This is not a packraft-go trip file, or it is damaged. Your current trip is unchanged.",
  openFileUnknownVersion:
    "This trip file is from a newer or unknown version of packraft-go and can't be opened here. Your current trip is unchanged.",
  // Shown while the autosaved trip is from a newer or unknown version and is kept, not overwritten (#28).
  autosaveUnknownVersion:
    "Your saved trip is from a newer or unknown version of packraft-go. Reload the page to update. " +
    "It is kept until you start a new trip or open a file; changes made here are not saved.",
  exportGpxButton: "Export GPX",
  exportGpxHint:
    "Download the trip as a ZIP of GPX files for a GPS device or outdoor app: one file per hike or paddle section, split at camps.",
  exportGpxDisabledReason: "Nothing to export yet: click the map twice to add a leg.",
  // A section's name in the GPX export (ADR 0021), used for its file, metadata and track,
  // e.g. "Ourthe – 2 – paddle", or "Ourthe – 2 – Day 1 – paddle" when the trip has camps.
  gpxSectionName: (trip: string, n: number, mode: "hike" | "paddle", day?: number) =>
    [trip, String(n), ...(day === undefined ? [] : [`Day ${day}`]), mode === "hike" ? "hike" : "paddle"].join(" – "),
  toolbarLabel: "Edit route",
  undoButton: "Undo",
  undoShortcut: "Undo the last edit (Ctrl+Z / Cmd+Z)",
  undoDisabledReason: "Nothing to undo yet.",
  deletePointButton: "Delete point",
  deletePointShortcut: "Delete the selected point (Delete key)",
  deletePointDisabledReason: "Select a point on the map to delete it.",
  campButton: "Camp",
  campButtonHint: "Mark or unmark the selected point as a camp. Camps split the trip into days.",
  campDisabledReason: "Select a point on the map to mark it as a camp.",
  campMarker: "Camp",
  daysPanelLabel: "Days",
  dayLabel: (n: number) => `Day ${n}`,
  // A day's calendar date from the trip's start date (#52), e.g. "Sat 31 Oct 2026".
  dayDate: (weekday: string, day: number, month: string, year: number) => `${weekday} ${day} ${month} ${year}`,
  weekdayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  // Which legs a day covers, e.g. "Legs 1–2" or "Leg 3".
  dayLegs: (first: number, last: number) => (first === last ? `Leg ${first}` : `Legs ${first}–${last}`),
  dayHikeDistance: "Hike",
  dayPaddleDistance: "Paddle",
  dayTimeEstimate: "Est. time",
  legLabel: (n: number) => `Leg ${n}`,
  legModeHike: "Hike",
  legModePaddle: "Paddle",
  legModeLabel: (n: number) => `Leg ${n} mode`,
  putIn: "Put-in",
  takeOut: "Take-out",
  tripTotalDistance: "Total distance",
  kilometreUnit: "km",
  metreUnit: "m",
  hourUnit: "h",
  minuteUnit: "min",
  // Times are estimates (ADR 0009) and say so wherever they are shown.
  legTimeEstimate: "Est. time",
  tripTotalTimeEstimate: "Estimated total time",
  // Shown instead of a time while a hike leg (or, for the total, any leg) is still being snapped.
  timePending: "…",
  // A hike leg that failed to route is timed on distance only; `duration` is formatted, e.g. "45 min".
  timeWithoutClimb: (duration: string) => `${duration} (no climb data)`,
  timeEstimateNote: "Times are estimates: Naismith's rule for hike legs, your paddling speed for paddle legs.",
  settingsPanelLabel: "Settings",
  paceFactorLabel: "Hiking pace factor",
  paceFactorHint: "1.0 is Naismith's pace; 1.2 is 20% slower, 0.8 is 20% faster.",
  paddleSpeedLabel: "Paddling speed (km/h)",
  climbLabel: "Climb",
  descentLabel: "Descent",
  dropLabel: "Drop",
  // A paddle leg that ends higher than it starts (ADR 0018); `elevation` is formatted, e.g. "3 m".
  riseFigure: (elevation: string) => `↑ ${elevation} (upstream?)`,
  legRouting: "Snapping to the map…",
  legRouteFailed: {
    "no-route": "No path found between these points. Shown as a straight line; move a point or retry.",
    unavailable: "The routing service is unavailable. Shown as a straight line; retry later.",
  },
  legRouteFailedNoRiver:
    "No river route found between these points. Shown as a straight line; move a point onto the river or retry.",
  retryRouting: "Retry",
  // Phone layout (#56, ADR 0023): the map, your position on request, and your trip read-only.
  // Planning stays on a computer.
  phone: {
    tripLabel: "Your trip",
    tripEmpty: "No trip on this phone yet. Plan your trip on a computer; it shows here once it's saved in this browser.",
    readOnlyNote: "Read-only on a phone. Plan and edit trips on a computer.",
    showPositionButton: "Show my position",
    positionExplanation:
      "Your browser will ask to share your location. It's only used to show where you are on this map and never leaves your phone.",
    positionLocating: "Finding your position…",
    // `accuracy` is formatted, e.g. "12 m".
    positionAccuracy: (accuracy: string) => `Your position, accurate to about ${accuracy}.`,
    positionMarker: "Your position",
    positionDenied:
      "Location permission was denied, so your position can't be shown. To show it, allow location for this site in your browser settings, then try again.",
    positionUnavailable: "Your position isn't available right now. Try again in the open, away from steep valley sides.",
    positionTimeout: "Finding your position took too long. Try again.",
    positionUnsupported: "This browser can't share your location.",
  },
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
