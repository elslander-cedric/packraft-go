# 16. Portages are short hike legs

Date: 2026-10-10

## Status
Accepted

## Context
BRouter's river profile doesn't know about weirs or other obstacles.

## Decision
The user handles obstacles by splitting a paddle leg and drawing a short hike leg (a portage) around it. No automatic weir detection in v1.

## Consequences
- No special portage type is needed in the data model.
