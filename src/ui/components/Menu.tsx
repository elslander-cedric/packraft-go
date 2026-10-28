import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Fragment, type ReactNode } from "react";
import "./Menu.css";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** A disabled item stays in the menu, so the menu keeps its shape. */
  disabled?: boolean;
  /** Drawn before the label, e.g. an icon. */
  icon?: ReactNode;
  /** Starts a new group: a divider above the item. */
  groupStart?: boolean;
};

export type MenuProps = {
  /** The trigger button's accessible name. */
  label: string;
  /** What the trigger button shows, e.g. an icon. */
  trigger: ReactNode;
  triggerClassName?: string;
  items: readonly MenuItem[];
};

/**
 * A button that opens a list of actions (Base UI Menu, ADR 0020). Choosing an
 * item closes the menu and runs it; Escape or a tap outside closes it. Items may
 * have an icon, and dividers only between groups.
 */
export function Menu({ label, trigger, triggerClassName, items }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger className={triggerClassName ? `button ${triggerClassName}` : "button"} aria-label={label}>
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="menu-positioner" side="bottom" align="start" sideOffset={4}>
          <BaseMenu.Popup className="menu">
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.groupStart && <BaseMenu.Separator className="menu-separator" />}
                <BaseMenu.Item className="menu-item" disabled={item.disabled} onClick={item.onSelect}>
                  {item.icon && <span className="menu-item-icon">{item.icon}</span>}
                  {item.label}
                </BaseMenu.Item>
              </Fragment>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
