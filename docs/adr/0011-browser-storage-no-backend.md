# 11. Trips are stored in the browser; no backend

Date: 2026-10-10

## Status
Accepted

## Context
A server and database cost money and maintenance. v1 is for personal use (ADR 0002).

## Decision
Trips are saved in browser storage, with save-to-file / open-file for backup and moving between computers. There is no backend in v1.

## Consequences
- The app is a static site that can be hosted for free.
- Trips don't sync between devices automatically.
