import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { Button } from "./Button";
import "./Dialog.css";
import "./FormDialog.css";

export type FormDialogProps = {
  open: boolean;
  title: string;
  /** The form's fields. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Disables the confirm button (and Enter) while the fields can't be used. */
  confirmDisabled?: boolean;
  /** Confirm button or Enter in a field. */
  onConfirm: () => void;
  /** Cancel button, Escape, or any other way of closing without confirming. */
  onCancel: () => void;
  /** Where focus goes when the dialog closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

/**
 * An in-page dialog around a small form (Base UI Dialog, ADR 0020). The
 * screen keeps the fields' values; Enter in a field confirms.
 */
export function FormDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  returnFocusTo,
}: FormDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog form-dialog" finalFocus={returnFocusTo ?? true}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmDisabled) onConfirm();
            }}
          >
            <div className="form-dialog-fields">{children}</div>
            <div className="dialog-actions">
              <Dialog.Close className="button">{cancelLabel}</Dialog.Close>
              <Button type="submit" className="button-primary" disabled={confirmDisabled}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
