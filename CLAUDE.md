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
- Type-check: `npm run typecheck`
- Production build: `npm run build`
- Manual-only scripts (call live services; never in `npm test`, `npm run e2e` or CI). Details in `docs/manual-scripts.md`:
  - `npm run check:brouter` and `npm run check:kiwis`: compare the live BRouter / KiWIS answers with the recorded fixtures (MATCH / DRIFT / MISMATCH; exit 1 = the live app is probably broken). They never write fixtures.
  - `npm run data:walloon-stretches` and `npm run review:walloon-stretches`: build and review the Walloon stretch geometry from OSM (#54, ADR 0024).

**Layout tests must be font-independent (#70).** The app ships one self-hosted font (Inter, OFL, `public/fonts/`, declared in `globals.css`) so text measures the same on macOS and the Linux CI runner. In layout e2e tests wait for `document.fonts.ready` before measuring, assert the real rule (a figure on one line, Retry fully visible), and never rely on an OS font or a tuned line-count threshold. Don't change the font stack without re-running the layout tests on CI.

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit and e2e tests on every pull request.

## Layout
- `src/app/`: Next.js routes (thin; no domain logic).
- `src/map/`: Leaflet map. `TripMap.tsx` imports Leaflet and must only be loaded through `ClientTripMap.tsx` (no server rendering). `mapConfig.ts` holds the initial view and base layer.
- `src/core/`: trip planner core (pure TypeScript: trip model, edits, figures, router interface). No React, browser or network imports; a test enforces this. Test fakes live in `src/core/testing/`.
- `src/routing/`: BRouter adapter (implements the core's `Router`). Recorded BRouter responses live in `src/routing/fixtures/` and are shared by unit and e2e tests; `serveOffline(page, { brouter })` replays them.
- `src/persistence/`: browser storage wrapper for autosave of the trip and settings (ADR 0011). Uses the core's versioned save format; never stores undo history. `tripStorage.ts` keeps the trip under `packraft-go.trip`; `settingsStorage.ts` keeps the planner's settings (pace factor, paddling speed) under their own key, `packraft-go.settings`, validated by `src/core/settings.ts`. Access points (ADR 0023) are stored separately under `packraft-go.access-points` in their own versioned format, independent of trips.
- `src/dataprep/`: offline data preparation logic (e.g. Walloon stretch geometry from OSM). Pure, used only by scripts in `scripts/`; never imported by app code.
- `src/testing/`: shared test helpers. Test-only; never imported by app code. Includes the offline GPX 1.1 checker (`gpx11.ts`), the hard-coded UI text checker (`hardCodedText.ts`, ADR 0013), and the dependency boundary checker (`dependencyBoundary.ts`, allowlist of runtime dependencies, ADR 0020). To add a runtime dependency, update that allowlist deliberately.
- `src/ui/components/`: thin wrappers around Base UI (ADR 0020): `ConfirmDialog` (Alert Dialog), `ToggleGroup`, `NumberField`, `Toolbar`/`ToolbarButton` (with Tooltip), `Switch`, `Menu`, `TextEntryDialog` (Dialog with one text field), `FormDialog` (Dialog around a small form), `Popover`, `SidePanel` (the sheet's sideways counterpart) and `Button`, each with its own stylesheet. Screens import these, never `@base-ui/react`; `boundary.test.ts` enforces this. Wrappers take their text as props from the screens. Design tokens (colours, spacing) are CSS variables at the top of `src/app/globals.css`. In e2e tests, answer confirmations with `e2e/support/confirmDialog.ts`.
- `src/ui/icons/` (ADR 0028, #143): the UI icons, Font Awesome Free Solid, the only place that imports `@fortawesome/free-solid-svg-icons` (`boundary.test.ts` enforces this). `icons.ts` names each icon by its use, `Icon` draws one in a screen and `iconSvg()` as a string for Leaflet markers; both use `currentColor`. Icon-only buttons keep their accessible names in `strings.ts`.
- `src/access/` (+ `src/core/access.ts`): the access layer (ADRs 0022, 0024). Built-in rule data with a source and research date per record, prepared offline with `npm run prepare:access-data` (never queried at runtime), and the pure access-status evaluation in the core (Walloon AGW rules in `src/core/agw.ts`; `src/access/walloon.ts` adapts `src/data/walloon-stretches.json` at load time). See `src/access/README.md`.
- `src/hydrometry/` (ADR 0024, #61): the KiWIS client, the only module that talks to the SPW hydrometry service. `kiwis.ts` implements the core's `FlowSource` (two batched requests per refresh, answers and failures cached for 15 minutes); `liveCheck.ts` is the manual contract check (#64). Recorded KiWIS answers live in `src/hydrometry/fixtures/` (see its README) and are shared by unit and e2e tests (`kiwisFixtures(...)` in `e2e/support/offline.ts`). The pure flow rules are in `src/core/flow.ts`.
- `src/geocoding/` (ADR 0027, #136): the Nominatim client, the only module that talks to Nominatim and the only one that sends access point positions anywhere. `nominatim.ts` implements the core's `DefaultNameSource` (reverse geocoding to "road, place" in local names; at most one request a second). `src/ui/defaultNames.ts` works through the points waiting for a default name whenever the app is online. Recorded answers live in `src/geocoding/fixtures/` (see its README); e2e tests replay them with `nominatimFixture(...)` in `e2e/support/offline.ts`.
- `src/pwa/` and `public/sw.js`: PWA registration and a hand-written service worker (ADR 0023). It caches the same-origin app shell only, never map tiles, BRouter, KiWIS or Nominatim.
- `src/ui/phone/` (+ `src/map/PhoneMap.tsx`): the phone planner (ADR 0026), used at width ≤ 640 px, or height ≤ 640 px on a touch device: a full-screen map with floating buttons and a bottom sheet (a side panel when sideways) with the Legs, Days and Access points tabs; the trip's name and start date (Trip details…, #154) and the settings (#151) are dialogs from its menu. It runs the desktop's `usePlanner` and adds no planning rules.
- `src/ui/phone/PhoneAccessPoints.tsx` + `PhoneAccessPointDialog.tsx` (#63, ADR 0023): your access points on the phone. Mark one with the floating button at your GPS position (or by tapping the map when there is no fix), which opens its details dialog. While the trip has a route the tab lists the points on the route first in route order, then the rest nearest to you (#156; the split is `accessPointsByRoute` in `src/core/onRoute.ts`); each row has edit and delete buttons, and the marker drags to correct it. The dialog keeps a draft; Save stores it on the device at once by `useAccessPoints`, with or without signal.
- `src/ui/strings.ts`: all user-facing text (ADR 0013).

## Conventions
- Domain terms are defined in `GLOSSARY.md`; use them consistently in code and docs.
- Significant decisions get an ADR in `docs/adr/NNNN-title.md`.
- Work is tracked as GitHub issues with triage labels (see Agent skills below).
- Never push to `main` directly; open a PR.

## Agent lessons
Project-specific rules for agents working in this repo (learned in past PRs).
- **Ports:** each agent gets its own port. Set `E2E_PORT` for `npm run e2e` (e.g. 3101, 3102, …) and pass `-- --port <n>` to `npm run dev`, so parallel worktrees don't test each other's builds.
- **Dates:** no time-zone drift: a date picked in Europe/Brussels must not move a day.
- **No live services in tests (ADR 0019):** use `serveOffline(page)` and recorded fixtures, and prove it, e.g. by blocking `fetch` or the network and re-running.
- **New runtime dependency:** update the allowlist in `src/testing/dependencyBoundary.ts` deliberately.
- **Edge cases that bit us:** trip names with `/ : & <` or control characters (GPX/XML must stay well-formed, inner names must match file names; #24, #45); longitudes rounding to 180 (GPX needs < 180; #24); unlisted Walloon water must read "not allowed", not "unknown" (#75).

## Agent skills

### Issue tracker

GitHub Issues for this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
