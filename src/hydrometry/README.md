# Hydrometry

The KiWIS client (ADR 0024, #61), the only module that talks to the SPW hydrometry service.

- `kiwis.ts` implements the core's `FlowSource`: two batched requests per refresh, each with a 15-second timeout; answers and failures cached for 15 minutes.
- `liveCheck.ts` is the manual contract check (#64), run by `npm run check:kiwis`.
- The pure flow rules are in `src/core/flow.ts`.
- The page asks for flows through `createLiveFeed` (see `src/kayak/README.md`).

## Tests

Recorded KiWIS answers live in `fixtures/` (see its README) and are shared by unit and e2e tests (`kiwisFixtures(...)` in `e2e/support/offline.ts`).
