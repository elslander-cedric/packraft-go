import { Switch as BaseSwitch } from "@base-ui/react/switch";
import "./Switch.css";

export type SwitchProps = {
  /** Visible label, also the switch's accessible name. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
};

/** An on/off switch with a visible label (Base UI Switch, ADR 0020). Space toggles it. */
export function Switch({ label, checked, onChange, className }: SwitchProps) {
  return (
    <label className={className ? `switch ${className}` : "switch"}>
      <BaseSwitch.Root checked={checked} onCheckedChange={(next) => onChange(next)} className="switch-root">
        <BaseSwitch.Thumb className="switch-thumb" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}
