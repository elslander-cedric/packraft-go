# 37. GPX export: one file, one track, a waypoint per section

Date: 2026-11-04

## Status
Accepted. Supersedes ADR 0021 (one file per section, delivered as a ZIP).

## Context
ADR 0021 split the export into one GPX file per section, zipped, because Garmin Connect's course import reads only the first `<trk>` of a file. That made it work on Garmin, but every trip arrived as a ZIP to unpack and several courses to import, and no app saw the trip as one route.

A Garmin course can mark places along its line as *course points*: the watch lists them and gives an alert as you get close. As far as we know, Garmin Connect turns a GPX file's waypoints (`<wpt>`) into course points when you import it as a course. We haven't checked this against a real device yet.

## Decision
- **One GPX file per trip**, named after the trip like the save file (`<trip name>.gpx`, characters that file systems reject replaced with `-`, "Untitled trip" for an unnamed trip). No ZIP.
- **One `<trk>` with one `<trkseg>`** through every leg in order, named after the trip as typed. Each leg after the first leaves out its first point, which is where the leg before it ended. So the whole trip imports as one course.
- **A waypoint where each section starts**, plus one where the trip ends, written before the track (GPX 1.1 order). Section rules are unchanged (GLOSSARY "Section"). A waypoint is the track's own point where its section starts, so it lies on the line. Names are short for a watch screen: `<n> – <mode>`, plus the day when the trip has camps: `<n> – Day <d> – <mode>`. The last one is "End".
- Earlier GPX rules still apply: GPX 1.1, routed geometry with elevations, unrouted legs as straight lines, characters invalid in XML removed, coordinates within GPX bounds.

## Consequences
- The ZIP dependency (`fflate`) is gone.
- Put-ins, take-outs and camps reach the watch as course points instead of as file boundaries. If an importer ignores waypoints, you still get the whole route, just without the section marks.
- Garmin may shorten long waypoint names. That's why the names leave out the trip name.
