"use client";

import { useState } from "react";
import { isUsableSetting, tripShapes, type TripShape, type TripWishes } from "@/core/settings";
import { FormDialog } from "../components/FormDialog";
import { NumberField } from "../components/NumberField";
import { ToggleGroup } from "../components/ToggleGroup";
import { strings } from "../strings";

const text = strings.planner.suggestedTrips;

/** What the fields hold: null while one is empty. */
type Draft = {
  hikeKm: number | null;
  paddleKm: number | null;
  maxSwitches: number | null;
  shape: TripShape;
  date: string;
};

const shapeOptions = tripShapes.map((shape) => ({ value: shape, label: text.shapeOptions[shape] }));
const isUsableKm = (km: number | null) => km === null || isUsableSetting(km);

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

/** The wishes, when every field holds one that can be used; an empty distance is no preference. */
function usableWishes({ hikeKm, paddleKm, maxSwitches, shape }: Draft): TripWishes | null {
  if (!isUsableKm(hikeKm) || !isUsableKm(paddleKm) || !isMaxSwitches(maxSwitches)) return null;
  return { ...(hikeKm !== null && { hikeKm }), ...(paddleKm !== null && { paddleKm }), maxSwitches, shape };
}

/**
 * Trip wishes (GLOSSARY) before Find trips: about how far to hike and to paddle, the most
 * switches, loop, one-way or either, and the date. Each opening starts from the remembered wishes and today.
 */
export default function TripWishesDialog({ open, wishes, today, onConfirm, onCancel }: TripWishesDialogProps) {
  const initial = (): Draft => ({
    hikeKm: wishes.hikeKm ?? null,
    paddleKm: wishes.paddleKm ?? null,
    maxSwitches: wishes.maxSwitches,
    shape: wishes.shape,
    date: today,
  });
  const [draft, setDraft] = useState<Draft>(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial());
  }
  const usable = usableWishes(draft);
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
          label={text.hikeKmLabel}
          hint={text.hikeKmHint}
          {...(wishes.hikeKm !== undefined && {
            defaultValue: wishes.hikeKm,
          })}
          step={0.5}
          invalid={!isUsableKm(draft.hikeKm)}
          onValueChange={(hikeKm) => setDraft((current) => ({ ...current, hikeKm }))}
        />
        <NumberField
          label={text.paddleKmLabel}
          hint={text.paddleKmHint}
          {...(wishes.paddleKm !== undefined && {
            defaultValue: wishes.paddleKm,
          })}
          step={0.5}
          invalid={!isUsableKm(draft.paddleKm)}
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
        <div className="planner-trip-wishes-shape">
          {/* The group is named by its own label; this is the same text for the eye. */}
          <span aria-hidden="true">{text.shapeLabel}</span>
          <ToggleGroup
            label={text.shapeLabel}
            value={draft.shape}
            options={shapeOptions}
            onChange={(shape) => setDraft((current) => ({ ...current, shape }))}
          />
        </div>
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
