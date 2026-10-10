# 4. Start with Belgium, using OpenStreetMap data

Date: 2026-10-10

## Status
Accepted

## Context
OpenStreetMap is a free, worldwide map with rivers and trails, but quality varies by region. Testing in a known area makes errors easy to spot.

## Decision
v1 targets Belgium. Map data comes from OpenStreetMap.

## Consequences
- Nothing in the design may hard-code Belgium; other regions should be a data/config change.
- OSM licence (ODbL) requires attribution on the map.
