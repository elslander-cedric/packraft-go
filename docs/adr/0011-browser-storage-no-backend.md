# 11. Trips are stored in the browser; no backend

Date: 2026-10-10

## Status
Accepted

## Context
A server and database cost money and maintenance. v1 is for personal use (ADR 0002).

## Decision
Trips are saved in browser storage, with save-to-file / open-file for backup and moving between computers. There is no backend in v1.

## Consequences
- The app is a static site that can be hosted for free.
- Trips don't sync between devices automatically.

## Amendment (2026-10-12, #8): save format version 2
Autosave and trip files share one versioned JSON format. Camps (ADR 0008) bumped it from version 1 to **version 2**:
- The app always saves version 2. It adds an optional `camps` list of point indices, written only when the trip has camps.
- The app opens version 1 (from before camps, read as a trip without camps) and version 2.
- **Any other version is refused.** A trip file from a newer or unknown version gets its own message ("from a newer or unknown version of packraft-go"), separate from the "damaged or not a trip file" message, and the current trip is left untouched. In browser storage, an unreadable save of any kind still falls back to an empty trip.
- Why bump rather than add the field silently: an older build that ignored `camps` would open a newer file and quietly lose the camps. A version number lets each build refuse what it can't fully read.
- Each future change to the format bumps the version and keeps reading the older ones.
