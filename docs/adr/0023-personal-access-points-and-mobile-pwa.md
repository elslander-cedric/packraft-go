# 23. Personal access points, marked on the go in a PWA

Date: 2026-10-12

## Status
Accepted. Makes one exception to ADR 0001 (planning at home) and ADR 0005 (desktop-first).

## Context
There's no open dataset of access points in Belgium. The Walloon aire dataset is restricted, OSM coverage is sparse, and Flemish route put-ins aren't openly licensed (`docs/research/data-sources.md`). The person who knows where you can actually get on the water is the paddler standing on the bank, often without signal.

## Decision
- **Access points are a personal collection**, separate from trips and usable by every trip. They're stored in the browser, with their own export and import file. Sharing means sending that file. There's no server and no accounts (ADRs 0002, 0011 and 0012 unchanged).
- **Fields:** position (GPS or dragged), use (put-in, take-out or both), kind (official aire, slipway, jetty or informal bank), a short note, and "checked on site" with a date. No photos.
- **Phone scope:** the map, your GPS position, "mark access point here", your access points, and a read-only view of trips. Planning stays desktop.
- **Marking works offline.** Points are saved on the device. Offline map tiles are out of scope.
- **Delivered as a PWA** (installable web app, offline-capable), not a native app.
- **In planning:** a mode change offers to snap to one of your access points within about 200 m. In Wallonia, a put-in or take-out that isn't at an access point of kind "official aire" gets a warning (AGW art. 5). It's never blocked.
- **Official aire locations come only from your own marks.** The SPW's agreement doesn't cover the restricted aire dataset.

## Consequences
- Phone layout and touch input are needed for the marking flow only.
- GPS needs the browser's location permission and HTTPS (Vercel provides it). Accuracy in valleys can be poor, so the position can be adjusted by dragging.
- An offline-capable PWA needs a service worker and an app manifest.
- Shared or community access points are a candidate for v3.
