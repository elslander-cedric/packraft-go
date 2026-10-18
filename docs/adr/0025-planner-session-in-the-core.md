# 25. The planner session is a pure core module and the only writer of the trip

Date: 2026-10-18

## Status
Accepted

## Context
`TripPlanner.tsx` held the planner session (GLOSSARY) as separate pieces of React state: the trip, the selected point, snap offers, the file error, whether the stored save is kept, and the replace question. About eight handlers each updated a hand-picked subset of them, so the rules (which action keeps the selection, which drops the offers) differed by accident and no unit test could reach them. The auto router also wrote into the trip directly through `setTrip`. Changing a leg's mode computed its snap offers from a different trip than the one it changed.

## Decision
- The planner session lives in `src/core/plannerSession.ts` as a pure function, `(session, action) → session`, run in the planner with React's `useReducer`. It obeys the core's purity rules: everything it needs from outside (access points, a file that was read, a route answer) comes in with the action.
- **It is the only writer of the trip.** Route answers arrive as a plain-data action (`routeArrived` with the request and the route), applied by a pure function from `src/core/routing.ts`. The auto router no longer takes a `setTrip`.
- **One rule per piece of state:**
  - The selected point is cleared when points are added, moved or deleted, a leg changes mode, on undo, when an offer is accepted and when the trip is replaced.
  - Snap offers are dropped when points or leg modes change. When access points change, offers for a deleted one are dropped and offers for a moved one follow it.
  - The file error is cleared by anything the planner does, but not by a route arriving.
  - While a replace question is open, the session ignores every action except confirm, cancel and a route arriving.
- **Side effects stay in the component:** autosave, starting route requests, reading and downloading files, and the key bindings (which map keys to actions; the "typing in a field" check is about the DOM and stays there).

## Considered options
- **A hook in `src/ui/` wrapping the same `useState` calls:** the rules would still be unreachable by Vitest, which runs no DOM and no `.tsx`.
- **A store library (Zustand, Redux):** it decides where state lives and who can subscribe, but the rules would still have to be written as a reducer. Nothing outside the planner needs this state today. A store can be added later around the same reducer without changing its tests.

## Consequences
- The rules are tested as tables in `plannerSession.test.ts`; the e2e specs stay as the safety net.
- A new planner feature adds an action and its test rows, not a new handler in the component.
- Route answers that arrive for an older trip are matched against the current one inside the session (as `store` did), so this rule has one owner.
