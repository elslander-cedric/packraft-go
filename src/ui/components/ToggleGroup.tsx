import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";
import "./ToggleGroup.css";

export type ToggleOption<T extends string> = {
  value: T;
  /** The option's name: its text, or only its accessible name when it has an icon. */
  label: string;
  /** Shown instead of the label, for an icon-only toggle. */
  icon?: ReactNode;
  className?: string;
};

export type ToggleGroupProps<T extends string> = {
  /** Accessible name of the group. */
  label: string;
  /** The pressed option; exactly one is always pressed. */
  value: T;
  options: readonly ToggleOption<T>[];
  /** Called only when another option is pressed. */
  onChange: (value: T) => void;
  className?: string;
};

/**
 * A row of toggle buttons with exactly one pressed (Base UI Toggle Group, ADR 0020).
 * Arrow keys move between the options; Enter or Space presses one.
 */
export function ToggleGroup<T extends string>({ label, value, options, onChange, className }: ToggleGroupProps<T>) {
  return (
    <BaseToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(pressed) => {
        // Pressing the pressed option again would leave none pressed: keep it.
        const next = options.find((option) => option.value === pressed[0]);
        if (next && next.value !== value) onChange(next.value);
      }}
      className={className ? `toggle-group ${className}` : "toggle-group"}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={option.className ? `toggle ${option.className}` : "toggle"}
          aria-label={option.icon === undefined ? undefined : option.label}
        >
          {option.icon ?? option.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
