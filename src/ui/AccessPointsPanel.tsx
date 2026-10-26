import { useRef, useState } from "react";
import { accessPointKinds, accessPointUses, type AccessPoint } from "@/core/accessPoints";
import { Button } from "./components/Button";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ToggleGroup } from "./components/ToggleGroup";
import { Toolbar, ToolbarButton } from "./components/Toolbar";
import { formatDayDate } from "./format";
import type { AccessPointsState } from "./useAccessPoints";
import { strings } from "./strings";
import "./AccessPointsPanel.css";

const text = strings.accessPoints;

const useOptions = accessPointUses.map((use) => ({ value: use, label: text.uses[use] }));
const kindOptions = accessPointKinds.map((kind) => ({ value: kind, label: text.kinds[kind] }));

/** Today's date in the browser's time zone, as "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Your access points (#55, ADR 0023): add one by clicking the map, export and
 * import them as a file, and edit or delete the one selected on the map.
 * Renders the state from `useAccessPoints`; the edits live in the core.
 */
export default function AccessPointsPanel({ access }: { access: AccessPointsState }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const toolbarAdd = useRef<HTMLButtonElement>(null);
  const { points, selected, placing, importMessage } = access;
  // The point waiting to be deleted until the planner answers the confirmation.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  return (
    <aside className="access-points-panel" aria-label={text.panelLabel}>
      <h2>{text.panelLabel}</h2>
      {access.savingPaused && (
        <p className="access-points-warning" role="alert">
          {access.savingPaused === "unknown-version" ? text.autosaveUnknownVersion : text.damagedNotBackedUp}
        </p>
      )}
      {access.backupKey && (
        <p className="access-points-warning" role="status">
          {text.damagedBackedUp(access.backupKey)}
        </p>
      )}
      <Toolbar label={text.toolbarLabel}>
        <ToolbarButton ref={toolbarAdd} onClick={access.togglePlacing} hint={text.addHint} pressed={placing}>
          {text.addButton}
        </ToolbarButton>
        <ToolbarButton
          onClick={access.exportFile}
          hint={text.exportHint}
          disabledReason={points.length === 0 ? text.exportDisabledReason : null}
        >
          {text.exportButton}
        </ToolbarButton>
        <ToolbarButton onClick={() => fileInput.current?.click()} hint={text.importHint}>
          {text.importButton}
        </ToolbarButton>
      </Toolbar>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear the choice, so choosing the same file again still imports it.
          event.target.value = "";
          if (file) void access.importFile(file);
        }}
      />
      <p className="access-points-status">{placing ? text.placingHint : text.count(points.length)}</p>
      {importMessage && (
        <p
          className={importMessage.kind === "error" ? "access-points-error" : "access-points-imported"}
          role={importMessage.kind === "error" ? "alert" : "status"}
        >
          {importMessage.text}
        </p>
      )}
      {selected && (
        <AccessPointDetails
          key={selected.id}
          point={selected}
          access={access}
          onDelete={() => setPendingDelete(selected.id)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={text.deleteConfirm.title}
        message={text.deleteConfirm.message}
        confirmLabel={text.deleteConfirm.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => {
          if (pendingDelete !== null) access.remove(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
        returnFocusTo={toolbarAdd}
      />
    </aside>
  );
}

/** The selected access point's details, editable (also used on the phone, #63). */
type AccessPointDetailsProps = {
  point: AccessPoint;
  access: AccessPointsState;
  onDelete: () => void;
  /** Says how to move the point; the phone has no how-to text (ADR 0026). */
  withMoveHint?: boolean;
};

export function AccessPointDetails({ point, access, onDelete, withMoveHint = true }: AccessPointDetailsProps) {
  const update = (changes: Parameters<AccessPointsState["update"]>[1]) => access.update(point.id, changes);
  const headingId = `access-point-${point.id}`;
  return (
    <section className="access-point-details" aria-labelledby={headingId}>
      <h3 id={headingId}>{text.detailsLabel}</h3>
      {withMoveHint && <p className="access-point-hint">{text.moveHint}</p>}
      <div className="access-point-field">
        <span>{text.useLabel}</span>
        <ToggleGroup label={text.useLabel} value={point.use} options={useOptions} onChange={(use) => update({ use })} />
      </div>
      <div className="access-point-field">
        <span>{text.kindLabel}</span>
        <ToggleGroup
          label={text.kindLabel}
          value={point.kind}
          options={kindOptions}
          onChange={(kind) => update({ kind })}
        />
      </div>
      <label className="access-point-field">
        <span>{text.noteLabel}</span>
        <textarea
          value={point.note}
          rows={2}
          placeholder={text.notePlaceholder}
          onChange={(event) => update({ note: event.target.value })}
        />
      </label>
      <div className="access-point-checked">
        <label className="access-point-field">
          <span>{text.checkedOnSiteLabel}</span>
          <input
            type="date"
            value={point.checkedOnSite ?? ""}
            // An empty value means the field was cleared (or holds no complete date yet).
            onChange={(event) => update({ checkedOnSite: event.target.value || null })}
          />
        </label>
        {point.checkedOnSite === null ? (
          <Button onClick={() => update({ checkedOnSite: today() })}>{text.checkedTodayButton}</Button>
        ) : (
          <Button onClick={() => update({ checkedOnSite: null })}>{text.notCheckedButton}</Button>
        )}
      </div>
      <p className="access-point-dates">
        {`${text.added(formatDayDate(point.createdAt.slice(0, 10)))}, ${text.changed(formatDayDate(point.updatedAt.slice(0, 10)))}`}
      </p>
      <div className="access-point-actions">
        <Button className="button-danger" onClick={onDelete}>
          {text.deleteButton}
        </Button>
        <Button onClick={() => access.select(null)}>{text.closeButton}</Button>
      </div>
    </section>
  );
}
