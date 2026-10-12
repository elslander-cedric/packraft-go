# 21. GPX export: one file per section, delivered as a ZIP

Date: 2026-10-12

## Status
Accepted. Supersedes the "one track per leg" consequence of ADR 0006.

## Context
v1 exported a trip as a single GPX file with one `<trk>` per leg (ADR 0006, #11). Garmin Connect's course import reads only the **first** track of a file and silently drops the rest, so a multi-leg trip imported as a course showed only leg 1. Garmin users have reported this for years, and other course importers behave the same way. Course importers expect one track with one segment.

A packrafting trip naturally falls into parts you'd follow as separate courses on a watch: a hike, a paddle, then the next day's hike.

## Decision
- **Section:** a run of consecutive legs of the same mode (hike or paddle). A section ends where the mode changes **or** at a camp.
- **One GPX file per section.** Each file holds exactly one `<trk>` with one `<trkseg>`, plus the section's points in order. A trip with a single section produces a single file.
- **Portages are not special.** A short hike leg between two paddle legs is its own hike section (paddle → portage → paddle = 3 files). This keeps the rule simple and predictable (consistent with ADR 0016).
- **One "Export GPX" button.** It downloads **one ZIP file** containing all section files, because browsers block or prompt on pages that download several files at once.
- **Naming**, for the track/course name inside each file and for the file name: `<trip name> – <n> – <mode>`, plus the day when the trip has camps: `<trip name> – <n> – Day <d> – <mode>`. `n` is the section's position in the trip, so courses sort in order. Unnamed trips use "Untitled trip". The name inside the file keeps the trip name as typed. Only the **file name** replaces characters that file systems reject (`/ \ : * ? " < > |`, control characters) with `-`. So "Lesse / Ourthe" shows as "Lesse / Ourthe – 1 – hike" on the watch, in a file named `Lesse - Ourthe – 1 – hike.gpx` (amended 2026-10-12).
- Earlier GPX rules still apply: GPX 1.1, routed geometry with elevations, unrouted legs as straight lines, characters invalid in XML removed, coordinates within GPX bounds.

## Consequences
- The per-leg track names from v1 are gone. Section boundaries (put-ins, take-outs, camps) are the start and end of each file, so no extra waypoints are needed. Camps are no longer exported as waypoints.
- A small ZIP dependency is needed (client-side, free, MIT-style licence), or a minimal store-only ZIP writer.
- You import several courses instead of one. Exporting the whole trip as one file is a possible later option (TODO.md).
