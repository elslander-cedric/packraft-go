"use client";

import { useState } from "react";
import { isUsableSetting, type Settings } from "@/core/settings";
import { FormDialog } from "../components/FormDialog";
import SettingsPanel from "../SettingsPanel";
import { strings } from "../strings";

/** The values in the fields: null while one is empty. */
type Draft = Record<keyof Settings, number | null>;

export type PhoneSettingsDialogProps = {
  open: boolean;
  settings: Settings;
  /** Save, with every value usable. */
  onSave: (settings: Settings) => void;
  onClose: () => void;
};

/**
 * The phone's settings (#151): a dialog from the menu. What the planner types
 * is a draft; Save stores it, Cancel drops it. Save waits until every field
 * holds a usable value.
 */
export default function PhoneSettingsDialog({ open, settings, onSave, onClose }: PhoneSettingsDialogProps) {
  const [draft, setDraft] = useState<Draft>(settings);
  // Each opening starts from the stored settings again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(settings);
  }
  const { paceFactor, paddleSpeedKmh } = draft;
  const usable = isUsableSetting(paceFactor) && isUsableSetting(paddleSpeedKmh);

  return (
    <FormDialog
      open={open}
      title={strings.settingsPanelLabel}
      confirmLabel={strings.phone.menu.settingsConfirm}
      cancelLabel={strings.confirmCancel}
      confirmDisabled={!usable}
      onConfirm={() => {
        if (usable) onSave({ paceFactor, paddleSpeedKmh });
        onClose();
      }}
      onCancel={onClose}
    >
      <SettingsPanel
        settings={settings}
        onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
        heading={false}
      />
    </FormDialog>
  );
}
