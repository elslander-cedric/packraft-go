"use client";

import { useRef, useState } from "react";
import { todayInBrussels } from "@/core/calendarDate";
import type { FileError, PlannerAction, ReplaceQuestion } from "@/core/plannerSession";
import type { Settings } from "@/core/settings";
import type { Trip } from "@/core/trip";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Menu } from "../components/Menu";
import { TextEntryDialog } from "../components/TextEntryDialog";
import { Icon } from "../icons/Icon";
import { icons } from "../icons/icons";
import { strings } from "../strings";
import PhoneSettingsDialog from "./PhoneSettingsDialog";

const text = strings.phone.menu;

/** The questions asked before a trip with points is replaced, as on desktop. */
const confirmations = { newTrip: strings.newTripConfirm, openFile: strings.openFileConfirm } as const;

/** Which file the name dialog is asking the name for. */
type NamedFile = "save" | "export";

const nameDialogs = {
  save: { title: text.saveTitle, confirm: text.saveConfirm },
  export: { title: text.exportTitle, confirm: text.exportConfirm },
} as const;

export type PhoneMenuProps = {
  trip: Trip;
  question: ReplaceQuestion;
  /** Set while the replace question is open. */
  pendingTrip: Trip | null;
  fileError: FileError | null;
  dispatch: (action: PlannerAction) => void;
  saveFile: (name: string) => void;
  exportGpx: (name: string) => void;
  openFile: (file: File) => Promise<void>;
  /** Null until the settings are read in the browser. */
  settings: Settings | null;
  saveSettings: (settings: Settings) => void;
};

/**
 * The phone's floating menu top left (#124, ADR 0026): New trip, Save…, Open…,
 * Export GPX… and Settings… (#151), which opens the settings dialog. Save and Export ask for the trip name first, prefilled with
 * the current one. A new trip starts with today in Brussels as its start date.
 * New trip and Open… ask before losing points, as on desktop.
 */
export default function PhoneMenu({
  trip,
  question,
  pendingTrip,
  fileError,
  dispatch,
  saveFile,
  exportGpx,
  openFile,
  settings,
  saveSettings,
}: PhoneMenuProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  // The name dialog: which file it asks for (kept while it closes, so its title doesn't change) and whether it is open.
  const [naming, setNaming] = useState<NamedFile>("save");
  const [namingOpen, setNamingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const askName = (file: NamedFile) => {
    setNaming(file);
    setNamingOpen(true);
  };
  const confirmation = confirmations[question];
  const dialog = nameDialogs[naming];

  return (
    <>
      <Menu
        label={text.button}
        trigger={<Icon icon={icons.menu} />}
        triggerClassName="phone-fab"
        items={[
          { label: text.newTrip, onSelect: () => dispatch({ type: "newTrip", startDate: todayInBrussels(new Date()) }) },
          { label: text.saveFile, onSelect: () => askName("save") },
          { label: text.openFile, onSelect: () => fileInput.current?.click() },
          { label: text.exportGpx, onSelect: () => askName("export"), disabled: trip.legs.length === 0 },
          { label: text.settings, onSelect: () => setSettingsOpen(true) },
        ]}
      />
      {fileError && (
        <p role="alert" className="phone-message phone-message-alert">
          {fileError === "unknown-version" ? strings.openFileUnknownVersion : strings.openFileInvalid}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear the choice, so choosing the same file again still opens it.
          event.target.value = "";
          if (file) void openFile(file);
        }}
      />
      <TextEntryDialog
        open={namingOpen}
        title={dialog.title}
        label={strings.tripNameLabel}
        initialValue={trip.name}
        confirmLabel={dialog.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={(name) => {
          if (naming === "export") exportGpx(name);
          else saveFile(name);
          setNamingOpen(false);
        }}
        onCancel={() => setNamingOpen(false)}
      />
      {settings && (
        <PhoneSettingsDialog
          open={settingsOpen}
          settings={settings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <ConfirmDialog
        open={pendingTrip !== null}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => dispatch({ type: "confirmReplace" })}
        onCancel={() => dispatch({ type: "cancelReplace" })}
      />
    </>
  );
}
