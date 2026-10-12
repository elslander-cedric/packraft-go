import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { Tooltip } from "@base-ui/react/tooltip";
import { useId, type ReactNode, type Ref } from "react";
import "./Button.css";
import "./Toolbar.css";

export type ToolbarProps = {
  /** Accessible name of the toolbar. */
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * A row of buttons with a single Tab stop; arrow keys move between them
 * (Base UI Toolbar, ADR 0020).
 */
export function Toolbar({ label, className, children }: ToolbarProps) {
  return (
    <Tooltip.Provider>
      <BaseToolbar.Root aria-label={label} className={className ? `toolbar ${className}` : "toolbar"}>
        {children}
      </BaseToolbar.Root>
    </Tooltip.Provider>
  );
}

export type ToolbarButtonProps = {
  onClick: () => void;
  /** What the button does; shown in its tooltip and given as its description. */
  hint: string;
  /**
   * Set when the button can't be used right now: why. It replaces the hint in
   * the tooltip and the description. The button stays focusable, so keyboard
   * users can reach it and hear the reason.
   */
  disabledReason?: string | null;
  /** For on/off buttons: whether it is on. */
  pressed?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
};

/** A toolbar button with a tooltip (Base UI Toolbar.Button and Tooltip, ADR 0020). */
export function ToolbarButton({ onClick, hint, disabledReason, pressed, className, ref, children }: ToolbarButtonProps) {
  const descriptionId = useId();
  const disabled = Boolean(disabledReason);
  const description = disabledReason || hint;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        ref={ref}
        render={
          <BaseToolbar.Button
            className={className ? `button ${className}` : "button"}
            disabled={disabled}
            aria-pressed={pressed}
            aria-describedby={descriptionId}
            onClick={onClick}
          />
        }
      >
        {children}
      </Tooltip.Trigger>
      <span id={descriptionId} className="visually-hidden">
        {description}
      </span>
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={6} className="tooltip-positioner">
          <Tooltip.Popup role="tooltip" className="tooltip">
            {description}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
