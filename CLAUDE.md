# packraft-go: project instructions

Route-planning app for packrafting (mixed hike + paddle trips).

## Stack
- Next.js (App Router) + TypeScript, deployed to Vercel Hobby (ADR 0015). Browser-only logic in v1: no API routes, no database (ADR 0011).
- Map: Leaflet with OpenTopoMap tiles. Map components must be client-only (Leaflet needs `window`).
- Routing/snapping/elevation: public BRouter server, hiking profile for hike legs and river profile for paddle legs (ADR 0014). Only route a leg when it changes; store results in the trip.
- Storage: browser storage + file save/open (ADR 0011).
- Tests: Vitest (unit), Playwright (end-to-end), recorded BRouter responses, never the live server (ADR 0019).
- Free services only (ADR 0012). English UI with strings in one module (ADR 0013).

## Commands
Node 22 (see `.nvmrc`), npm.
- Install: `npm install` (first time also `npx playwright install chromium`)
- Dev server: `npm run dev` (http://localhost:3000)
- Unit tests: `npm test` (Vitest, `src/**/*.test.ts`); watch mode: `npm run test:watch`
- End-to-end tests: `npm run e2e` (Playwright, `e2e/`; builds and starts the app on port 3100). Use `serveOffline(page)` from `e2e/support/offline.ts` so tiles come from fixtures and no live service is called.
- Lint: `npm run lint`
- Type-check: `npm run typecheck`
- Production build: `npm run build`

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit and e2e tests on every pull request.

## Layout
- `src/app/`: Next.js routes (thin; no domain logic).
- `src/map/`: Leaflet map. `TripMap.tsx` imports Leaflet and must only be loaded through `ClientTripMap.tsx` (no server rendering). `mapConfig.ts` holds the initial view and base layer.
- `src/core/`: trip planner core (pure TypeScript: trip model, edits, figures, router interface). No React, browser or network imports; a test enforces this. Test fakes live in `src/core/testing/`.
- `src/routing/`: BRouter adapter (implements the core's `Router`). Recorded BRouter responses live in `src/routing/fixtures/` and are shared by unit and e2e tests; `serveOffline(page, { brouter })` replays them.
- `src/persistence/`: browser storage wrapper for autosave of the trip and settings (ADR 0011). Uses the core's versioned save format; never stores undo history. `tripStorage.ts` keeps the trip under `packraft-go.trip`; `settingsStorage.ts` keeps the planner's settings (pace factor, paddling speed) under their own key, `packraft-go.settings`, validated by `src/core/settings.ts`.
- `src/ui/strings.ts`: all user-facing text (ADR 0013).

## Conventions
- Domain terms are defined in `GLOSSARY.md`; use them consistently in code and docs.
- Significant decisions get an ADR in `docs/adr/NNNN-title.md`.
- Work is tracked as GitHub issues; labels: `ready-for-agent`, `tested`, `needs-fix`.
- Never push to `main` directly; open a PR.
