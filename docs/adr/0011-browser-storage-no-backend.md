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
- **Version 2 is the only supported version** (updated 2026-10-12, #33). Version 1 was never used for real trips, so the app no longer reads it; there is no v1 code path.
- **Any other version, including version 1, is refused.** A trip file from a newer or unknown version gets its own message ("from a newer or unknown version of packraft-go"), separate from the "damaged or not a trip file" message, and the current trip is left untouched. In browser storage, an unreadable save of any kind still falls back to an empty trip.
- Why bump rather than add the field silently: an older build that ignored `camps` would open a newer file and quietly lose the camps. A version number lets each build refuse what it can't fully read.
- Each future change to the format bumps the version and keeps reading the older ones. Dropping version 1 is the one exception, because no trip was ever saved in it.

## Amendment (2026-10-12, v2 spec #51): format reset; the v2 trip format is version 1
v2 adds a trip **start date** (ADR 0022). Cedric confirmed that no trip files or autosaves in earlier formats need to be kept. So instead of bumping to version 3, the format is **reset**:
- The v2 trip format, which includes `camps` and the optional start date, is **version 1**. It's the only supported version, and there is no code to read older formats.
- Anything else, including a pre-v2 "version 2" save, is refused, following the existing rules: a trip file gets the unknown-version message, and an autosave gets #28's warning without being overwritten.
- From here on, the rule above applies again: each future change bumps the version and keeps reading the older ones.
