import { useRef, type Ref } from "react";
import { Button } from "./components/Button";
import { Toolbar, ToolbarButton } from "./components/Toolbar";
import { strings } from "./strings";

type TripToolbarProps = {
  name: string;
  /** The trip's start date ("YYYY-MM-DD"), or undefined for an undated trip. */
  startDate: string | undefined;
  /** Message to show when the last file could not be opened, or null. */
  fileError: string | null;
  onRename: (name: string) => void;
  /** Called with the chosen date, or undefined when the date is cleared. */
  onSetStartDate: (date: string | undefined) => void;
  onNewTrip: () => void;
  onSaveFile: () => void;
  /** Null while there is nothing to export (no legs). */
  onExportGpx: (() => void) | null;
  onOpenFile: (file: File) => void;
  /** The New trip and Open file buttons, so focus can return to them after a confirmation. */
  newTripButtonRef?: Ref<HTMLButtonElement>;
  openFileButtonRef?: Ref<HTMLButtonElement>;
};

/** The trip's name and actions on the whole trip. */
export default function TripToolbar({
  name,
  startDate,
  fileError,
  onRename,
  onSetStartDate,
  onNewTrip,
  onSaveFile,
  onExportGpx,
  onOpenFile,
  newTripButtonRef,
  openFileButtonRef,
}: TripToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFile = () => fileInput.current?.click();
  return (
    <div className="trip-toolbar">
      {/* The name is outside the toolbar: in a toolbar the arrow keys move between buttons, not the text cursor. */}
      <label className="trip-name">
        <span>{strings.tripNameLabel}</span>
        <input
          type="text"
          value={name}
          placeholder={strings.tripNamePlaceholder}
          onChange={(event) => onRename(event.target.value)}
        />
      </label>
      <div className="trip-start-date">
        <label>
          <span>{strings.startDateLabel}</span>
          <input
            type="date"
            value={startDate ?? ""}
            // An empty value means the field was cleared (or holds no complete date yet).
            onChange={(event) => onSetStartDate(event.target.value || undefined)}
          />
        </label>
        {startDate !== undefined && (
          <Button onClick={() => onSetStartDate(undefined)}>{strings.clearStartDateButton}</Button>
        )}
      </div>
      <Toolbar label={strings.tripToolbarLabel}>
        <ToolbarButton ref={newTripButtonRef} onClick={onNewTrip} hint={strings.newTripHint}>
          {strings.newTripButton}
        </ToolbarButton>
        <ToolbarButton onClick={onSaveFile} hint={strings.saveFileHint}>
          {strings.saveFileButton}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onExportGpx?.()}
          hint={strings.exportGpxHint}
          disabledReason={onExportGpx ? null : strings.exportGpxDisabledReason}
        >
          {strings.exportGpxButton}
        </ToolbarButton>
        <ToolbarButton ref={openFileButtonRef} onClick={chooseFile} hint={strings.openFileHint}>
          {strings.openFileButton}
        </ToolbarButton>
      </Toolbar>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear the choice, so choosing the same file again still opens it.
          event.target.value = "";
          if (file) onOpenFile(file);
        }}
      />
      {fileError && (
        <p className="file-error" role="alert">
          {fileError}
        </p>
      )}
    </div>
  );
}
