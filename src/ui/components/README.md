# UI components

Thin wrappers around Base UI (ADR 0020), each with its own stylesheet. Screens import these, never `@base-ui/react`; lint enforces this. Wrappers take their text as props from the screens. Design tokens (colours, spacing) are CSS variables at the top of `src/app/globals.css`.

- `ConfirmDialog`: Alert Dialog.
- `ToggleGroup`, `NumberField`, `Button`.
- `Menu`: actions, a choice of one among several, and on/off toggles.
- `TextEntryDialog`: Dialog with one text field. Opens with its field focused.
- `FormDialog`: Dialog around a small form. Opens without the keyboard on a touch screen.
- `InfoDialog`: Dialog that only shows information, with Close.
- `SidePanel`: the sheet's sideways counterpart. Its left edge is a splitter that resizes it by drag or arrow keys, within the limits in `sidePanelWidth.ts` (ADR 0034, #188).
- `SearchBox` (#173): Autocomplete with its own filtering off: a search field whose dropdown shows the answer to a submitted search, never suggestions as you type. `inline` puts the answer under the field instead of a popup (#174).

## Dialogs

- The four dialogs share `Dialog.css`: flat panel with the sheet's corners, a divider under the title, 44 px buttons and fields; the main action is `button-primary`.
- Every dialog sits in the visible area above an on-screen keyboard: `useVisibleArea` in `visibleArea.ts` follows `window.visualViewport` (#163).
- In e2e tests, answer confirmations with `e2e/support/confirmDialog.ts`.
