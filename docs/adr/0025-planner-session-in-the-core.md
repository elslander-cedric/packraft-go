# 25. The planner session is a pure core module and the only writer of the trip

Date: 2026-10-18

## Status
Accepted

## Context
`TripPlanner.tsx` held the planner session (GLOSSARY) as separate pieces of React state: the trip, the selected point, snap offers, the file error, whether the stored save is kept, and the replace question. About eight handlers each updated a hand-picked subset of them, so the rules (which action keeps the selection, which drops the offers) differed by accident and no unit test could reach them. The auto router also wrote into the trip directly through `setTrip`. Changing a leg's mode computed its snap offers from a different trip than the one it changed.

## Decision
- The planner session lives in `src/core/plannerSession/` (one exported reducer from `index.ts`; its rules split into `trip.ts` and `accessPoints.ts`) as a pure function, `(session, action) → session`, run in the planner with React's `useReducer`. It obeys the core's purity rules: everything it needs from outside (a file that was read, a route answer, a default name, a new id and the time) comes in with the action.
- **It is the only writer of the trip.** Route answers arrive as a plain-data action (`routeArrived` with the request and the route), applied by a pure function from `src/core/routing.ts`. The auto router no longer takes a `setTrip`.
- **Amended (#242): it is also the only writer of your access points.** `firstSession` takes the loaded ones; the session also holds the new point being placed (the draft) and the selected access point. Their storage and format stay as ADR 0023 decided: `useAccessPointStorage` stores them on every change (paused for an unknown or damaged save), keeps the backup key and looks up default names (ADR 0027), which come back as `defaultNameFound`.
- **Amended (#243): it also holds the panel view and the row highlight.** The panel view is the tab, the bottom sheet's stop and, while editing access points, whether the side panel is open (`panel`); it replaces the view the mode used to keep to return to. The row highlight is the leg, section or day row marked in the panel (`highlightedRow`), an index. The side panel's width and its open state in normal mode stay stored settings (ADR 0036). Which sections are open (#200) stays in the planner, reconciled with the sections after each edit.
- **One rule per piece of state:**
  - The selected point is cleared when points are added, moved or deleted, a leg changes mode, on undo, when an offer is accepted and when the trip is replaced. Toggling a camp keeps it (the camp is on that point and no point moves), and keeps the snap offers too.
  - Snap offers are dropped when points or leg modes change, then worked out again for the new put-ins and take-outs of a mode change or added point, and for a moved put-in or take-out, against the session's access points. When an access point action changes them, offers for a deleted one are dropped and offers for a changed one follow it. `shownOffers` is empty while editing access points, and `mapEditing` gives the map what it may change in each mode (the trip frozen, your access points editable, the draft).
  - A map tap (`mapTapped`, #242) places or moves the draft while editing access points; else, with a point or a leg selected, it only clears the selection; else it adds a point in the next leg's mode.
  - The draft is placed by a map tap or the mark button, moved by a tap or a drag, stored by draft saved and dropped by draft discarded or leaving access point editing. The selected access point is set by a click and by saving the draft, and cleared by entering and leaving access point editing, placing or moving the draft and deleting that point.
  - The access point actions apply only while editing access points, the way the trip is frozen then (#227). A default name found applies in any mode, to a stored point or to the draft.
  - The file error is cleared by anything the planner does, but not by a route arriving or the official aires loading.
  - The next leg's mode pick (`nextModePick`; #121, moved into the session in #241) is set when the planner picks it, cleared by every edit of the points, leg modes or camps (toggling a camp is an edit with its own undo step, as the planner had it before) and by replacing the trip, and kept by routing. The first point, which adds no leg, carries it over to the second. Add point and back to start take it from the session, not from the action.
  - The official aires reach the session once, when they load (`officialAiresLoaded`, #241); the edits' snap offers read them from there. An edit made before they load gets no offer to an aire.
  - The trip generation counts replacements of the trip (#241): the map fits the trip when it changes, instead of guessing from point counts.
  - The panel view (#243): a tab chosen sets normal mode's tab, which entering access point editing keeps while it shows the Access points tab, and a tab chosen while editing is ignored. The sheet's stop is set when the sheet moves, in either mode. Entering keeps the stop it was at and opens the panel for this visit (`panelToggled` opens or closes it while editing; in normal mode the open state is a stored setting); leaving restores normal mode's tab and the stop from before entering. Nothing else changes it.
  - The row highlight (#243) is set by a row tap; a tap on the highlighted day clears it, on the highlighted leg or section keeps it. It is cleared by every edit of the points, leg modes or camps and by replacing the trip, so after a delete it never marks a different row (toggling a camp clears it as a camp can shift the days' indexes, though it keeps the selected point); routing, the map selection and the panel view keep it. A row tap selects nothing on the map, and while editing access points it is ignored with the trip's actions.
  - While a replace question is open, the session ignores every action except confirm, cancel, a route arriving, the official aires loading and a default name found.
- **Side effects stay in the component:** autosave of the trip and of your access points, default name lookups, new ids and times, starting route requests, reading and downloading files, raising the sheet or the panel and zooming the map to a row (run after the action is dispatched), the panel's width and sideways layout, and the key bindings (which map keys to actions; the "typing in a field" check is about the DOM and stays there).

## Considered options
- **A hook in `src/ui/` wrapping the same `useState` calls:** the rules would still be unreachable by Vitest, which runs no DOM and no `.tsx`.
- **A store library (Zustand, Redux):** it decides where state lives and who can subscribe, but the rules would still have to be written as a reducer. Nothing outside the planner needs this state today. A store can be added later around the same reducer without changing its tests.

## Consequences
- The rules are tested as tables in `plannerSession.test.ts`; the e2e specs stay as the safety net.
- A new planner feature adds an action and its test rows, not a new handler in the component.
- Route answers that arrive for an older trip are matched against the current one inside the session (as `store` did), so this rule has one owner.
