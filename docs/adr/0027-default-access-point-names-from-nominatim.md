# 27. Default access point names from Nominatim

Date: 2026-10-26

## Status
Accepted

## Context
Access points need a name so you can recognise them in a list, but marking one at the riverbank must stay one tap. Typing a name there is a chore, and the use and kind ("Put-in, Slipway") rarely tell two points apart.

## Decision
A point you haven't named gets a default name from the nearest road and place ("Rue du Moulin, Hotton"), using OpenStreetMap Nominatim's reverse geocoding (free, no key, OSM like the rest of the stack; ADRs 0004, 0012). The lookup never blocks marking: the point is saved at once, and the name is filled in when a lookup succeeds, at most one request per second, whenever the app is online. Names are local, as on signs. A name you type is never replaced. Clearing it brings the default name back.

## Consequences
- This is the first live service that receives your access point positions. Nothing else about the point is sent.
- Nominatim's usage policy (1 request/second, identify the app, credit OSM) applies. The map's "© OpenStreetMap contributors" credit covers attribution.
- Tests replay recorded Nominatim responses, never the live server (ADR 0019).
- The access point format stays version 1: no version is in production use yet, and a point without a name reads as unnamed.
