# 19. Testing: Vitest, Playwright, recorded BRouter responses

Date: 2026-10-10

## Status
Accepted

## Context
Tests must be fast, repeatable and must not hammer a free community server.

## Decision
Unit tests with Vitest; a few end-to-end tests with Playwright. Tests use recorded BRouter responses rather than the live server.

## Consequences
- Builders work test-first.
