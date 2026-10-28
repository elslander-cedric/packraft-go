"use client";

// PROTOTYPE (place search UI, #169): throwaway, never merged.
// Three variants of where place search lives, on the real planner, switched with ?variant=A|B|C:
//   A "Search bar on the map": desktop, a bar over the map's top left; phone, a pill between the
//     menu and the right-hand buttons that widens into a field with the results under it.
//   B "Search in the sidebar / a dialog": desktop, a section at the top of the sidebar; phone, a
//     magnifier button that opens a dialog with the field and the results.
//   C "Search in the sheet / a map control": desktop, a magnifier control under the zoom buttons
//     that opens a small panel; phone, a field in the sheet's peek that raises the sheet for results.
//     Clearing is from the marker's popup.
// Searches run against a stub (stub.ts): no request ever leaves the browser.

import { useRef, useState } from "react";
import { Button } from "@/ui/components/Button";
import { FormDialog } from "@/ui/components/FormDialog";
import { Icon } from "@/ui/icons/Icon";
import { icons } from "@/ui/icons/icons";
import type { PrototypeResult } from "./stub";
import type { PlaceSearch } from "./usePlaceSearchPrototype";
import "./placeSearch.css";

export type Variant = "A" | "B" | "C";
export const variants: readonly Variant[] = ["A", "B", "C"];
export const variantNames: Record<Variant, string> = {
  A: "Search bar on the map",
  B: "Sidebar section / dialog",
  C: "Map control / sheet field",
};

// All the prototype's text in one place (strings.ts in the real thing).
const text = {
  placeholder: "Search a place or coordinates",
  label: "Search a place",
  search: "Search",
  clear: "Clear search result",
  close: "Close",
  searching: "Searching…",
  offline: "No connection. Place search needs the internet; coordinates (50.27, 5.44) work offline.",
  failed: "Search failed.",
  retry: "Retry",
  nothing: (q: string) => `Nothing found for “${q}”. Try a town, a road or coordinates like 50.27, 5.44.`,
  showing: "Showing",
  resultsLabel: "Search results",
};

/** The result list and the messages: shared by the variants, which place it differently. */
function SearchOutcome({ search, onPicked }: { search: PlaceSearch; onPicked?: () => void }) {
  const { status } = search;
  switch (status.kind) {
    case "idle":
      return null;
    case "searching":
      return (
        <p role="status" className="ps-message">
          {text.searching}
        </p>
      );
    case "offline":
    case "failed":
      return (
        <div role="alert" className="ps-message ps-message-alert">
          <span>{status.kind === "offline" ? text.offline : text.failed}</span>
          <Button onClick={search.retry}>{text.retry}</Button>
        </div>
      );
    case "nothing":
      return (
        <p role="status" className="ps-message">
          {text.nothing(search.query.trim())}
        </p>
      );
    case "bad-coordinates":
      return (
        <p role="alert" className="ps-message ps-message-alert">
          {status.message}
        </p>
      );
    case "results":
      return (
        <ul className="ps-results" aria-label={text.resultsLabel}>
          {status.results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="ps-result"
                onClick={() => {
                  search.pick(r);
                  onPicked?.();
                }}
              >
                <ResultText result={r} />
              </button>
            </li>
          ))}
        </ul>
      );
  }
}

function ResultText({ result }: { result: PrototypeResult }) {
  return (
    <>
      <span className="ps-result-label">
        {result.label} <span className="ps-result-kind">{result.kind}</span>
      </span>
      {result.detail && <span className="ps-result-detail">{result.detail}</span>}
    </>
  );
}

/** A search field in a form: Enter or the button searches. */
function SearchField({
  search,
  autoFocus,
  onFocus,
  showClear,
  inputRef,
}: {
  search: PlaceSearch;
  autoFocus?: boolean;
  onFocus?: () => void;
  showClear?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form
      className="ps-field"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        search.submit();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        enterKeyHint="search"
        aria-label={text.label}
        placeholder={text.placeholder}
        value={search.query}
        onChange={(event) => search.setQuery(event.target.value)}
        onFocus={onFocus}
        autoFocus={autoFocus}
      />
      {showClear && (search.query || search.shown) && (
        <Button className="ps-icon-button" aria-label={text.clear} onClick={search.clear}>
          <Icon icon={icons.clearSearch} />
        </Button>
      )}
      <Button type="submit" className="ps-icon-button" aria-label={text.search}>
        <Icon icon={icons.search} />
      </Button>
    </form>
  );
}

/* ---------- Desktop ---------- */

