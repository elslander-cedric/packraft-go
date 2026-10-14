"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AccessPointDetails } from "../AccessPointsPanel";
import { strings } from "../strings";
import type { AccessPointsState } from "../useAccessPoints";
import type { LatLng } from "@/core/trip";
import type { MyPosition } from "./position";

const text = strings.phone;
const pointText = strings.accessPoints;

type Props = {
  access: AccessPointsState;
  position: MyPosition;
  /** Starts finding your position (asks for permission the first time). */
  showPosition: (onFirst?: (first: MyPosition) => void) => void;
};

/**
 * Your access points on the phone (#63, ADR 0023): mark one at your GPS
 * position (or, without it, by tapping the map), edit and delete them. Every
 * change is saved on the device at once by `useAccessPoints`, with or
 * without signal. The marker can be dragged on the map to correct it.
 */
export default function PhoneAccessPoints({ access, position, showPosition }: Props) {
  const { points, selected, placing } = access;
  // "Mark here" was pressed and is waiting for a position fix (or a failure).
  const [pendingMark, setPendingMark] = useState(false);
  // How accurate the GPS position was when the selected point was marked.
  const [accuracy, setAccuracy] = useState<{ id: string; m: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const markButton = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);

  // "Saved on this device" once the collection has changed (the hook saves on every change).
  const [seen, setSeen] = useState(points);
  const [changed, setChanged] = useState(false);
  if (points !== seen) {
    setSeen(points);
    setChanged(true);
  }

  // Bring the form into view when a point is selected.
  useEffect(() => {
    if (selected) details.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const markAt = (at: LatLng, accuracyM: number) => {
    const id = access.placeAt(at);
    setAccuracy({ id, m: accuracyM });
  };
  const mark = () => {
    if (position.state === "shown") {
      markAt(position.at, position.accuracyM);
      return;
    }
    setPendingMark(true);
    showPosition((first) => {
      setPendingMark(false);
      // Without a position, fall back to tapping the map.
      if (first.state === "shown") markAt(first.at, first.accuracyM);
      else access.startPlacing();
    });
  };

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

  return (
    <section className="phone-access-points" aria-label={text.accessPointsLabel}>
      <h2>{text.accessPointsLabel}</h2>
      <div className="phone-position">
        <Button ref={markButton} className="phone-button" onClick={mark} disabled={pendingMark}>
          {text.markButton}
        </Button>
        <p className="phone-position-explanation">{text.markExplanation}</p>
        {pendingMark && <p role="status">{text.markLocating}</p>}
        <Button className="phone-button" aria-pressed={placing} onClick={access.togglePlacing}>
          {text.tapToPlaceButton}
        </Button>
        {placing && (
          <p role="status">
            {position.state === "failed" ? `${text.tapToPlaceFallback} ` : ""}
            {text.tapToPlaceHint}
          </p>
        )}
      </div>
      {savedNote}
      {selected && (
        <div ref={details} className="phone-access-point-form">
          {accuracy?.id === selected.id && (
            <p className="phone-position-explanation">
              {text.markedAccuracy(`${Math.round(accuracy.m)} ${strings.metreUnit}`)}
            </p>
          )}
          <AccessPointDetails
            key={selected.id}
            point={selected}
            access={access}
            onDelete={() => setPendingDelete(selected.id)}
          />
        </div>
      )}
      {points.length === 0 ? (
        <p className="phone-position-explanation">{text.noAccessPoints}</p>
      ) : (
        <ul className="phone-access-point-list" aria-label={text.accessPointsLabel}>
          {points.map((point) => (
            <li key={point.id} className="phone-row">
              <span className="phone-row-heading">
                {text.listEntry(pointText.uses[point.use], pointText.kinds[point.kind])}
              </span>
              {point.note && <span>{point.note}</span>}
              <span className="phone-row-actions">
                <Button className="phone-button" onClick={() => access.select(point.id)}>
                  {text.editButton}
                </Button>
                <Button className="phone-button button-danger" onClick={() => setPendingDelete(point.id)}>
                  {text.deleteListButton}
                </Button>
              </span>
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
