import { strings } from "./strings";

type EditToolbarProps = {
  canUndo: boolean;
  canDeletePoint: boolean;
  /** Whether the selected point is a camp; null when no point is selected. */
  selectedPointIsCamp: boolean | null;
  onUndo: () => void;
  onDeletePoint: () => void;
  onToggleCamp: () => void;
};

/** Buttons for route edits that are not done on the map itself. */
export default function EditToolbar({
  canUndo,
  canDeletePoint,
  selectedPointIsCamp,
  onUndo,
  onDeletePoint,
  onToggleCamp,
}: EditToolbarProps) {
  return (
    <div className="edit-toolbar" role="toolbar" aria-label={strings.toolbarLabel}>
      <button type="button" onClick={onUndo} disabled={!canUndo} title={strings.undoShortcut}>
        {strings.undoButton}
      </button>
      <button
        type="button"
        onClick={onDeletePoint}
        disabled={!canDeletePoint}
        title={strings.deletePointShortcut}
      >
        {strings.deletePointButton}
      </button>
      <button
        type="button"
        className="camp-toggle"
        onClick={onToggleCamp}
        disabled={selectedPointIsCamp === null}
        aria-pressed={selectedPointIsCamp ?? false}
        title={strings.campButtonHint}
      >
        {strings.campButton}
      </button>
      <p className="edit-hint">{strings.editHint}</p>
    </div>
  );
}
