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
- **Drop**: The elevation lost from a paddle leg's put-in to its take-out. Shown instead of climb/descent on paddle legs.
- **Navigable waterway**: A canal or river officially open to shipping (in Flanders managed by De Vlaamse Waterweg). Access rules differ from those for non-navigable rivers. See `docs/research/access-rules.md`.
- **Stretch**: A legally defined section of river where paddling is regulated as one unit (e.g. Walloon AGW Annex 1 stretches), with its own season, hours and flow thresholds.
- **Aire**: A designated put-in or take-out point on a Walloon stretch (*aire d'embarquement / de débarquement*). In Wallonia you may only get in or out at an aire.
- **Access status**: Whether a stretch may be paddled at a given moment (open / closed, with a reason such as low flow, high flow or season).
- **Access point**: A place where you can get onto or off the water: a put-in, a take-out, or both. It may be an official aire, a slipway, a jetty or an informal bank. Being an access point doesn't make it legal; see Aire.
- **Section**: A run of consecutive legs of the same mode (hike or paddle), ending where the mode changes or at a camp. Each section is exported as its own GPX file (ADR 0021). Not the same as a Stretch, which is a legal unit of river.
