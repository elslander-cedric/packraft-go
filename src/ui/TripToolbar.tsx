import { useRef } from "react";
import { strings } from "./strings";

type TripToolbarProps = {
  name: string;
  /** Message to show when the last file could not be opened, or null. */
  fileError: string | null;
  onRename: (name: string) => void;
  onNewTrip: () => void;
  onSaveFile: () => void;
  onOpenFile: (file: File) => void;
};

/** The trip's name and actions on the whole trip. */
export default function TripToolbar({ name, fileError, onRename, onNewTrip, onSaveFile, onOpenFile }: TripToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFile = () => {
    fileInput.current?.click();
  };
  return (
    <div className="trip-toolbar" role="toolbar" aria-label={strings.tripToolbarLabel}>
      <label className="trip-name">
        <span>{strings.tripNameLabel}</span>
        <input
          type="text"
          value={name}
          placeholder={strings.tripNamePlaceholder}
          onChange={(event) => onRename(event.target.value)}
        />
      </label>
      <button type="button" onClick={onNewTrip} title={strings.newTripHint}>
        {strings.newTripButton}
      </button>
      <button type="button" onClick={onSaveFile} title={strings.saveFileHint}>
        {strings.saveFileButton}
      </button>
      <button type="button" onClick={chooseFile} title={strings.openFileHint}>
        {strings.openFileButton}
      </button>
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
