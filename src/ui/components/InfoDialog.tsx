import { Dialog } from "@base-ui/react/dialog";
import { useRef, type ReactNode } from "react";
import "./Dialog.css";
import "./InfoDialog.css";
import { useVisibleArea } from "./visibleArea";

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
  const popup = useRef<HTMLDivElement>(null);
  const area = useVisibleArea(open, popup);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        {/* Focus goes to the dialog, not its first link: that would scroll a long body past its top. */}
        <Dialog.Popup ref={popup} initialFocus={popup} className="dialog info-dialog" style={area}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <div className="info-dialog-body">{children}</div>
          <div className="dialog-actions">
            <Dialog.Close className="button">{closeLabel}</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
