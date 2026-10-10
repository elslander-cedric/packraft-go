# 6. Plans leave the app as GPX

Date: 2026-10-10

## Status
Accepted

## Context
People already carry GPS devices and outdoor apps that import GPX. Building in-field navigation is out of scope (ADR 0001).

## Decision
A trip can be exported as a GPX file.

## Consequences
- Legs should stay distinguishable in the export (e.g. one track per leg, named by mode).
