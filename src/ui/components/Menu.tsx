import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Fragment, type ReactNode } from "react";
import "./Menu.css";

type Grouped = {
  /** Starts a new group: a divider above the item. */
  groupStart?: boolean;
};

/** An action: choosing it runs it. */
export type MenuItem = Grouped & {
  label: string;
  onSelect: () => void;
  /** A disabled item stays in the menu, so the menu keeps its shape. */
  disabled?: boolean;
  /** Drawn before the label, e.g. an icon. */
  icon?: ReactNode;
};

/** A choice of one value among several, the current one marked. */
export type MenuChoice = Grouped & {
  /** The group's accessible name. */
  label: string;
  choices: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

/** Something to turn on or off, drawn as a switch. */
export type MenuToggle = Grouped & {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export type MenuEntry = MenuItem | MenuChoice | MenuToggle;

export type MenuProps = {
  /** The trigger button's accessible name. */
  label: string;
  /** What the trigger button shows, e.g. an icon. */
  trigger: ReactNode;
  triggerClassName?: string;
  items: readonly MenuEntry[];
  /** Where the menu opens next to its button: below and left-aligned unless said otherwise. */
  side?: "top" | "bottom";
  align?: "start" | "end";
};

function Entry({ item }: { item: MenuEntry }) {
  if ("choices" in item)
    return (
      <BaseMenu.RadioGroup aria-label={item.label} value={item.value} onValueChange={(value: string) => item.onChange(value)}>
        {item.choices.map((choice) => (
          <BaseMenu.RadioItem key={choice.value} className="menu-item" value={choice.value} closeOnClick>
            <span className="menu-item-icon">
              <BaseMenu.RadioItemIndicator className="menu-radio-mark" />
            </span>
            {choice.label}
          </BaseMenu.RadioItem>
        ))}
      </BaseMenu.RadioGroup>
    );
  if ("checked" in item)
    return (
      <BaseMenu.CheckboxItem
        className="menu-item menu-toggle"
        checked={item.checked}
        onCheckedChange={(checked) => item.onChange(checked)}
        closeOnClick
      >
        {/* An empty icon slot, so the label lines up with the choices' labels. */}
        <span className="menu-item-icon" />
        <span className="menu-toggle-label">{item.label}</span>
        <span className="menu-toggle-track" aria-hidden>
          <span className="menu-toggle-thumb" />
        </span>
      </BaseMenu.CheckboxItem>
    );
  return (
    <BaseMenu.Item className="menu-item" disabled={item.disabled} onClick={item.onSelect}>
      {item.icon && <span className="menu-item-icon">{item.icon}</span>}
      {item.label}
    </BaseMenu.Item>
  );
}

/**
 * A button that opens a list (Base UI Menu, ADR 0020). It can hold actions, a choice of
 * one value among several and on/off toggles. Choosing an entry closes the menu and runs
 * it; Escape or a tap outside closes it. Actions may have an icon, and dividers only
 * between groups.
 */
export function Menu({ label, trigger, triggerClassName, items, side = "bottom", align = "start" }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger className={triggerClassName ? `button ${triggerClassName}` : "button"} aria-label={label}>
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="menu-positioner" side={side} align={align} sideOffset={4}>
          <BaseMenu.Popup className="menu">
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.groupStart && <BaseMenu.Separator className="menu-separator" />}
                <Entry item={item} />
              </Fragment>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