/** Desktop A: a bar over the map's top left; results drop down under it. */
export function DesktopMapBar({ search }: { search: PlaceSearch }) {
  return (
    <div className="ps-desktop-bar">
      <SearchField search={search} showClear />
      <SearchOutcome search={search} />
    </div>
  );
}

/** Desktop B: a section at the top of the sidebar, results inline, the shown result as a line. */
export function DesktopSidebarSection({ search }: { search: PlaceSearch }) {
  return (
    <section className="ps-sidebar" aria-label={text.label}>
      <SearchField search={search} />
      <SearchOutcome search={search} />
      {search.shown && search.status.kind === "idle" && (
        <p className="ps-shown">
          <span role="status">
            {text.showing} <strong>{search.shown.label}</strong>
          </span>
          <Button onClick={search.clear}>{text.clear}</Button>
        </p>
      )}
    </section>
  );
}

/** Desktop C: a magnifier control under the zoom buttons; opens a small panel, closes on pick. */
export function DesktopMapControl({ search }: { search: PlaceSearch }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ps-desktop-control">
      <Button
        className="ps-control-button"
        aria-label={text.label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={icons.search} />
      </Button>
      {open && (
        <div className="ps-control-panel">
          <SearchField search={search} autoFocus />
          <SearchOutcome search={search} onPicked={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* ---------- Phone ---------- */

/**
 * Phone A: a pill between the menu and the right-hand buttons. Tapping it widens it over
 * them into a field, results under it; picking one narrows it back, showing the result's name.
 */
export function PhoneSearchPill({ search }: { search: PlaceSearch }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!editing) {
    return (
      <div className="ps-phone-pill">
        <Button
          className="ps-pill-button"
          onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          <Icon icon={icons.search} />
          <span className={search.shown ? "ps-pill-text" : "ps-pill-text ps-pill-placeholder"}>
            {search.shown?.label ?? text.placeholder}
          </span>
        </Button>
        {search.shown && (
          <Button className="ps-icon-button" aria-label={text.clear} onClick={search.clear}>
            <Icon icon={icons.clearSearch} />
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="ps-phone-pill ps-phone-pill-open">
      <div className="ps-pill-row">
        <Button
          className="ps-icon-button"
          aria-label={text.close}
          onClick={() => {
            setEditing(false);
            search.dismiss();
          }}
        >
          <Icon icon={icons.expandPanel} />
        </Button>
        <SearchField search={search} showClear inputRef={input} />
      </div>
      <SearchOutcome search={search} onPicked={() => setEditing(false)} />
    </div>
  );
}

/** Phone B, the button: a magnifier with the right-hand buttons. */
export function PhoneSearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button className="phone-fab" aria-label={text.label} onClick={onOpen}>
      <Icon icon={icons.search} />
    </Button>
  );
}

/** Phone B, the dialog: the field and the results, above the keyboard (#163); picking closes it. */
export function PhoneSearchDialog({ search, open, onClose }: { search: PlaceSearch; open: boolean; onClose: () => void }) {
  return (
    <FormDialog
      open={open}
      title={text.label}
      confirmLabel={text.search}
      cancelLabel={text.close}
      onConfirm={search.submit}
      onCancel={() => {
        search.dismiss();
        onClose();
      }}
    >
      <input
        type="text"
        enterKeyHint="search"
        className="ps-dialog-input"
        aria-label={text.label}
        placeholder={text.placeholder}
        value={search.query}
        onChange={(event) => search.setQuery(event.target.value)}
      />
      <div className="ps-dialog-outcome">
        <SearchOutcome search={search} onPicked={onClose} />
      </div>
    </FormDialog>
  );
}

/** Phone B, the shown result: a state line bottom left, like "Placing an access point · Cancel". */
export function PhoneShownLine({ search }: { search: PlaceSearch }) {
  if (!search.shown) return null;
  return (
    <div className="phone-message phone-state-line">
      <span role="status">{`${search.shown.label} ·`}</span>
      <Button className="phone-state-action" onClick={search.clear}>
        Clear
      </Button>
    </div>
  );
}

/** Phone C: a field in the sheet's peek. Focusing it raises the sheet; its body shows the results. */
export function PhoneSheetField({ search, onFocus }: { search: PlaceSearch; onFocus: () => void }) {
  return (
    <div className="ps-sheet-field">
      <SearchField search={search} showClear onFocus={onFocus} />
    </div>
  );
}

export function PhoneSheetOutcome({ search, onPicked }: { search: PlaceSearch; onPicked: () => void }) {
  return (
    <div className="ps-sheet-outcome">
      <SearchOutcome search={search} onPicked={onPicked} />
    </div>
  );
}
