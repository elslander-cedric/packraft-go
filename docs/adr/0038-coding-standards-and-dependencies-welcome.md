# 38. Coding standards, and dependencies are welcome

Date: 2026-11-12

## Status
Accepted. Amends ADR 0020 (the runtime dependency allowlist is gone; the Base UI wrapper rule stays).

## Context
The app was built with a rule that runtime dependencies stay few: an allowlist of seven packages, checked by a test, with every addition treated as a decision. The intent was a small, auditable bundle.

In practice the rule pushed logic into hand-written code: shape checks on every JSON response and stored format, geometry, and even our own source-code checkers built on the TypeScript compiler. That code is ours to read, test and maintain, and it is where most of the complexity sits. It also had no written style rules, so `if` without braces, one-letter names and very long functions spread unchecked.

## Decision
- **Less is better, and less complexity is better.** `CODING_STANDARDS.md` at the repo root is the standard. The linter enforces what it can.
- **The "few dependencies" rule is dropped.** There is no allowlist. A well-known, maintained, free package is preferred over hand-written logic. The first uses: `zod` for data from outside, `@turf` for geometry.
- **Boundaries are lint rules, not tests.** The core's purity, the Base UI and Font Awesome wrappers, no hard-coded text in JSX and no native confirm are checked by ESLint (`eslint.config.mjs`). The hand-written checkers and their tests are removed.
- **Prettier formats the code.**

## Consequences
- Adding a dependency no longer needs an ADR. It still has to be free (ADR 0012), and Base UI stays pinned to an exact version (ADR 0020).
- The bundle will grow somewhat. We accept that for less code of our own.
- The complexity and function-length rules start as warnings, because existing code breaks them. They become errors once it is brought under them.
- A boundary violation now fails `npm run lint` instead of `npm test`. CI runs both.
