import { Toolbar, ToolbarButton } from "./components/Toolbar";
import { strings } from "./strings";

type EditToolbarProps = {
  canUndo: boolean;
  /** Why Back to start is unavailable, or null when it is available. */
  backToStartDisabledReason: string | null;
  canDeletePoint: boolean;
  /** Whether the selected point is a camp; null when no point is selected. */
  selectedPointIsCamp: boolean | null;
  onUndo: () => void;
  onBackToStart: () => void;
  onDeletePoint: () => void;
  onToggleCamp: () => void;
};

/** Buttons for route edits that are not done on the map itself. */
export default function EditToolbar({
  canUndo,
  backToStartDisabledReason,
  canDeletePoint,
  selectedPointIsCamp,
  onUndo,
  onBackToStart,
  onDeletePoint,
  onToggleCamp,
}: EditToolbarProps) {
  return (
    <div className="edit-toolbar">
      <Toolbar label={strings.toolbarLabel}>
        <ToolbarButton
          onClick={onUndo}
          hint={strings.undoShortcut}
          disabledReason={canUndo ? null : strings.undoDisabledReason}
        >
          {strings.undoButton}
        </ToolbarButton>
        <ToolbarButton onClick={onBackToStart} hint={strings.backToStartHint} disabledReason={backToStartDisabledReason}>
          {strings.backToStartButton}
        </ToolbarButton>
        <ToolbarButton
          onClick={onDeletePoint}
          hint={strings.deletePointShortcut}
          disabledReason={canDeletePoint ? null : strings.deletePointDisabledReason}
        >
          {strings.deletePointButton}
        </ToolbarButton>
        <ToolbarButton
          className="camp-toggle"
          onClick={onToggleCamp}
          pressed={selectedPointIsCamp ?? false}
          hint={strings.campButtonHint}
          disabledReason={selectedPointIsCamp === null ? strings.campDisabledReason : null}
        >
          {strings.campButton}
        </ToolbarButton>
      </Toolbar>
      <p className="edit-hint">{strings.editHint}</p>
    </div>
  );
}
