"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AccessPointDetails } from "../AccessPointsPanel";
import { strings } from "../strings";
import type { AccessPointsState } from "../useAccessPoints";
import type { MarkAccessPoint } from "./useMarkAccessPoint";

const text = strings.phone;
const pointText = strings.accessPoints;

type Props = {
  access: AccessPointsState;
  marking: MarkAccessPoint;
  /** Your access points changed since the planner opened (each change is saved at once). */
  changed: boolean;
  /** A row was tapped: show that access point on the map and open its details. */
  onOpen: (id: string) => void;
};

/**
 * The phone planner's Access points tab (#119, ADR 0026): "Mark here" at the
 * top, the selected point's details, and your list. Every change is saved on
 * the device at once by `useAccessPoints`, with or without signal.
 */
export default function PhoneAccessPoints({ access, marking, changed, onOpen }: Props) {
  const { points, selected } = access;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const markButton = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);

  // Bring the details into view when a point is selected.
  useEffect(() => {
    if (selected) details.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const savedNote =
    access.savingPaused === null ? (
      changed && (
        <p role="status" className="phone-saved">
          {text.savedOnDevice}
        </p>
      )
    ) : (
      <p role="alert" className="phone-position-alert">
        {access.savingPaused === "unknown-version" ? pointText.autosaveUnknownVersion : pointText.damagedNotBackedUp}
      </p>
    );
  const accuracy = selected ? marking.accuracyOf(selected.id) : null;

  return (
    <section className="phone-access-points" aria-label={text.accessPointsLabel}>
      <div className="phone-position">
        <Button ref={markButton} className="phone-button" onClick={marking.mark} disabled={marking.locating}>
          {text.markHereButton}
        </Button>
      </div>
      {savedNote}
      {selected && (
        <div ref={details} className="phone-access-point-form">
          {accuracy !== null && (
            <p className="phone-position-explanation">
              {text.markedAccuracy(`${Math.round(accuracy)} ${strings.metreUnit}`)}
            </p>
          )}
          <AccessPointDetails
            key={selected.id}
            point={selected}
            access={access}
            onDelete={() => setPendingDelete(selected.id)}
            withMoveHint={false}
          />
        </div>
      )}
      {points.length === 0 ? (
        <p className="phone-empty">{text.noAccessPoints}</p>
      ) : (
        <ul className="phone-access-point-list" aria-label={text.accessPointsLabel}>
          {points.map((point) => (
            <li key={point.id}>
              <Button
                className="phone-row phone-access-point-row"
                aria-current={point.id === selected?.id || undefined}
                onClick={() => onOpen(point.id)}
              >
                <span className="phone-row-heading">
                  {text.listEntry(pointText.uses[point.use], pointText.kinds[point.kind])}
                </span>
                {point.note && <span>{point.note}</span>}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pointText.deleteConfirm.title}
        message={pointText.deleteConfirm.message}
        confirmLabel={pointText.deleteConfirm.confirm}
        cancelLabel={strings.confirmCancel}
        onConfirm={() => {
          if (pendingDelete !== null) access.remove(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
        returnFocusTo={markButton}
      />
    </section>
  );
}
