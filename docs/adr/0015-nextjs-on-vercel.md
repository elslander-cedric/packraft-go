# 15. Next.js, deployed on Vercel

Date: 2026-10-10

## Status
Accepted

## Context
Cedric prefers Next.js. It is widely used, agents know it well, and it leaves room for server features later (e.g. accounts, or a proxy for API keys). Vercel is Next.js's own host, with a free Hobby plan that works with private repos.

## Decision
The app is built with Next.js (App Router) and TypeScript, and deployed to Vercel's free Hobby plan. It runs locally until the first usable version exists. In v1 all logic stays client-side; no API routes or database (ADR 0011).

## Consequences
- Leaflet needs the browser's window object, so map components must be client-only (loaded without server rendering).
- Vercel Hobby is non-commercial; fine for personal use (ADR 0002).
- Cedric creates the Vercel account and connects it; agents do not.
