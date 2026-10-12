import { useState } from "react";
import type { Settings } from "@/core/settings";
import { NumberField } from "./components/NumberField";
import { strings } from "./strings";

export type SettingsPanelProps = {
  /** The settings as they are when the panel is first shown. */
  settings: Settings;
  /** The planner typed a value; the core decides whether it is usable. */
  onChange: (name: keyof Settings, value: number) => void;
};

type SettingFieldProps = {
  label: string;
  hint?: string;
  initialValue: number;
  step: number;
  onChange: (value: number) => void;
};

/** A number field that keeps what the planner types, even while it is not yet a usable value. */
function SettingField({ label, hint, initialValue, step, onChange }: SettingFieldProps) {
  const [value, setValue] = useState<number | null>(initialValue);
  const usable = value !== null && value > 0 && Number.isFinite(value);
  return (
    <NumberField
      label={label}
      hint={hint}
      defaultValue={initialValue}
      step={step}
      invalid={!usable}
      onValueChange={(next) => {
        setValue(next);
        // An empty field has no value to use.
        if (next !== null) onChange(next);
      }}
    />
  );
}

/** Edits the planner's pace factor and paddling speed. Renders settings; no domain logic. */
export default function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <section className="settings-panel" aria-label={strings.settingsPanelLabel}>
      <h2>{strings.settingsPanelLabel}</h2>
      <SettingField
        label={strings.paceFactorLabel}
        hint={strings.paceFactorHint}
        initialValue={settings.paceFactor}
        step={0.1}
        onChange={(value) => onChange("paceFactor", value)}
      />
      <SettingField
        label={strings.paddleSpeedLabel}
        initialValue={settings.paddleSpeedKmh}
        step={0.5}
        onChange={(value) => onChange("paddleSpeedKmh", value)}
      />
    </section>
  );
}
