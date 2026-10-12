# packraft-go

Plan packrafting trips in Belgium: draw a route on a topographic map, mix hike legs and paddle legs, and see distance, climb, drop and estimated time for each leg, each day and the whole trip.

**Live:** https://packraft-go.vercel.app/

> Status: v1 complete. Personal use, desktop browser.

## What it does
- Click the map to add points. Hike legs snap to trails, paddle legs snap to rivers (via [BRouter](https://brouter.de)).
- Put-ins and take-outs are marked where you switch between hiking and paddling. Weirs are handled as short hike legs (portages).
- Drag, delete and undo points. Mark camps to split the trip into days, each with its own totals.
- Time estimates: Naismith's rule for hiking, your own speed for paddling (adjustable in settings).
- Trips autosave in the browser. You can also save them to and open them from a file (`.packraft.json`).
- Export to GPX (one track per leg, camps as waypoints) for your GPS or outdoor app.

**Always check local river navigation rules.** packraft-go doesn't know whether a river may be paddled.

## Run locally
Requires Node 22.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Tests: `npm test` (unit) and `npm run e2e` (end-to-end). See [`CLAUDE.md`](CLAUDE.md) for all commands.

## Built with
Next.js + TypeScript, Leaflet, OpenTopoMap tiles, BRouter. Hosted on Vercel. Map data © OpenStreetMap contributors.

## Docs
- [`GLOSSARY.md`](GLOSSARY.md): shared vocabulary for the domain
- [`docs/adr/`](docs/adr/): architecture decision records (why we chose what we chose)
- [`CLAUDE.md`](CLAUDE.md): instructions for Claude agents working in this repo
