# 29. Access warnings live on the legs

Date: 2026-10-28

## Status
Accepted. Amended 2026-10-31: a section row and its details dialog show the warnings of the section's legs too (see Decision).

## Context
The same access information was shown in three places: on each paddle leg (status, warnings, rule text, flow figures), on each day card ("Access: X" and every warning of its legs, "Leg n: …"), and, on desktop, in a trip access summary that repeated every warning as "Day n, leg m: …". The phone had already dropped its Trip tab summary (#123). Reading the same warning three times made the panels long without telling the planner anything new.

We prototyped four ways for a day card to point at its warnings (a count on the calendar tile, a chip per leg, a coloured edge with a link, an icon per kind) on the branch `prototype/day-card-access-badge`. The chip per leg won: it says which leg to look at and how bad it is, without the warning text.

## Decision
- **The leg is the one place with access text:** its status, warnings, lock and aire warnings, notes and rules. Leg rows are unchanged.
- **A section repeats its legs, it adds nothing of its own** (amended 2026-10-31). A section row shows the most restrictive status and one icon per kind of warning, like a leg row, and its details dialog shows each leg's details under that leg's number. The text still belongs to the leg; a section only gathers it.
- **A day card has no access text.** It shows one chip per leg with at least one real warning (forbidden, closed, check flow, a lock, or no official aire): "Leg 6 · Forbidden +2", its most serious kind first (forbidden, closed, check flow, lock, aire), in red for a ban and orange otherwise. A day without real warnings shows nothing; water without known rules is a note, not a warning (#78), so it gets no chip. The grouping is in the core (`dayWarnings`).
- **A chip shows its leg.** On the phone it opens the Legs tab with that leg's row open at the top, and zooms the map to it. On desktop it scrolls the Legs panel to the leg and highlights it for a moment.
- **No trip access summary**, on desktop as on the phone. The map's access layer and the day chips are the overview.

## Consequences
- The "warnings are information only" line went with the desktop summary. The "Indicative only" disclaimer (ADR 0024) stays.
- The core's per-day and per-trip access summaries (`DayAccess`, `TripAccess.trip`) are still computed; the UI uses only their warnings.
