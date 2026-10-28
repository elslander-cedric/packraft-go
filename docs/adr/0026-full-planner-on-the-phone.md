# 26. The full planner on the phone

Date: 2026-10-26

## Status
Accepted. Replaces the "phone scope" decision of ADR 0023 ("planning stays desktop"; the rest of ADR 0023 stands). Amends ADR 0005: the app is designed for desktop and phone, and the desktop layout doesn't change. ADR 0001 is unchanged: the primary user still plans at home; the phone adds planning on the go.

## Context
ADR 0023 gave phones a read-only view: the map, your position, your access points and the trip, with no planning. Paddlers on a bank, or away from a computer, still want to change a route. The planner session lives in the core (ADR 0025), so the phone can reuse the desktop's planning rules, routing and storage unchanged. The layout and the gestures were chosen from throwaway prototypes tried on a real phone (wayfinder map #103, branch `prototype/mobile-layouts`, never merged). The judging criteria, in order: the map stays visible while editing, one-thumb use on a riverbank, figures reachable in one tap.

## Decision
- **One planner with a phone layout,** not a second app. Phones get the full planner; the read-only phone view (`PhoneApp`) goes away. Every desktop capability works on the phone, with phone controls where they differ (#108).
- **Which screens:** the phone layout applies at width ≤ 640 px, or height ≤ 640 px on a touch screen (today's rule). Everything else, iPads included, gets the desktop layout (#109).
- **Layout (portrait):** a full-screen map with a bottom sheet over it (Base UI Drawer, non-modal, never closes; ADR 0020) (#106).
  - **Stops:** three fixed stops (peek, half, 90%), chosen by drag distance.
  - **Peek:** the trip name, the totals and the tabs.
  - **Tabs:** Legs, Days, Access points. The tab row scrolls sideways when it doesn't fit. (The Trip tab, with only the trip's name and start date, became the Trip details dialog, Edit trip in the menu: #154.)
    - **Legs:** compact rows; a tap zooms the map to the leg and opens the row.
    - **Days:** a card per day; a day's access warnings are chips that open their leg (ADR 0029).
    - **Trip:** name and start date (the access summary went in #123; ADR 0029).
    - **Access points:** your list; each row has edit and delete buttons. Edit opens the point's details in a dialog that stores them on Save (amended 2026-10-28: the details were inline in the tab, with a "Mark here" button, until then).
- **Layout (sideways):** a full-height side panel on the right with the same tabs, collapsible to a strip with the totals. Rotating keeps the open tab, the open leg row and any selection (#109).
- **Floating buttons over the map:**
  - top left, the menu: new, save, open, export GPX, and settings (pace factor and paddling speed) in a dialog that stores them on Save. They were a tab until #151.
  - top right: ◎ show my position, and the access layer switch;
  - bottom right: the next leg's mode (hike / paddle) and undo, plus delete and camp while a point is selected;
  - bottom left: mark an access point (at your GPS position, or the selected route point; without a fix, place it on the map). The new point opens in the details dialog.
- **Touch editing** (#107):
  - tap the map to add a point (with a point selected, a tap only clears the selection);
  - tap a point to select it;
  - press a point and drag to move it, on 44 px hit areas;
  - hold a leg about 0.4 s to insert a point on its route;
  - holding the empty map does nothing;
  - pinch to zoom (double-tap zoom is off, because its first tap would add a point).

  Access points move with the same press-and-drag (#108).
- **Access layer** (#110):
  - a chip with a popover holds the date, the legend and the note;
  - a tap always edits the route, even on water;
  - holding a water opens its details, and a tap opens a lock's;
  - details show in the sheet.

  The "Indicative only" disclaimer (ADR 0024) lives in that popover and under the day cards, not as a permanent line.
- **Names and dates:** saving or exporting asks for the trip name in a dialog. A new trip on the phone gets today as its start date. The start date stays trip data (#106).
- **No how-to text** in the phone UI: gestures are found by use. Short state lines ("Placing an access point · Cancel") are fine.
- **Planning needs a signal,** as on desktop (ADR 0023). There's no offline mode or banner: legs that can't be routed show their failure with Retry, while access points and your position keep working offline (#108).

## Considered options
- **Layouts** (#106):
  - **Tabs with the map as one tab:** hides the map while you look at figures.
  - **A sheet without tabs:** one long list that keeps growing.
  - **Swipeable cards:** too small for legs and actions, and the swipe competes with map panning.
- **Touch models** (#107):
  - **A fixed crosshair with buttons:** precise, but every edit takes two steps.
  - **Visible "+" handles to insert:** replaced by holding the leg.
- **Only the selected point can be dragged:** safer against moving a point by accident while panning, but a tap more per move. Undo is the safety net instead.
- **Keeping a separate read-only phone screen:** two phone screens to build and test for no gain.

## Consequences
- **Core changes, desktop included:**
  - **A new leg takes the mode of the last leg:** today it always starts as hike.
  - **A new edit, `insertPoint`:** it splits a leg in two. The desktop gets the edit but no controls for it (a separate effort).
- **The desktop point drag moves from mouse events to pointer events,** so tablets on the desktop layout can drag points with a finger. Nothing else on desktop changes.
- **Leaflet 1.9 listens to touch events on phones,** and its path drag is mouse-only. So point dragging is our own pointer-event code, which also stops `touchstart` (research #105).
- **The phone screens are replaced:** `PhoneApp`, `PhoneTripView` and `PhoneMap` go, and their e2e tests move to the phone planner. Playwright's touchscreen can only tap, so touch-drag tests need another way (#112).
  - *Note, 2026-10-26:* `PhoneMap` stayed. It grew into the phone planner's map (trip editing, holds, the access layer) instead of being replaced.
- **New UI wrappers in `src/ui/components/`** (ADR 0020): a bottom sheet (Base UI Drawer) and tabs (Base UI Tabs). No new runtime dependency.
