# packraft-go: project instructions

Route-planning app for packrafting (mixed hike + paddle trips).

## Stack
- Next.js (App Router) + TypeScript, deployed to Vercel Hobby (ADR 0015). Browser-only logic in v1: no API routes, no database (ADR 0011).
- Map: Leaflet with OpenTopoMap tiles. Map components must be client-only (Leaflet needs `window`).
- Routing/snapping/elevation: public BRouter server, hiking profile for hike legs and river profile for paddle legs (ADR 0014). Only route a leg when it changes; store results in the trip.
- UI components: Base UI (`@base-ui/react`), unstyled, via thin wrappers in `src/ui/components/`. Never import Base UI directly in screens. Plain CSS with design tokens as CSS variables (ADR 0020).
- Storage: browser storage + file save/open (ADR 0011).
- Tests: Vitest (unit), Playwright (end-to-end), recorded BRouter responses, never the live server (ADR 0019).
- Free services only (ADR 0012). English UI with strings in one module (ADR 0013).

## Commands
Node 22 (see `.nvmrc`), npm.
- Install: `npm install` (first time also `npx playwright install chromium`)
- Dev server: `npm run dev` (http://localhost:3000)
- Unit tests: `npm test` (Vitest, `src/**/*.test.ts`); watch mode: `npm run test:watch`
- End-to-end tests: `npm run e2e` (Playwright, `e2e/`; builds and starts the app on port 3100, or `E2E_PORT` when set so parallel worktrees don't clash). Use `serveOffline(page)` from `e2e/support/offline.ts` so tiles come from fixtures and no live service is called.
- Lint: `npm run lint`
- Format: `npm run format` (Prettier; CI runs `npm run format:check`)
- Type-check: `npm run typecheck`
- Production build: `npm run build`
- Manual-only scripts (call live services; never in `npm test`, `npm run e2e` or CI). Details in `docs/manual-scripts.md`:
  - `npm run check:brouter` and `npm run check:kiwis`: compare the live BRouter / KiWIS answers with the recorded fixtures (MATCH / DRIFT / MISMATCH; exit 1 = the live app is probably broken). They never write fixtures.
  - `npm run check:kayak` (#218): the same for the SPW's `PKAYAK` map service: the fields of layers 0, 1, 3 and 5, the status codes and the obstacle codes. Never writes fixtures.
  - `npm run check:basemaps`: asks every base map and overlay source for one tile (OK / FAILED; exit 1 = a base map or overlay is probably broken; #179, #180, ADRs 0031, 0032).
  - `npm run data:walloon-stretches` and `npm run review:walloon-stretches`: build and review the Walloon stretch geometry from OSM (#54, ADR 0024), and each record's official stretch against the SPW's lines (#209, ADR 0035).
  - `npm run prepare:spw-data`: prepares the built-in SPW snapshots (official aires, stretches and obstacles) from `PKAYAK` (#206, #214, ADR 0035). Review the diff of `src/access/data/` before committing.

**Layout tests must be font-independent (#70).** The app ships one self-hosted font (Inter, OFL, `public/fonts/`, declared in `globals.css`) so text measures the same on macOS and the Linux CI runner. In layout e2e tests wait for `document.fonts.ready` before measuring, assert the real rule (a figure on one line, Retry fully visible), and never rely on an OS font or a tuned line-count threshold. Don't change the font stack without re-running the layout tests on CI.

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit and e2e tests on every pull request.

## Layout
Areas with more detail have a `README.md` (each with a `CLAUDE.md` that imports it, so it loads when you work in that folder). Read the README before changing code that belongs to an area, also from outside its folder.
- `src/app/`: Next.js routes (thin; no domain logic).
- `src/map/`: Leaflet map: base maps, overlays, legs, point numbers, the Map menu. `TripMap.tsx` must only be loaded through `ClientTripMap.tsx`. See `src/map/README.md`.
- `src/core/`: trip planner core (pure TypeScript: trip model, edits, figures, router interface). No React, browser or network imports; lint enforces this. Test fakes live in `src/core/testing/`.
- `src/routing/`: BRouter adapter (implements the core's `Router`). Recorded BRouter responses live in `src/routing/fixtures/` and are shared by unit and e2e tests; `serveOffline(page, { brouter })` replays them.
- `src/persistence/`: browser storage wrapper for autosave of the trip and settings (ADR 0011). Uses the core's versioned save format; never stores undo history. `tripStorage.ts` keeps the trip under `packraft-go.trip`; `settingsStorage.ts` keeps the planner's settings (pace factor, paddling speed, base map, overlays, the side panel's width and whether it is open) under their own key, `packraft-go.settings`, validated by `src/core/settings.ts`. Access points (ADR 0023) are stored separately under `packraft-go.access-points` in their own versioned format, independent of trips.
- `src/dataprep/`: offline data preparation logic (e.g. Walloon stretch geometry from OSM). Pure, used only by scripts in `scripts/` and the offline preparation in `src/access/prepare/`; never imported by app code.
- `src/testing/`: shared test helpers. Test-only; never imported by app code. Includes the offline GPX 1.1 checker (`gpx11.ts`).
- `src/ui/components/`: thin wrappers around Base UI (ADR 0020), dialogs included. Screens import these, never `@base-ui/react`; lint enforces this. Design tokens are CSS variables at the top of `src/app/globals.css`. See `src/ui/components/README.md`.
- `src/ui/icons/` (ADR 0028, #143): the UI icons, Font Awesome Free Solid, the only place that imports `@fortawesome/free-solid-svg-icons` (lint enforces this). `icons.ts` names each icon by its use, `Icon` draws one in a screen and `iconSvg()` as a string for Leaflet markers; both use `currentColor`. Icon-only buttons keep their accessible names in `strings.ts`.
- `src/access/` (+ `src/core/access.ts`, `agw.ts`, `officialAire.ts`, `obstacle.ts`): the access layer (ADRs 0022, 0024), official aires and obstacles (ADR 0035). Built-in data only, prepared offline, never queried at runtime. See `src/access/README.md`.
- `src/hydrometry/` (ADR 0024): the KiWIS client, the only module that talks to the SPW hydrometry service. See `src/hydrometry/README.md`.
- `src/kayak/` (ADR 0035): the `PKAYAK` client (official status and incidents), the only module of the app that talks to the SPW's kayak map service, and the live feeds (`src/ui/liveFeed.ts`). See `src/kayak/README.md`.
- `src/geocoding/` (ADRs 0027, 0030): the Nominatim client, the only module that talks to Nominatim and the only one that sends access point positions anywhere, and place search. See `src/geocoding/README.md`.
- `src/pwa/` and `public/sw.js`: PWA registration and a hand-written service worker (ADR 0023). It caches the same-origin app shell only, never map tiles, BRouter, KiWIS, PKAYAK or Nominatim.
- `src/ui/planner/` (+ `src/map/TripMap.tsx`): the one planner (ADRs 0026, 0034), on every screen, and access point editing (ADR 0036), its second mode. Runs `usePlanner` and adds no planning rules. See `src/ui/planner/README.md`.
- `src/ui/strings.ts`: all user-facing text (ADR 0013).

## Conventions
- Follow `CODING_STANDARDS.md`: less is better, less complexity is better. Prefer a well-known package to hand-written logic (ADR 0038).
- Domain terms are defined in `GLOSSARY.md`; use them consistently in code and docs.
- Significant decisions get an ADR in `docs/adr/NNNN-title.md`.
- Work is tracked as GitHub issues with triage labels (see Agent skills below).
- Never push to `main` directly; open a PR.

## Agent lessons
Project-specific rules for agents working in this repo (learned in past PRs).
- **Ports:** each agent gets its own port. Set `E2E_PORT` for `npm run e2e` (e.g. 3101, 3102, …) and pass `-- --port <n>` to `npm run dev`, so parallel worktrees don't test each other's builds.
- **Dates:** no time-zone drift: a date picked in Europe/Brussels must not move a day.
- **No live services in tests (ADR 0019):** use `serveOffline(page)` and recorded fixtures, and prove it, e.g. by blocking `fetch` or the network and re-running.
- **Edge cases that bit us:** trip names with `/ : & <` or control characters (GPX/XML must stay well-formed, inner names must match file names; #24, #45); longitudes rounding to 180 (GPX needs < 180; #24); unlisted Walloon water must read "not allowed", not "unknown" (#75).

## Agent skills

### Issue tracker

GitHub Issues for this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
