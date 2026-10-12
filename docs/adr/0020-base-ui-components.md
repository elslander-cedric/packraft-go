# 20. Base UI for interface components

Date: 2026-10-12

## Status
Accepted

## Context
v1's controls are hand-built: plain buttons, a hand-made hike/paddle toggle, plain number inputs, and the browser's native `window.confirm` for "New trip" and "Open file". These work, but accessibility (keyboard use, focus handling, screen-reader labels) is ad hoc, and native confirm dialogs can't be styled.

Base UI (`@base-ui/react`, MIT, free) provides unstyled, accessible React components: dialogs, toggle groups, number fields, toolbars, tooltips. Being unstyled, it leaves the look entirely to us. Its old package name `@base-ui-components/react` is deprecated; `@mui/base` is a different, deprecated library.

## Decision
Use `@base-ui/react` for interactive UI components (outside the map):
- Confirmations ("New trip", "Open file" replacing a trip) use a Base UI Alert Dialog instead of `window.confirm`.
- The hike/paddle switch uses a Toggle Group.
- Settings (pace factor, paddling speed) use Number Fields.
- The trip toolbar uses Toolbar and Button. Disabled buttons get a Tooltip explaining why.

App code doesn't import Base UI directly. Thin wrappers in `src/ui/components/` hold our styling and strings, so Base UI can be swapped later without touching screens.

Styling stays plain CSS. Shared design tokens (colours, spacing, hike/paddle colours) are CSS variables in the global stylesheet, and each component has its own stylesheet. No Tailwind or CSS-in-JS.

The Leaflet map and its markers aren't affected.

## Consequences
- Pin an exact version of `@base-ui/react` and upgrade deliberately.
- e2e tests that handled native `confirm` dialogs must interact with in-page dialogs instead.
- Strings stay in the strings module (ADR 0013).
- Base UI components are React client components, which fits the client-only planner (ADR 0015).
