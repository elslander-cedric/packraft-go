# 36. Access point editing is a separate mode

Date: 2026-11-03

## Status
Accepted. Amends ADR 0026 (access points move with the same press-and-drag as route points; the mark button also marks the selected route point; the Access points tab is one of the sheet's tabs) and ADR 0034 ("mark an access point" on every screen).

## Context
A route point snapped onto one of your access points sits on top of it. Their 44 px hit areas overlap, and the access point's square hit box reaches past the route point's circle, so a press meant for the route point often drags the access point. That move is saved at once and isn't on the trip's undo, so it's easy to make and hard to notice. Where the two overlap, one of them can't be selected at all. Access points are reference marks you reuse across trips and rarely move; route points are what you drag all the time.

## Decision
- **Two modes.** The planner is either in its normal mode or in *access point editing*. It always opens in normal mode; the mode lives in the planner session, never in settings.
- **Normal mode:** your access points don't react on the map. A press on one goes to whatever is under it: a route point, a leg or the map. Snap offers still move trip points onto them. Only the Sections and Days tabs are shown.
- **Access point editing:** only your access points can be marked, moved (press and drag), edited and deleted. The trip is frozen: route points can't be selected, holding a leg doesn't insert a point, delete, camp and undo are off and snap offers are hidden; the trip stays drawn. A tap on the empty map only places a new access point (see Marking). Only the Access points tab is shown, with its list as before.
- **Entering and leaving:** a floating button enters the mode and, pressed again, leaves it; while in it the button is coloured and shows an exit icon beside the mark button, with no banner (amended 2026-11-03). Entering opens the panel or sheet on the Access points tab; leaving restores the tab and its open or closed state from before. Both clear the selection.
- **Marking** is only in access point editing (amended 2026-11-03): a tap on the map places a new access point there, not stored yet; another tap moves it there, and it drags like the others. The flag button then opens its details, and Save stores it and lists it; Cancel keeps it on the map unsaved, and leaving the mode drops it. Then the next tap places another. With no new point on the map, the flag places it at your GPS position and opens its details; without a fix it asks for a tap on the map. The button that made the selected route point an access point goes.
- **Marker colour** (amended 2026-11-03): your access points' markers are grey in normal mode and green in access point editing, so the colour says whether they can be changed; their kind still sets the shape. Their use is no longer shown by colour on the map (it stays in the marker's name and the list); official aires keep their use colours.
- Official aires stay tappable for their details in both modes.

## Considered options
- **Hit-area priority only** (a route point's circle wins, the access point's hit area becomes a circle): fixes most accidental drags but still leaves one of two overlapping points unreachable.
- **A lock switch** that swaps which point is on top: the same idea with two half-working modes; a clean split was clearer.
- **Long-press, or select first, to drag an access point:** still lets taps and presses near the trip reach the wrong point.
- **An undo toast after moving an access point:** catches the accident after the fact; not needed once a move needs the mode.

## Consequences
- Marking an access point where you stand takes two taps instead of one.
- Turning a route point into an access point means entering the mode and marking it there.
- The side panel's open or closed setting isn't changed by entering: a reload made while editing comes back in normal mode with the panel as it was before.
- New trip and Open trip still replace the trip while editing access points, and the mode stays.
- Back to start is frozen like the other trip edits: its button is hidden while editing.
- Snap offers held back while editing still follow your access points as you move them, and show the result on leaving.
