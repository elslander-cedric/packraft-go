# 35. SPW official data: live status, built-in aires, stretch lines and obstacles

Date: 2026-11-02

## Status
Accepted. Supersedes one line of ADR 0023 ("Official aire locations come only from your own marks"). Amends ADR 0024: KiWIS is no longer the only live source, and the Wanlin gauge note changes to Hérock (SPW practice). Widens the SPW agreement recorded in ADR 0022.

## Context
The app works out access status from the AGW calendar and flows. The SPW's status also carries decisions the app can't see. On 2026-11-01 the SPW showed 17 of 21 stretches closed: all 11 Annex 1.C stretches by ministerial order (AGW art. 8) and five more by hand. In a drought the app can't close a 1.C stretch at all, because those stretches have no minimum flow. So it can say "open" on a river the SPW has closed.

Every Walloon put-in and take-out also warns "No official aire" unless you marked the aire yourself, because ADR 0023 ruled out the SPW's aires.

The SPW's kayak site reads its data from a public ArcGIS map service, `PKAYAK` (`geoservices3.wallonie.be`), which needs no key and allows any origin. The site's own REST API has no CORS. The blocker was permission, not technology: the SPW's terms forbid redistributing its data or publishing it through a web service without prior written agreement, and the agreement in ADR 0022 covered only flows and a computed status. Full comparison: `docs/research/kayak-spw-access-points.md`.

## Decision
- **Permission.** The SPW gave permission on 2026-11-02, by email from Alain, taken to be writing on the SPW's behalf. It covers reading the SPW's live stretch status from the browser, and shipping its aires and stretch lines as a built-in snapshot. It sets no conditions for use. The email is not in the repo; this ADR is the project's record of it.
- **Obstacles and incidents aren't named in the permission as recorded above.** They come from the same service and the same spec (#203), and are decided below on that basis. Whether the permission reaches them is unconfirmed.
- **Official status, live.** The browser reads `PKAYAK` layer 5 directly (no geometry, only the fields needed, about 1.3 KB), with a timeout. Answers and failures are cached for 15 minutes, with one shared source per page, asked for only while something is shown for today or a future date. One module talks to this service. The REST API is not used, as a proxy would break ADR 0011. The service worker doesn't cache it.
- **Official status wins for today.** On a stretch with an official stretch, the SPW's code replaces the flow check; a calendar closure (fishing day, hours, season) still applies, and the more restrictive answer wins. Codes 1, 2 and 5 read as open (2 with a note; 1 is the "kayaks only" of ADR 0024's packraft reading). Codes 0, 3 and 4 read as closed today, with the SPW's reason. Any other code reads as unknown. Flow figures stay on show.
- **Fallback.** With no reading for today, the computed status stands, with a plain note and link saying official closures weren't checked. The same note shows on a future date, where the "officially closed today" note can't be known; a past date has neither. Official status and flows fail apart. The KiWIS client gets a timeout too.
- **Future dates stay rule-based.** A stretch closed today also says "officially closed today" with the reason, because an order "until further notice" may still apply on the trip's date.
- **Official aires are built in.** A manual script prepares them offline from layer 3; the result is reviewed as a diff and committed, with its source and date. They are never queried at runtime, which keeps ADR 0024's rule for built-in data, and they work offline. An official aire is its own read-only type, not an access point, and is never written to access point storage, trips or settings. The aire warning and snap offers count them as well as your own marks. A built-in aire honours its use (a put-in at a take-out-only aire still warns); your marks keep today's behaviour.
- **Official stretches are built in.** A second snapshot, from layer 5, holds each official stretch's id and name. The app's stretch geometry stays derived from OpenStreetMap; the SPW's lines are used by the preparation script and shipped only if the build needs them. Each AGW record maps to at most one official stretch, split at the boundary where one record spans two. A record with no official stretch says no official status exists for it.
- **Obstacles are built in.** A third snapshot, from layer 1: dams, impassable points, rocks, drossages and low bridges. A paddle leg that passes one gets a warning, as for a lock. The wording is ours and stays cautious, as the SPW publishes only a position and a code. Obstacles don't depend on date or flow.
- **Incidents are live, not built in.** They come from layer 0 as a second small request in the same refresh, so a refresh is at most two requests to `PKAYAK`. A paddle leg that passes one gets a warning with the SPW's text. An incident applies unless its expiry is before the date. It never changes an access state, even when its text says the river is closed.
- **Warnings never block** (ADR 0022).
- **Gauges.** Lesse from Han to Houyet (1C2b) uses L6610 Hérock, marked as SPW practice. The other gauge choices stay as they are: Semois follows the SPW through official status, with Annex 2's gauge in the fallback, and Salm and Our wait until the KiWIS check shows L6070 and L6330 have the needed series.
- **Credit:** "Sources des données : Service public de Wallonie", as for the app's other SPW data. This is the app's own practice (ADR 0022), not a condition of the permission.
- **Manual check:** `npm run check:kayak`, like `check:kiwis`, compares the live fields and codes with the fixtures. It's never part of `npm test`, `npm run e2e` or CI.

## Consequences
- The app has two live sources, KiWIS and `PKAYAK`. Both are free (ADR 0012) and neither needs a backend (ADR 0011). Tests use recorded answers (ADR 0019).
- `PKAYAK` is public but undocumented and uncatalogued, and the SPW's service terms allow changes without notice. The fallback and the manual check exist for that.
- The snapshots are kept current by hand. 86 of the 92 aires were last changed in 2016, so the app shows each aire's last-changed date, and the snapshot can list an aire that has gone.
- The SPW's text can be old too. Reasons are shown only for closed stretches, and an incident's date is always shown.
- No obstacle list is complete, and official status is not legal advice: "Indicative only; you're responsible for checking local rules" stays.
- Plans d'eau (layer 2), aire photos, flows from the REST API, and a hand-kept closures list stay out.
