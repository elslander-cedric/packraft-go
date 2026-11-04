# Planner

The one planner (ADRs 0026, 0034), on every screen, with `src/map/TripMap.tsx`. `ClientTripPlanner` loads `Planner`. It runs `usePlanner` and adds no planning rules. Its text is in `strings.planner`, its styles in `planner.css` (classes `planner-*`).

## Layout

- A full-screen map with floating buttons and, in portrait at width ≤ 640 px, a bottom sheet; everywhere else the resizable side panel on the right (`SHEET_QUERY` in `usePlannerLayout.ts`).
- The panel has the Sections and Days tabs (the Access points tab in access point editing).
- A layers button opens the Map menu: base maps, access layer and overlay switches (#179, #180).
- The menu: New trip, Edit trip, Save trip, Open trip | Export GPX | Settings, with icons. The trip's name and start date (Edit trip, #154) and the settings (#151) are dialogs from it.
- `DaysPanel`, `SnapOffers`, `TripAccessView` and `AccessPanel` (the access legend, date and details) stay in `src/ui/`.

## Selection

- A tap on a leg on the map selects it (`selectedLeg` in the planner session, `legClicked`; #230). `TripMap`'s tap handling tells a leg's hit line (`data-leg`) from the map. The leg gets a yellow casing, and `LegModeCard` floats in the snap offers' slot with its Hike/Paddle toggle (`setLegMode`, one undo step, keeps it selected). A map tap, Escape or the card's button unselects it.
- A selected route point's delete (trash can) and camp buttons are in `PointCard`, in the same slot; its button at the right unselects it, like the leg card's. So the bottom-right stack (next leg's mode, undo, back to start) is short enough to clear the top row with the sheet at half. At full the stack and that slot are hidden.

## Sections and legs

- Leg and section rows are one `TripRow`.
- `SectionsList` and `SectionDetailsDialog` show a section's totals (`TripSummary.sections`) and its legs' warnings (`legsAccess`, ADR 0029).
- A tap on the selected section of several legs opens it to show its legs (#200), and `Planner` keeps which are open by first leg. Its legs sit in line with it on a grey band.
- A section or leg with details has an Access details button on its row, at the right of the last line, or under the routing state while there is one. It only opens the dialog.

## Access point editing

Your access points (`AccessPoints.tsx`, `AccessPointDialog.tsx`; #63, ADR 0023) are changed only in *access point editing* (ADR 0036, #225), the planner's second mode.

- The mode is `mode` in the planner session (`{ kind: "normal" }` or `{ kind: "accessPointEditing", returnTo }`, set by the `enterAccessPointEditing` and `leaveAccessPointEditing` actions), never in settings, so the planner always opens in normal mode.
- A floating button bottom left enters it and, pressed again, leaves it (`aria-pressed`, coloured `planner-fab-active` with the exit icon `leaveAccessPointEditing` while in it, above it the flag that marks; no banner).
- Normal mode shows only the Sections and Days tabs and no mark button; access point editing only the Access points tab and the mark button.
- Entering opens the panel on that tab, also from closed, and switches the sheet to it at its stop. Leaving restores the tab, the sheet's stop and whether the panel was open (`returnTo`). Both clear the selection.

### Markers

- Your access point markers are grey in normal mode and green while editing (`accessPointModeColours` in `src/map/accessColours.ts`).
- In normal mode they are inert (#226: `editable` on `AccessPointLayer`, not interactive, not focusable) and drawn under the trip, in their own pane (`paneZIndex.accessPoints`) below the legs. While editing they are in Leaflet's marker pane above it.
- So in normal mode a press passes through to the route point, leg or map under it, while snap offers still move trip points onto them and official aires stay tappable.

### Frozen trip

While editing the trip is frozen (#227):

- The planner session ignores the actions that change its points or leg modes, select a point or answer a snap offer (`frozenWhileEditing`).
- `TripMap` gets `frozen`, so route points and legs have no hit areas and a press reaches your access points.
- Back to start, delete, camp, undo and their keys are off, the next leg's Hike/Paddle toggle is hidden, the snap offers wait until you leave, and a map tap only places a new access point.
- There is no action that makes the selected route point an access point.

### Marking a point

- Tapping the map places a new point: the `draft` in `useAccessPoints`, not stored. Another tap on the map moves it, and it drags; a tap on it does nothing.
- The flag button opens its details dialog, whose Save stores it (`saveDraft`). Cancel keeps it unsaved; leaving drops it. No state line is shown for it.
- With no draft the flag places it at your GPS position first (`useMarkAccessPoint`).
- The dialog keeps a draft; Save stores it on the device at once by `useAccessPoints`, with or without signal.

### The Access points tab

- While the trip has a route the tab lists the points on the route first in route order, then the rest nearest to you (#156; the split is `accessPointsByRoute` in `src/core/onRoute.ts`).
- Each row has edit and delete buttons, and the marker drags to correct it.
- Official aires on the route (`officialAiresOnRoute`, #208) are merged into the route-ordered part as read-only rows that open `AccessDetailsDialog`, with the access layer on or off; off-route ones aren't listed.

## Tests

- In e2e on a desktop-sized window use the helpers in `e2e/support/planner.ts`: the trip panel, its tabs, the menu, Open/Save trip, clicks on the free part of the map.
- `showAllLegs(page)` opens every section as it appears, for specs about legs.
- Specs that use access points enter access point editing first with `enterAccessPointEditing(page)` from `e2e/support/accessPointEditing.ts` (`markAccessPointAt` does it for you).
