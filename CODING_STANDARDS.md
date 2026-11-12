# Coding standards

The goal: **less is better, and less complexity is better.** Code is read far more often than it is written, so write it for the reader who has never seen it.

`npm run lint` enforces the rules marked *(lint)*. `npm run format` applies the formatting.

## Less code

- Before writing logic, look for a well-known, maintained package that already does it. Use it. Hand-written validation, geometry, parsing and date arithmetic are the usual candidates.
- Dependencies are welcome when they remove code we would otherwise maintain (ADR 0038). Prefer packages that are widely used, typed, free (ADR 0012) and small enough for a browser app.
- Don't add options, parameters or abstractions for a case that doesn't exist yet.
- Delete code that nothing uses. Git keeps the history.

## Readable code

- **Braces on every block.** `if`, `else`, `for` and `while` always get `{ }`, also for one statement. *(lint: `curly`)*
- **Names say what the thing is.** No one-letter names. The exceptions are `i` for a loop index, `x` and `y` for coordinates, and `_` for an unused value. Write `point`, not `p`; `leg`, not `l`. *(lint: `id-length`)*
- **No nested ternaries.** One `? :` is fine. For more, use `if` or a lookup object. *(lint: `no-nested-ternary`)*
- **Small functions.** A function does one thing. Cyclomatic complexity stays at 10 or under and a function at 60 lines or under; split it before it grows past that. *(lint: `complexity`, `max-lines-per-function`, warnings until the existing code is brought under them)*
- **One concern per file.** When a file mixes concerns, split it by concern, not by size.
- Prefer early returns to nested conditions.
- Prefer plain data and plain functions to classes and clever types.

## Comments

- A comment says **why**, or what can't be seen from the code. Don't restate the code.
- Describe the code as it is now. No history ("updated for…", "used to…"); that is what commit messages are for.
- No issue numbers in comments. Reference an ADR when a design decision explains the code.
- Exported functions and types get a short `/** … */` when their name alone doesn't say enough.

## Data from outside

- Anything that comes from outside the program is validated with a `zod` schema where it enters: service responses, stored data, opened files. No hand-written `typeof` chains.
- Derive the TypeScript type from the schema (`z.infer`), so the two can't drift apart.

## Boundaries *(lint: `no-restricted-imports` and friends)*

- `src/core/` imports only other core modules: no React, browser globals or network.
- Screens use the wrappers in `src/ui/components/`, never `@base-ui/react` directly (ADR 0020).
- Icons come from `src/ui/icons/`, the only place that imports Font Awesome (ADR 0028).
- User-facing text lives in `src/ui/strings.ts`, never in JSX (ADR 0013).
- Test helpers (`src/testing/`, `src/core/testing/`) and offline data preparation never ship in the app.
- Confirmations are in-page dialogs, never `window.confirm`.

## Tests

- Name a test file after what it tests (`sections.test.ts`), never after an issue.
- A test title states the behaviour in plain words.
- No live services in tests (ADR 0019).
- Test the behaviour once, at the lowest level that can show it. Don't repeat a unit test as an end-to-end test.

## Formatting

Prettier decides. Don't format by hand and don't argue with it.
