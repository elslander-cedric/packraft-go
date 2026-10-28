import { Autocomplete } from "@base-ui/react/autocomplete";
import { useRef, type ReactNode } from "react";
import { Button } from "./Button";
import "./SearchBox.css";

/** A line in the dropdown instead of results: a status, or an alert with an optional action. */
export type SearchBoxMessage = {
  text: string;
  /** "status" is announced politely (searching, nothing found); "alert" at once (failed, offline). */
  role: "status" | "alert";
  action?: { label: string; onAction: () => void };
};

export type SearchBoxProps<Item> = {
  /** The field's accessible name. */
  label: string;
  placeholder: string;
  /** The magnifier's and ×'s accessible names, and their icons. */
  searchLabel: string;
  searchIcon: ReactNode;
  clearLabel: string;
  clearIcon: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  /** Enter (with no result highlighted) or the magnifier. */
  onSubmit: () => void;
  /** ×, shown while there is text. */
  onClear: () => void;
  /** The results to pick from; the dropdown never filters them. */
  items: readonly Item[];
  itemKey: (item: Item, index: number) => string;
  renderItem: (item: Item) => ReactNode;
  /** A click or Enter on a result. */
  onPick: (item: Item) => void;
  itemsLabel: string;
  /** Shown in the dropdown instead of results. */
  message: SearchBoxMessage | null;
  /** Escape or a click elsewhere: close the dropdown. */
  onDismiss: () => void;
  className?: string;
};

/**
 * A search field whose dropdown shows the answer to a submitted search (Base
 * UI Autocomplete, ADR 0020). It never suggests as you type: its own filtering
 * is off, and it is open only while there are results or a message, which the
 * screen decides. Enter searches unless a result is highlighted, which it picks.
 */
export function SearchBox<Item>({
  label,
  placeholder,
  searchLabel,
  searchIcon,
  clearLabel,
  clearIcon,
  value,
  onValueChange,
  onSubmit,
  onClear,
  items,
  itemKey,
  renderItem,
  onPick,
  itemsLabel,
  message,
  onDismiss,
  className,
}: SearchBoxProps<Item>) {
  const open = items.length > 0 || message !== null;
  const highlighted = useRef<Item | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  return (
    <Autocomplete.Root
      items={items as Item[]}
      filter={null}
      value={value}
      onValueChange={(next, details) => {
        // Only typing changes the text; picking, Escape and the like are ours to handle.
        if (details.reason === "input-change" || details.reason === "input-clear") onValueChange(next);
      }}
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
    >
      <form
        role="search"
        className={className ? `search-box ${className}` : "search-box"}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Autocomplete.InputGroup className="search-box-group">
          <Autocomplete.Input
            ref={input}
            className="search-box-input"
            aria-label={label}
            placeholder={placeholder}
            enterKeyHint="search"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !(open && highlighted.current !== undefined)) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          {value !== "" && (
            <button
              type="button"
              className="search-box-icon-button"
              aria-label={clearLabel}
              onClick={() => {
                onClear();
                input.current?.focus();
              }}
            >
              {clearIcon}
            </button>
          )}
          <button type="submit" className="search-box-icon-button" aria-label={searchLabel}>
            {searchIcon}
          </button>
        </Autocomplete.InputGroup>
      </form>
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="search-box-positioner" sideOffset={4} align="start">
          <Autocomplete.Popup className="search-box-popup">
            {message && (
              <div role={message.role} className={`search-box-message search-box-message-${message.role}`}>
                <span>{message.text}</span>
                {message.action && <Button onClick={message.action.onAction}>{message.action.label}</Button>}
              </div>
            )}
            {items.length > 0 && (
              <Autocomplete.List className="search-box-list" aria-label={itemsLabel}>
                {items.map((item, index) => (
                  <Autocomplete.Item
                    key={itemKey(item, index)}
                    value={item}
                    index={index}
                    className="search-box-item"
                    onClick={() => onPick(item)}
                  >
                    {renderItem(item)}
                  </Autocomplete.Item>
                ))}
              </Autocomplete.List>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
