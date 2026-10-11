import { useId, useState } from "react";
import type { Settings } from "@/core/settings";
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
  const [text, setText] = useState(String(initialValue));
  const id = useId();
  const usable = Number(text) > 0 && Number.isFinite(Number(text));
  return (
    <div className="setting">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={step}
        step={step}
        value={text}
        aria-invalid={!usable}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          onChange(Number(event.target.value));
        }}
      />
      {hint && (
        <p id={`${id}-hint`} className="setting-hint">
          {hint}
        </p>
      )}
    </div>
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
