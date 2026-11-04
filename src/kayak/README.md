# Kayak (PKAYAK)

The `PKAYAK` client (ADR 0035, #210), the only module of the app that talks to the SPW's kayak map service. The manual `scripts/prepare-spw-data.mts` calls it too, offline from the app.

## Official status and incidents

- `pkayak.ts` implements the core's `OfficialStatusSource`. A refresh is at most two requests: layer 5 (no geometry, four fields) and layer 0 (incidents, #216). Each is made only when asked for, they fail apart, each has a 15-second timeout, and answers and failures are cached for 15 minutes.
- The REST API at `kayak.spw.wallonie.be` isn't used.
- The page shares one source through `src/ui/useOfficialStatus.ts`: the status is asked for only while something is shown for today or later, incidents also for a paddle leg on any date or none.
- The code mapping is in `src/core/officialStatus.ts`. `evaluateAgw` in `src/core/access.ts` lets a reading replace the flow check on today's date, and a calendar closure still applies. The reason carries the verdict as `official`, and `reasonText` in `src/ui/reasonText.ts` words it with `strings.official`.
- Incidents are in `src/core/incident.ts` and never reach `accessAt`, so they can't change an access state. `src/map/IncidentLayer.tsx` draws them at any zoom, and `officialNotChecked(status, incidents)` adds them to the note when they fail.
- While the access layer is on, `MapNotCheckedNote` (`checksFailed` in the core) says so without a tap, under the access chip, and only its link takes taps.

## Live feeds

Live answers (official status, incidents, KiWIS flows) go through `createLiveFeed` in `src/ui/liveFeed.ts`: one answer per page for the map and the trip, asked again 15 minutes after each answer while wanted and never while nothing wants it, so a failure heals. The adapters' caches keep the cap.

The built-in chunks in `useAccessRules.ts` use it too, retrying a failed load every minute (`keepOnSuccess` never keeps a failed import). With no rules a status reads unknown, not checking.

## Tests

- `liveCheck.ts` is the manual contract check (#218), run by `npm run check:kayak`.
- Recorded answers live in `fixtures/` (see its README) and are shared by unit and e2e tests: `serveOffline(page, { kayak: kayakFixture(...), incidents: kayakFixture(...) })`. Without `kayak` it answers 503, so today's computed status stands; without `incidents` there are none.
