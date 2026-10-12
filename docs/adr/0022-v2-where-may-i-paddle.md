# 22. v2 theme: "Where may I paddle?"

Date: 2026-10-12

## Status
Accepted

## Context
v1 plans hike and paddle legs, but it can't tell whether a paddle leg is on water you may legally use (ADR 0010). Research (`docs/research/`) shows the rules are knowable: Flemish exceptions and ports, the Walloon AGW whitelist with seasons, hours and flow thresholds. Live Walloon flows are also available. Other v2 candidates were a field companion (phone and GPS) and smarter planning (route-finding, GPX import).

## Decision
- v2's theme is **access**: show where paddling is allowed, and when, on the map, and relate it to the trip's paddle legs.
- The audience stays **personal** (Cedric and friends, no publicity; ADR 0002 unchanged).
- v2 ships as **one release**, with one spec and its tickets, not as a series of point releases.
- **Coverage: all of Belgium**: Flanders, Wallonia and the Brussels-Capital Region.
- **The map shows access in four states:** open, closed today (season, hours or flow), forbidden (explicit exceptions only), and unknown. In Wallonia, only listed stretches are coloured. Unlisted water is treated as not allowed but isn't painted red, to keep the map readable.
- **Paddle legs on water that isn't allowed get a warning with the reason. They are never blocked.**
- **Trips get an optional start date.** Day *n* falls on start date + *n*−1. Seasons, hours and fishing days are checked against those dates. Flow is only known for today: future dates show "check flow on the day". Without a date, rules are shown in general terms.
- **Live flows and a computed open/closed status are shown for Walloon stretches.** The SPW said it has no objection and set no conditions (told to Cedric, 2026-10-12). The data is still credited to the SPW, as its legal notice asks.
- **v2 includes phone support for marking access points on the go.** This is an exception to ADR 0001 for one flow; the details are in a later ADR.

## Consequences
- Smarter-planning items (route-finding, GPX import, redo) stay in TODO.md. Of the field-companion items, only access-point marking moves into v2.
- A single larger spec: the ticket breakdown must still be vertical slices, each demoable.
- ADR 0010 (no legal checks) is superseded once v2 ships; the "check local rules" notice stays as a disclaimer.
