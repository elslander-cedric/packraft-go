# 17. v1 editing actions

Date: 2026-10-10

## Status
Accepted

## Context
Keep the editor small enough to build and test well.

## Decision
v1 supports: add point, drag point, delete point, switch a leg between hike and paddle, mark/unmark a camp, undo. Nothing else (no redo, no multiple routes per trip, no notes).

## Consequences
- Undo needs edits modelled as reversible steps from the start.
