# 39. Suggested trips: the app proposes one-day trips from your wishes

Date: 2026-11-15

## Status
Accepted. Amends ADR 0003 (the user still draws; the app may now also propose whole one-day trips, which the user browses and may use as their trip).

## Context
Drawing the hike/paddle mix by hand means checking yourself which water is open, where you may get in and out (in Wallonia only at an aire), whether a dam or lock is in the way, and whether the day fits what you want to do. The app already knows most of this: the access rules, official aires, obstacles, locks and your access points. ADR 0003 left automatic route-finding out of v1 as too hard. Packrafters often start from "what's a good day out around here?" rather than from two fixed points, so the first slice answers that. The planner is still the home planner (ADRs 0001, 0002).

## Decision
- **Find trips in the visible map area.** You set your *trip wishes*, and the app shows the top 10 *suggested trips* that start and end inside the part of the map you're viewing. Zoom to widen or narrow the search.
- **Trip wishes:** about how many km to hike and to paddle, the most mode switches (every put-in and every take-out counts one), loop, one-way or either (default either), and the date (default today). The distances are wishes: a suggestion may land within ±20% of each. The switches are a hard maximum. Wishes are remembered per device, like the pace factor, never saved with a trip.
- **One day, always.** A suggested trip never covers more than one day: no camps, no multi-day search.
- **Ranking:** closest to the wished distances first, then more walking on waymarked trails and less on roads, then variety (at most a couple of suggestions per river stretch, so the 10 aren't near-copies).
- **Browse, then use.** All suggestions are drawn on the map at once as numbered lines, with a list beside them (a sheet on the phone). Selecting one highlights it, fades the rest and shows its details: distances, switches, time, trail share, warnings. Back returns to the list. *Use this trip* makes it your current trip as ordinary legs, through the usual question when replacing a trip, and carries over the date.
- **Open water only.** A suggestion paddles only water whose access status is open on the wished date: today uses live official status and flows, a future date season and hours only. Never forbidden, unknown or closed. Rivers downstream only; canals and still water either way. In Flanders only rivers, open canals and VMM agreement stretches, never streams or ditches. It never passes a dam, an impassable obstacle or a lock on the water: it gets out before and back in after at a legal place. Rocks, drossage and low bridges stay warnings.
- **Where it gets in and out:** official aires, your access points, and, outside Wallonia only, *bank spots*: where a path or road reaches the bank of open water, outside VMM agreement stretches, unchecked on the ground and labelled so. Using a trip through one offers to save it as an access point. Wallonia stays aires-only because the AGW says so.
- **A route network shipped with the app, search in the browser.** A manual script prepares, offline, the nodes (aires, bank spots), the paddle links between them (distance along the water, stretch, obstacles, direction) and the walking links between nearby nodes, routed with BRouter preferring waymarked trails (`profile:hiking_routes_preference`, which the public server honours; see `docs/research/data-sources.md`). One walking link reaches at most about 15 km; longer walks pass through a node. Your access points join at search time with estimated walks. The search makes no live calls, so it is instant and works offline (bar today's live status). The trip you use is routed for real, as any leg is (ADR 0014).
- **Hand-drawn legs are unchanged**, including their hike routing.

## Considered options
- **Fill in one leg between two fixed points** (an earlier draft of this ADR): closer to ADR 0003, but it answers "how do I get from A to B", not "where can I go". It may come later.
- **Estimate walks and check the best candidates live with BRouter:** no ceiling on a walk and nothing big to ship, but searching a whole map area means many candidates, and checking 10 trips live would take dozens of calls per search: slow, impolite to the public server, and impossible offline.
- **Hard maximums for the distances:** too strict for wishes; a 10.5 km paddle shouldn't vanish because you typed 10. The number of switches stays hard because each one costs real effort.
- **Wishes saved with the trip:** a suggestion doesn't belong to a trip until you use it.
- **Multi-day suggestions:** need camps and campsite data, and legal camping is rare in Belgium.
- **Only aires and access points outside Wallonia:** Flanders has no shippable list of access points (see `docs/research/official-access-points-flanders-brussels.md`), so suggestions there would be rare. Asking VMM and De Vlaamse Waterweg for permission is a separate follow-up.

## Consequences
- A new manual data script and a larger built-in dataset (nodes, paddle links and walking links); review its diff like the other snapshots. Walking links are only as current as the last run.
- A walk over about 15 km without a node on the way is never suggested.
- No save format change; trip wishes are a new device setting.
