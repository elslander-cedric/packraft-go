# 5. Desktop-first web app

Date: 2026-10-10

## Status
Superseded by ADR 0034 (mobile first: one planner layout). Amended earlier by ADR 0026: phones get the full planner in a phone layout.

## Context
Planning happens at home on a big screen (ADR 0001). A web app needs no install and runs on any computer.

## Decision
packraft-go is a web app designed for desktop browsers first.

## Consequences
- Mobile layout is not a v1 goal.
- Field navigation is handled by exporting GPX (ADR 0006).
