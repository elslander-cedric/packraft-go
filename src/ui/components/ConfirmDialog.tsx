import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { RefObject } from "react";
import { Button } from "./Button";
import "./ConfirmDialog.css";

type FocusTarget = RefObject<HTMLElement | null>;

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Cancel button, Escape, or any other way of closing without confirming. */
  onCancel: () => void;
  /** Where focus goes when the dialog closes: the button that led to the question. */
  returnFocusTo?: FocusTarget;
};

/**
 * An in-page yes/no question (Base UI Alert Dialog, ADR 0020), used instead
 * of the browser's `window.confirm`. Focus starts on the first button, Cancel,
 * the safe answer.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  returnFocusTo,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="confirm-dialog-backdrop" />
        <AlertDialog.Popup className="confirm-dialog" finalFocus={returnFocusTo ?? true}>
          <AlertDialog.Title className="confirm-dialog-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="confirm-dialog-message">{message}</AlertDialog.Description>
          <div className="confirm-dialog-actions">
            <AlertDialog.Close className="button">{cancelLabel}</AlertDialog.Close>
            <Button className="button-danger" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
