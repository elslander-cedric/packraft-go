"use client";

import { useState } from "react";
import { isUsableSetting, type TripWishes } from "@/core/settings";
import { FormDialog } from "../components/FormDialog";
import { NumberField } from "../components/NumberField";
import { strings } from "../strings";

const text = strings.planner.suggestedTrips;

/** What the fields hold: null while one is empty. */
type Draft = {
  paddleKm: number | null;
  maxSwitches: number | null;
  date: string;
};

export type TripWishesDialogProps = {
  open: boolean;
  /** The remembered wishes, which the fields start from. */
  wishes: TripWishes;
  /** The date the fields start from: today. */
  today: string;
  /** Find trips, with usable wishes and a date. */
  onConfirm: (wishes: TripWishes, date: string) => void;
  onCancel: () => void;
};

const isMaxSwitches = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 0;

/** The wishes, when every field holds one that can be used; an empty paddle distance is no preference. */
function usableWishes(draft: Draft, shape: TripWishes["shape"]): TripWishes | null {
  const { paddleKm, maxSwitches } = draft;
  if (paddleKm !== null && !isUsableSetting(paddleKm)) return null;
  if (!isMaxSwitches(maxSwitches)) return null;
  return { ...(paddleKm !== null && { paddleKm }), maxSwitches, shape };
}

/**
 * Trip wishes (GLOSSARY) before Find trips: about how far to paddle, the most switches and the
 * date. Each opening starts from the remembered wishes and today.
 */
export default function TripWishesDialog({ open, wishes, today, onConfirm, onCancel }: TripWishesDialogProps) {
  const initial = (): Draft => ({
    paddleKm: wishes.paddleKm ?? null,
    maxSwitches: wishes.maxSwitches,
    date: today,
  });
  const [draft, setDraft] = useState<Draft>(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial());
  }
  const usable = usableWishes(draft, wishes.shape);
  const ready = usable !== null && draft.date !== "";

  return (
    <FormDialog
      open={open}
      title={text.wishesTitle}
      confirmLabel={text.confirm}
      cancelLabel={strings.confirmCancel}
      confirmDisabled={!ready}
      onConfirm={() => usable && onConfirm(usable, draft.date)}
      onCancel={onCancel}
    >
      <div className="planner-trip-wishes">
        <NumberField
          label={text.paddleKmLabel}
          hint={text.paddleKmHint}
          {...(wishes.paddleKm !== undefined && {
            defaultValue: wishes.paddleKm,
          })}
          step={0.5}
          invalid={draft.paddleKm !== null && !isUsableSetting(draft.paddleKm)}
          onValueChange={(paddleKm) => setDraft((current) => ({ ...current, paddleKm }))}
        />
        <NumberField
          label={text.maxSwitchesLabel}
          hint={text.maxSwitchesHint}
          defaultValue={wishes.maxSwitches}
          step={1}
          invalid={!isMaxSwitches(draft.maxSwitches)}
          onValueChange={(maxSwitches) => setDraft((current) => ({ ...current, maxSwitches }))}
        />
        <label>
          <span>{text.dateLabel}</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
          />
        </label>
      </div>
    </FormDialog>
  );
}
