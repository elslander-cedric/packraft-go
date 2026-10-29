# 34. Mobile first: one planner layout

Date: 2026-10-29

## Status
Accepted. Supersedes ADR 0005. Amends ADR 0026: the desktop layout goes away, and the screen rule changes ("iPads get the desktop layout" no longer holds). The rest of ADR 0026 stands.

## Context
Since ADR 0026 the app has two planners over the same `usePlanner`: the desktop layout (map plus sidebar: `TripPlanner`, `TripToolbar`, `EditToolbar`, `LegsPanel`, `AccessPointsPanel`, `AccessPanel`, `SettingsPanel`, `MapMenu`, `PlaceSearchBar`) and the phone layout (full-screen map, floating buttons, a bottom sheet, or a side panel on the right when held sideways). Every feature is built, styled and tested twice, and the two drift apart (the desktop has no `insertPoint` control; the phone shows no warning for an unknown autosave version). The phone's sideways side panel already holds everything the desktop sidebar does.

## Decision
- **One planner,** the phone planner, on every screen. The desktop tree is deleted and the `Phone*` components lose their prefix (`PhonePlanner` → `Planner`, `PhoneLegsList` → `LegsList`, …).
- **Sheet or panel:** a bottom sheet in portrait at width ≤ 640 px; the right side panel everywhere else (a phone held sideways, tablets either way up, desktop).
- **The side panel is resizable:** drag its left edge, or use the arrow keys on it (a focusable splitter), between about 320 px and 50% of the window. It still collapses to a strip. It opens at 380 px on first load. Its width and whether it is open are device settings, like the base map, never trip data. The same panel is used on a phone held sideways.
- **One way of doing each thing,** the phone's:
  - the trip's name and start date in the Edit trip dialog;
  - settings in a dialog from the menu;
  - access points edited in their dialog, stored on Save;
  - the access layer's date, legend and note in the chip's dialog;
  - base maps and overlays from the layers button;
  - place search as the pill on the top row;
  - ◎ and "mark an access point" on every screen (without a position fix, marking places the point on the map).
- **The same gestures for touch and mouse** (ADR 0026): click or tap adds a point, press and drag moves one, holding a leg about 0.4 s inserts a point, double-click zoom stays off; the mouse wheel zooms. Floating buttons keep their 44 px size everywhere.
- **No access points file** (#189): export and import of your access points go away on every screen. A leg's mode is set when it is drawn, with the next leg's mode toggle; there is no switch on a drawn leg.
- **Full keyboard use on every screen:** every control reachable with Tab, and the shortcuts (undo, delete the selected point, Escape) as today.
- **Rollout in four stages,** each leaving `main` working:
  1. the resizable side panel and its settings;
  2. the phone planner closes its gaps with the desktop (the unknown-version autosave warning, Tab reaching every control, anything else the desktop e2e tests check);
  3. the screen rule switches, and the desktop e2e tests move to the one planner in the same change;
  4. the desktop tree is deleted and the files renamed.

## Considered options
- **Two planners sharing more components:** keeps a second layout to build and test, and the drift that comes with it.
- **A wide-screen variant of the top row** (an always-open search field): a second design to keep in step for little gain.
- **The desktop's patterns on every screen** (inline name and settings, a sidebar): they don't fit a phone; the phone's do fit a desktop.

## Consequences
- The desktop gets `insertPoint` (hold a leg) for the first time.
- Access points can no longer be backed up, moved or shared as a file (amends ADR 0023), and a drawn leg's mode can no longer be switched.
- Desktop users lose inline editing of the name, start date, settings and access points; each is a dialog away.
- The desktop e2e tests are rewritten for the one planner; `acceptance-31-keyboard` is rewritten, not dropped.
- `CLAUDE.md`'s Layout section is rewritten in stage 4.
