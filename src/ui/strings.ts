import type { AccessState } from "@/core/access";
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
  // Your access points (#55, ADR 0023, GLOSSARY "Access point"): your own collection, apart from trips.
  accessPoints: {
    panelLabel: "Access points",
    toolbarLabel: "Access point actions",
    count: (n: number) => (n === 0 ? "No access points yet." : n === 1 ? "1 access point" : `${n} access points`),
    addButton: "Add access point",
    addHint: "Then click the map where you can get onto or off the water.",
    placingHint: "Click the map to place the access point. Press Escape to cancel.",
    exportButton: "Export points",
    exportHint: "Download your access points as a file: a backup, or to move or share them.",
    exportDisabledReason: "No access points to export yet.",
    importButton: "Import points",
    importHint: "Add the access points from a file to yours. Points you already have are not added twice.",
    imported: (added: number, alreadyThere: number) =>
      `Imported ${added === 1 ? "1 access point" : `${added} access points`}` +
      (alreadyThere === 0 ? "." : `; ${alreadyThere} ${alreadyThere === 1 ? "was" : "were"} already there.`),
    importInvalid: "This is not a packraft-go access points file, or it is damaged. Your access points are unchanged.",
    importUnknownVersion:
      "This access points file is from a newer or unknown version of packraft-go and can't be imported here. " +
      "Your access points are unchanged.",
    autosaveUnknownVersion:
      "Your saved access points are from a newer or unknown version of packraft-go. Reload the page to update. " +
      "They are kept; access point changes made here are not saved.",
    // A damaged autosave is copied to a backup key before it is replaced (round 2 of #55).
    damagedBackedUp: (key: string) =>
      `Your saved access points were damaged and couldn't be read, so you start with none. ` +
      `The damaged data was kept as a backup in this browser's storage, under "${key}".`,
    damagedNotBackedUp:
      "Your saved access points are damaged and couldn't be read or backed up. " +
      "They are kept; access point changes made here are not saved.",
    // While saving is paused, an import says it was not saved, never that it was.
    notSaved: {
      "unknown-version": "Not saved: your saved access points are from a newer or unknown version of packraft-go.",
      damaged: "Not saved: your saved access points are damaged and are kept as they are.",
    },
    importedNotSaved: (notSaved: string, added: number) =>
      `${notSaved} ${added === 1 ? "1 access point was" : `${added} access points were`} ` +
      "added on this page only and will be lost when you reload.",
    // The marker's accessible name, e.g. "Access point: Put-in, Official aire".
    marker: (use: string, kind: string) => `Access point: ${use}, ${kind}`,
    detailsLabel: "Access point",
    moveHint: "Drag the marker on the map to move it.",
    useLabel: "Use",
    uses: { "put-in": "Put-in", "take-out": "Take-out", both: "Both" },
    kindLabel: "Kind",
    kinds: { "official-aire": "Official aire", slipway: "Slipway", jetty: "Jetty", "informal-bank": "Informal bank" },
    noteLabel: "Note",
    notePlaceholder: "e.g. steep bank, park at the church",
    checkedOnSiteLabel: "Checked on site",
    checkedTodayButton: "Checked today",
    notCheckedButton: "Not checked",
    // When it was added and last changed; `date` is formatted, e.g. "Tue 13 Oct 2026".
    added: (date: string) => `Added ${date}`,
    changed: (date: string) => `changed ${date}`,
    deleteButton: "Delete access point",
    deleteConfirm: {
      title: "Delete this access point?",
      message: "It is removed from your access points. This can't be undone.",
      confirm: "Delete access point",
    },
    closeButton: "Done",
  },
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
    openFileButton: "Open trip file",
    openFileExplanation: "Choose a trip file saved on a computer. It's stored on this phone and works offline.",
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
    // Marking access points on the phone (#63, ADR 0023).
    accessPointsLabel: "Your access points",
    markButton: "Mark access point here",
    markExplanation:
      "Marks an access point at your GPS position. It's saved on this phone straight away, with or without signal.",
    markLocating: "Finding your position to mark the access point…",
    // `accuracy` is formatted, e.g. "12 m".
    markedAccuracy: (accuracy: string) => `Marked at your GPS position, accurate to about ${accuracy}.`,
    markedByTap: "Marked where you tapped on the map.",
    tapToPlaceButton: "Place by tapping the map",
    tapToPlaceHint: "Tap the map where you can get onto or off the water. Tap the button again to cancel.",
    tapToPlaceFallback: "Without your position, you can still place the access point by tapping the map.",
    savedOnDevice: "Saved on this device.",
    noAccessPoints: "No access points yet.",
    editButton: "Edit",
    deleteListButton: "Delete",
    // The list entry's heading, e.g. "Put-in, Official aire".
    listEntry: (use: string, kind: string) => `${use}, ${kind}`,
  },
  // The disclaimer shown above the map (ADR 0024).
  navigationRulesNotice: "Indicative only; you're responsible for checking local rules.",
  // The access layer (#53): where paddling is allowed (GLOSSARY: Access status).
  accessLayerToggle: "Access layer",
  accessLegendLabel: "Access status",
  accessState: {
    open: "Open",
    "closed-today": "Closed today",
    forbidden: "Forbidden",
    unknown: "Unknown",
  },
  // Transient status while today's live Walloon flow loads (#85); not one of the legend's states.
  accessChecking: "Checking flow…",
  accessLegendNote:
    "In Flanders, water that isn't marked is open by default. In Wallonia, only the listed stretches may be paddled; other water is treated as not allowed, but isn't painted red. " +
    "In Brussels, only the canal is known to be open; other water is unknown.",
  // The access layer's date (#59): the status of dated rules (Walloon seasons, fishing days) is for this day.
  accessDateLabel: "Date",
  accessTodayButton: "Today",
  accessTripDayLabel: "Trip day",
  accessTripDayChoose: "Choose a trip day",
  accessTripDayOption: (day: number, date: string) => `Day ${day}: ${date}`,
  accessStatusOn: (date: string) => `On ${date}`,
  accessCategory: (category: string) => `Walloon category ${category}`,
  // Locks (#57, GLOSSARY "Lock"): marked on the access layer in Flanders and Brussels.
  lockLegend: "Lock: portage required (shown when zoomed in)",
  lockDetailLabel: "Lock details",
  lockPortageRequired: "Portage required",
  lockPortageText: "Don't go through the lock on the water: get out before it and carry your packraft around it.",
  accessDetailLabel: "Access details",
  accessDetailClose: "Close",
  accessNoRule: "No access rules are known for this place.",
  accessConditionsHeading: "Extra rules",
  accessSourceLabel: "Source:",
  accessResearched: (date: string) => `Researched ${date}`,
  accessUnverified: (what: string) => `Not confirmed: ${what}`,
  accessDataCredit: "Access geometry © OpenStreetMap contributors (ODbL).",
  // Access status and warnings on paddle legs, day rows and the trip (#58).
  tripAccess: {
    legStatusOn: (date: string, state: string) => `Access on ${date}: ${state}`,
    legStatusInGeneral: (state: string) => `Access in general (no start date): ${state}`,
    dayStatus: (state: string) => `Access: ${state}`,
    checkFlowOnTheDay: "Rules OK; check the flow on the day.",
    warningKind: {
      forbidden: "Forbidden",
      closed: "Closed on this date",
      "check-flow": "Check the flow on the day",
    },
    // Unknown access is a gentle note, never a warning (#78).
    noRule: "No access rules known here.",
    legsWithoutRules: (n: number) => (n === 1 ? "1 leg without known rules" : `${n} legs without known rules`),
    warningPlace: (day: number, leg: number) => `Day ${day}, leg ${leg}`,
    legPlace: (leg: number) => `Leg ${leg}`,
    summaryLabel: "Access summary",
    summaryCount: (n: number) => (n === 1 ? "1 access warning" : `${n} access warnings`),
    summaryNone: "No access warnings.",
    neverBlocks: "Warnings are information only: you can still plan, save and export.",
  },
  // Live Walloon flows on a stretch for today (#61, ADR 0024).
  flow: {
    heading: "Live flow today",
    gauge: (name: string) => `Gauge: ${name}`,
    gaugeAssumed: (name: string) => `Gauge: ${name} (assumed gauge: its match to the official one isn't confirmed)`,
    at8: (flow: string) => `Flow at 08:00: ${flow}`,
    at8Missing: "Flow at 08:00: not measured yet",
    mean72h: (flow: string, when: string) => `72-hour mean: ${flow} (${when})`,
    mean72hMissing: "72-hour mean: no reading",
    minimum: (flow: string) => `Minimum (72-hour mean): ${flow}`,
    maximum: (flow: string) => `Maximum: ${flow}`,
    lastMeasured: (when: string) => `Last measured: ${when}`,
    noReadings: "No recent readings.",
    // e.g. "Wed 14 Oct 2026, 08:00"
    readingTime: (date: string, time: string) => `${date}, ${time}`,
    m3s: (value: string) => `${value} m³/s`,
    // The SPW's legal notice asks for this credit, in French, with a link.
    credit: "Sources des données : Service public de Wallonie",
  },
  // Snapping a new put-in or take-out to one of your access points (#62, ADR 0023).
  snap: {
    label: "Snap to an access point",
    offer: (kind: string, metres: number, use: string, accessKind: string) =>
      `The new ${kind} is ${metres} m from your access point (${use}, ${accessKind}). Snap it there?`,
    accept: "Snap to access point",
    decline: "Keep where it is",
    kinds: { "put-in": "put-in", "take-out": "take-out" },
  },
  // The Walloon aire warning (#62, AGW art. 5): information only, never blocks.
  aire: {
    warningKind: "No official aire",
    text: (kind: string, point: number) =>
      `Point ${point}, the ${kind}, is in Wallonia but not within 200 m of an access point of yours marked as an ` +
      "official aire. In Wallonia you may only get on or off the water at an aire (AGW art. 5).",
    kinds: { "put-in": "put-in", "take-out": "take-out" },
  },
  // Shown in the map's attribution control while the access layer is on. Contains HTML links.
  accessAttribution:
    'Access data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
    '(<a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>)',
  // Shown in the map's attribution control. Contains HTML links.
  mapAttribution:
    'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
    '<a href="http://viewfinderpanoramas.org">SRTM</a> | ' +
    'Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
    '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>) | ' +
    'Routing: <a href="https://brouter.de/">BRouter</a>',
} as const;

/** The label of any access status, including the transient "checking" (#85). */
export const accessStateLabel = (state: AccessState): string =>
  state === "checking" ? strings.accessChecking : strings.accessState[state];
