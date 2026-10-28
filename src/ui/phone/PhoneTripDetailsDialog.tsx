"use client";

import { useState } from "react";
import { Button } from "../components/Button";
import { FormDialog } from "../components/FormDialog";
import { strings } from "../strings";

type Draft = { name: string; startDate: string | undefined };

export type PhoneTripDetailsDialogProps = {
  open: boolean;
  name: string;
  /** The trip's start date ("YYYY-MM-DD"), or undefined for an undated trip. */
  startDate: string | undefined;
  onRename: (name: string) => void;
  /** Called with the chosen date, or undefined when the date is cleared. */
  onSetStartDate: (date: string | undefined) => void;
  onClose: () => void;
};

/**
 * The trip's name and start date on the phone (#154): a dialog from the menu,
 * in place of the Trip tab. What the planner types is a draft; Save applies
 * only what changed, Cancel drops it.
 */
export default function PhoneTripDetailsDialog({
  open,
  name,
  startDate,
  onRename,
  onSetStartDate,
  onClose,
}: PhoneTripDetailsDialogProps) {
  const [draft, setDraft] = useState<Draft>({ name, startDate });
  // Each opening starts from the trip again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft({ name, startDate });
  }

  return (
    <FormDialog
      open={open}
      title={strings.phone.menu.tripDetailsTitle}
      confirmLabel={strings.phone.menu.tripDetailsConfirm}
      cancelLabel={strings.confirmCancel}
      onConfirm={() => {
        if (draft.name !== name) onRename(draft.name);
        if (draft.startDate !== startDate) onSetStartDate(draft.startDate);
        onClose();
      }}
      onCancel={onClose}
    >
      <div className="phone-trip-details">
        <label>
          <span>{strings.tripNameLabel}</span>
          <input
            type="text"
            value={draft.name}
            placeholder={strings.tripNamePlaceholder}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <div className="phone-start-date">
          <label>
            <span>{strings.startDateLabel}</span>
            <input
              type="date"
              value={draft.startDate ?? ""}
              // An empty value means the field was cleared (or holds no complete date yet).
              onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value || undefined }))}
            />
          </label>
          {draft.startDate !== undefined && (
            <Button
              className="phone-button"
              onClick={() => setDraft((current) => ({ ...current, startDate: undefined }))}
            >
              {strings.clearStartDateButton}
            </Button>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
