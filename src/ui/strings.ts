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
  // An undated day's calendar tile on the phone: "Day" above its number.
  dayTileWord: "Day",
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
    // The marker's accessible name and tooltip, led by its heading (#136), e.g.
    // "Access point: Hotton bridge (Put-in, Slipway)" or "Access point: Put-in, Official aire".
    marker: (heading: string, detail: string | null) =>
      detail === null ? `Access point: ${heading}` : `Access point: ${heading} (${detail})`,
    // Its use and kind, e.g. "Put-in, Official aire": a list entry's detail line, or its heading
    // when it has no name or note (#136).
    useAndKind: (use: string, kind: string) => `${use}, ${kind}`,
    detailsLabel: "Access point",
    moveHint: "Drag the marker on the map to move it.",
    useLabel: "Use",
    uses: { "put-in": "Put-in", "take-out": "Take-out", both: "Both" },
    kindLabel: "Kind",
    kinds: { "official-aire": "Official aire", slipway: "Slipway", jetty: "Jetty", "informal-bank": "Informal bank" },
    nameLabel: "Name",
    // Shown while the default name (ADR 0027) is still to be looked up, or when none was found.
    namePlaceholder: "e.g. Hotton bridge",
    nameHint: "Leave empty for a name from the nearest road and place.",
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
  // The phone layout of the planner (ADR 0026), with your position and access points on it (ADR 0023).
  phone: {
    // The phone planner's sheet and tabs (#118, ADR 0026).
    sheetLabel: "Trip",
    tabsLabel: "Trip sections",
    tabs: { legs: "Legs", days: "Days", accessPoints: "Access points" },
    // The trip's totals in the sheet's peek: each figure after its icon, named for screen readers.
    totals: {
      labels: {
        hike: "Hike distance",
        paddle: "Paddle distance",
        climb: "Climb",
        descent: "Descent",
        time: "Estimated total time",
      },
    },
    // A leg row's figures, each after its icon, named for screen readers.
    legFigures: {
      hike: "Hike distance",
      paddle: "Paddle distance",
      time: "Estimated time",
      climb: "Climb",
      descent: "Descent",
      drop: "Drop",
      // A paddle leg that ends higher than it starts (ADR 0018).
      rise: "Rise, upstream?",
    },
    // A day card's figures, each after its icon, named for screen readers.
    dayFigures: {
      hike: "Hike distance",
      paddle: "Paddle distance",
      climb: "Climb",
      descent: "Descent",
      time: "Estimated time",
    },
    // The side panel that replaces the sheet when the phone is held sideways (#126).
    collapsePanelButton: "Collapse the trip panel",
    expandPanelButton: "Open the trip panel",
    // The floating hike / paddle toggle for the leg the next map tap adds (#121).
    nextLegModeLabel: "Next leg's mode",
    // Its toggles are icon-only; their names are `legModeHike` and `legModePaddle`.
    // The position and undo buttons are icon-only too; their names are `showPositionButton` and `undoButton`.
    showPositionButton: "Show my position",
    positionLocating: "Finding your position…",
    positionMarker: "Your position",
    positionDenied:
      "Location permission was denied, so your position can't be shown. To show it, allow location for this site in your browser settings, then try again.",
    positionUnavailable: "Your position isn't available right now. Try again in the open, away from steep valley sides.",
    positionTimeout: "Finding your position took too long. Try again.",
    positionUnsupported: "This browser can't share your location.",
    // Your access points in the phone planner (#119; first #63, ADR 0023).
    accessPointsLabel: "Your access points",
    // The floating button bottom left, icon-only.
    markAccessPointButton: "Mark an access point",
    // The same button while a route point is selected (#120): it saves that point as an access point.
    selectedPointToAccessPointButton: "Make the selected point an access point",
    // The delete and camp buttons shown while a point is selected (#120) are icon-only;
    // their names are `deletePointButton` and `campButton`.
    markLocating: "Finding your position to mark the access point…",
    // The state line while the next map tap places an access point.
    placingState: "Placing an access point",
    placingCancel: "Cancel",
    savedOnDevice: "Saved on this device.",
    noAccessPoints: "No access points yet. Mark one with the button at the bottom of the map.",
    // A row's icon-only buttons; `heading` is how the row reads (its name, else its note or use and kind).
    editAccessPoint: (heading: string) => `Edit ${heading}`,
    deleteAccessPoint: (heading: string) => `Delete ${heading}`,
    // The edit dialog: what you change is kept until Save stores it on the device.
    accessPointDialogTitle: "Access point details",
    accessPointSave: "Save",
    // The access layer on the phone (#125): the layers button under the position button is named `accessLayerToggle`.
    // The chip at the top of the map while the layer is on, e.g. "Access · today"; it opens a popover.
    accessChip: (when: string) => `Access · ${when}`,
    accessChipToday: "today",
    accessPopoverLabel: "Access layer",
    // The floating menu top left (#124): the rare actions on the whole trip.
    menu: {
      button: "Menu",
      newTrip: "New trip",
      // Trip details… opens the trip's name and start date in a dialog (#154); Save applies what was typed.
      tripDetails: "Trip details…",
      tripDetailsTitle: "Trip details",
      tripDetailsConfirm: "Save",
      saveFile: "Save…",
      openFile: "Open…",
      exportGpx: "Export GPX…",
      // Settings… opens the settings in a dialog (#151); Save stores what was typed.
      settings: "Settings…",
      settingsConfirm: "Save",
      // Save… and Export GPX… ask for the trip name first, prefilled with the current one.
      saveTitle: "Save trip",
      saveConfirm: "Save",
      exportTitle: "Export GPX",
      exportConfirm: "Export",
    },
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
  // Access status and warnings on paddle legs, and the warning chips on day cards (#58).
  tripAccess: {
    legStatusOn: (date: string, state: string) => `Access on ${date}: ${state}`,
    legStatusInGeneral: (state: string) => `Access in general (no start date): ${state}`,
    statusLine: (state: string) => `Access: ${state}`,
    checkFlowOnTheDay: "Rules OK; check the flow on the day.",
    warningKind: {
      forbidden: "Forbidden",
      closed: "Closed on this date",
      "check-flow": "Check the flow on the day",
    },
    // Unknown access is a gentle note, never a warning (#78).
    noRule: "No access rules known here.",
    // Lock warning (#60): the lock's name is the lock's own, from the data.
    lockWarning: (name: string) => `Lock at ${name}: portage required.`,
    // A day card's chips: one per leg with warnings, its most serious kind; the text is on the leg.
    dayWarningsLabel: "Access warnings",
    chipKind: {
      forbidden: "Forbidden",
      closed: "Closed",
      "check-flow": "Check flow",
      lock: "Lock",
      aire: "No aire",
    },
    chip: (leg: number, kind: string) => `Leg ${leg} · ${kind}`,
    chipMore: (n: number) => `+${n}`,
    chipName: (leg: number, kind: string, count: number) =>
      count === 1 ? `Leg ${leg}: ${kind}. Show the leg` : `Leg ${leg}: ${kind} and ${count - 1} more. Show the leg`,
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
    // `name` is the access point's name (#136), or null when it has none.
    offer: (kind: string, metres: number, name: string | null, use: string, accessKind: string) =>
      name === null
        ? `The new ${kind} is ${metres} m from your access point (${use}, ${accessKind}). Snap it there?`
        : `The new ${kind} is ${metres} m from your access point ${name} (${use}, ${accessKind}). Snap it there?`,
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
