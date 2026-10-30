"use client";

import { useState } from "react";
import { isUsableSetting, type PaceSetting, type Settings } from "@/core/settings";
import { FormDialog } from "../components/FormDialog";
import { NumberField } from "../components/NumberField";
import { strings } from "../strings";

/** The values in the fields: null while one is empty. */
type Draft = Record<PaceSetting, number | null>;

type SettingFieldProps = {
  label: string;
  hint?: string;
  initialValue: number;
  step: number;
  onChange: (value: number | null) => void;
};

/** A number field that keeps what the planner types, even while it is not yet a usable value. */
function SettingField({ label, hint, initialValue, step, onChange }: SettingFieldProps) {
  const [value, setValue] = useState<number | null>(initialValue);
  const usable = isUsableSetting(value);
  return (
    <NumberField
      label={label}
      hint={hint}
      defaultValue={initialValue}
      step={step}
      invalid={!usable}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

export type SettingsDialogProps = {
  open: boolean;
  settings: Settings;
  /** Save, with every value usable. */
  onSave: (settings: Settings) => void;
  onClose: () => void;
};

/**
 * The planner's pace factor and paddling speed (#151): a dialog from the menu. What the planner types
 * is a draft; Save stores it, Cancel drops it. Save waits until every field
 * holds a usable value.
 */
export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<Draft>(settings);
  // Each opening starts from the stored settings again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(settings);
  }
  const change = (name: PaceSetting, value: number | null) => setDraft((current) => ({ ...current, [name]: value }));
  const { paceFactor, paddleSpeedKmh } = draft;
  const usable = isUsableSetting(paceFactor) && isUsableSetting(paddleSpeedKmh);

  return (
    <FormDialog
      open={open}
      title={strings.settingsPanelLabel}
      confirmLabel={strings.planner.menu.settingsConfirm}
      cancelLabel={strings.confirmCancel}
      confirmDisabled={!usable}
      onConfirm={() => {
        if (usable) onSave({ ...settings, paceFactor, paddleSpeedKmh });
        onClose();
      }}
      onCancel={onClose}
    >
      <section className="settings-panel" aria-label={strings.settingsPanelLabel}>
        <SettingField
          label={strings.paceFactorLabel}
          hint={strings.paceFactorHint}
          initialValue={settings.paceFactor}
          step={0.1}
          onChange={(value) => change("paceFactor", value)}
        />
        <SettingField
          label={strings.paddleSpeedLabel}
          initialValue={settings.paddleSpeedKmh}
          step={0.5}
          onChange={(value) => change("paddleSpeedKmh", value)}
        />
      </section>
    </FormDialog>
  );
}
