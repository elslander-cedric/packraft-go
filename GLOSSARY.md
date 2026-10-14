# Glossary

Shared language for packraft-go. One term per entry: what it means *in this project*.

- **Packrafting**: Travelling through the backcountry by combining hiking with paddling an inflatable, backpack-sized boat (a packraft).
- **Packraft**: A lightweight inflatable boat that folds small enough to carry in a backpack.
- **Trip**: A planned packrafting journey, usually multi-day, made of one or more legs.
- **Leg**: A continuous stretch of a trip done in one mode: a *hike leg* (on foot, boat carried) or a *paddle leg* (on water).
- **Put-in**: The point where a hike leg ends and a paddle leg begins; you inflate and launch.
- **Take-out**: The point where a paddle leg ends and a hike leg begins; you get off the water and pack up.
- **Day**: The part of a trip between the start (or a camp) and the next camp (or the end). A one-day trip has a single day and no camps.
- **Camp**: An overnight stop marked on the route. Camps split a trip into days.
- **Portage**: Carrying the packraft around an obstacle on the water (e.g. a weir). Modelled as a short hike leg between two paddle legs.
- **Lock**: A chamber that lifts boats between two water levels on a navigable waterway. Paddlers don't pass locks on the water: they portage (Flanders bans it outright; in Brussels no rule lets small craft in). Locks in Flanders and Brussels are marked on the access layer from OpenStreetMap.
- **Drop**: The elevation lost from a paddle leg's put-in to its take-out. Shown instead of climb/descent on paddle legs.
- **Navigable waterway**: A canal or river officially open to shipping (in Flanders managed by De Vlaamse Waterweg). Access rules differ from those for non-navigable rivers. See `docs/research/access-rules.md`.
- **Stretch**: A legally defined section of river where paddling is regulated as one unit (e.g. Walloon AGW Annex 1 stretches), with its own season, hours and flow thresholds.
- **Aire**: A designated put-in or take-out point on a Walloon stretch (*aire d'embarquement / de débarquement*). In Wallonia you may only get in or out at an aire.
- **Access status**: Whether water may be paddled at a given moment. One of: **open**; **closed today** (legal water, but closed by season, hours or flow); **forbidden** (an explicit ban, e.g. a port or excluded canal); **unknown** (no rule or no data).
- **Access point**: A place you've marked where you can get onto or off the water: a put-in, a take-out, or both. Its kind is official aire, slipway, jetty or informal bank. Access points belong to you, not to a trip, and any trip can use them. Being an access point doesn't make it legal; see Aire.
- **Section**: A run of consecutive legs of the same mode (hike or paddle), ending where the mode changes or at a camp. Each section is exported as its own GPX file (ADR 0021). Not the same as a Stretch, which is a legal unit of river.
- **Start date**: The optional calendar date of a trip's first day. Day *n* falls on start date + *n*−1. Access status is checked against these dates.
