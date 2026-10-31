"use client";

import { useState } from "react";
import { updateAccessPoint, type AccessPoint, type AccessPointChanges } from "@/core/accessPoints";
import { AccessPointDetails } from "./AccessPointDetails";
import { FormDialog } from "../components/FormDialog";
import { strings } from "../strings";

export type AccessPointDialogProps = {
  /** The point being edited, or null while the dialog is closed. */
  point: AccessPoint | null;
  /** Save, with only the fields the planner changed. */
  onSave: (id: string, changes: AccessPointChanges) => void;
  onClose: () => void;
};

/**
 * An access point's details: a dialog from a row's edit button,
 * or opened for each new point. What the planner changes is a draft; Save
 * stores only the changed fields, so a default name that arrives meanwhile
 * (ADR 0027) is not overwritten. Cancel drops the draft.
 */
export default function AccessPointDialog({ point, onSave, onClose }: AccessPointDialogProps) {
  const [draft, setDraft] = useState<AccessPointChanges>({});
  // Each opening, or another point, starts from the stored point again.
  const [editing, setEditing] = useState(point?.id ?? null);
  if ((point?.id ?? null) !== editing) {
    setEditing(point?.id ?? null);
    setDraft({});
  }
  // The point as it will be saved: the stored point with the draft on top.
  const shown = point && updateAccessPoint([point], point.id, draft, point.updatedAt)[0];

  return (
    <FormDialog
      open={point !== null}
      title={strings.planner.accessPointDialogTitle}
      confirmLabel={strings.planner.accessPointSave}
      cancelLabel={strings.confirmCancel}
      onConfirm={() => {
        if (point && Object.keys(draft).length > 0) onSave(point.id, draft);
        onClose();
      }}
      onCancel={onClose}
    >
      {shown && (
        <div className="planner-access-point-form">
          <AccessPointDetails
            key={shown.id}
            point={shown}
            onChange={(changes) => setDraft((current) => ({ ...current, ...changes }))}
          />
        </div>
      )}
    </FormDialog>
  );
}
