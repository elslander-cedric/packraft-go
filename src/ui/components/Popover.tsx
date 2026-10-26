import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import "./Popover.css";

export type PopoverProps = {
  /** What the trigger button shows. */
  trigger: ReactNode;
  /** The trigger button's accessible name, when its content isn't. */
  triggerLabel?: string;
  triggerClassName?: string;
  /** Accessible name of the popup. */
  label: string;
  children: ReactNode;
};

/**
 * A button that opens a small panel next to it (Base UI Popover, ADR 0020).
 * Escape or a tap outside closes it.
 */
export function Popover({ trigger, triggerLabel, triggerClassName, label, children }: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger
        className={triggerClassName ? `button ${triggerClassName}` : "button"}
        aria-label={triggerLabel}
      >
        {trigger}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner className="popover-positioner" side="bottom" align="center" sideOffset={4}>
          <BasePopover.Popup className="popover" aria-label={label}>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
