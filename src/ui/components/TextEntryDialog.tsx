import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState, type RefObject } from "react";
import { Button } from "./Button";
import "./Dialog.css";
import "./TextEntryDialog.css";
import { useVisibleArea } from "./visibleArea";

export type TextEntryDialogProps = {
  open: boolean;
  title: string;
  /** The text field's label. */
  label: string;
  /** The text the field starts with each time the dialog opens. */
  initialValue: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Confirm button or Enter, with the field's text. */
  onConfirm: (value: string) => void;
  /** Cancel button, Escape, or any other way of closing without confirming. */
  onCancel: () => void;
  /** Where focus goes when the dialog closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

/**
 * An in-page dialog that asks for one line of text (Base UI Dialog, ADR 0020).
 * Focus starts in the field with its text selected, so on a phone the keyboard
 * opens with it and the dialog sits above the keyboard (#163); Enter confirms.
 */
export function TextEntryDialog({
  open,
  title,
  label,
  initialValue,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  returnFocusTo,
}: TextEntryDialogProps) {
  const [value, setValue] = useState(initialValue);
  // Each opening starts from `initialValue` again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialValue);
  }

  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const area = useVisibleArea(open, popup);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup
          ref={popup}
          className="dialog text-entry-dialog"
          style={area}
          initialFocus={field}
          finalFocus={returnFocusTo ?? true}
        >
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm(value);
            }}
          >
            <label className="text-entry-field">
              <span>{label}</span>
              <input
                ref={field}
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close className="button">{cancelLabel}</Dialog.Close>
              <Button type="submit" className="button-primary">
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
