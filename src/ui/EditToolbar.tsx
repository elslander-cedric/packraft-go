import { strings } from "./strings";

type EditToolbarProps = {
  canUndo: boolean;
  canDeletePoint: boolean;
  onUndo: () => void;
  onDeletePoint: () => void;
};

/** Buttons for route edits that are not done on the map itself. */
export default function EditToolbar({ canUndo, canDeletePoint, onUndo, onDeletePoint }: EditToolbarProps) {
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
      <p className="edit-hint">{strings.editHint}</p>
    </div>
  );
}
