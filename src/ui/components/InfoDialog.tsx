import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import "./InfoDialog.css";

export type InfoDialogProps = {
  open: boolean;
  title: string;
  /** What the dialog shows; it scrolls when it is taller than the dialog. */
  children: ReactNode;
  closeLabel: string;
  /** Close button, Escape or a tap on the backdrop. */
  onClose: () => void;
};

/**
 * An in-page dialog that only shows information, with a Close button (Base UI
 * Dialog, ADR 0020). Focus goes back to whatever opened it.
 */
export function InfoDialog({ open, title, children, closeLabel, onClose }: InfoDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="info-dialog-backdrop" />
        <Dialog.Popup className="info-dialog">
          <Dialog.Title className="info-dialog-title">{title}</Dialog.Title>
          <div className="info-dialog-body">{children}</div>
          <div className="info-dialog-actions">
            <Dialog.Close className="button">{closeLabel}</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
